import type { Difficulty } from '../config/balance';
import { ALBUM_PAGES, GOLD_REWARD_ID } from '../config/stickers';

/**
 * localStorage-Persistenz mit Versionsfeld, Shape-Guard und
 * In-Memory-Fallback (Safari privat / Quota / blockierte Cookies).
 * Es wird NIE im Frame-Loop gespeichert — nur bei Run-Ende,
 * Shop-Kauf und Settings-Aenderung.
 *
 * PROFILE (v2): Eine Registry (`neon-arena-profiles`) haelt die Spielerliste
 * und das aktive Profil; pro Profil liegt ein eigener Payload-Key
 * (`neon-arena-save:<id>`) im bewaehrten SaveData-Format. Der alte
 * Einzel-Key `neon-arena-save` wird beim ersten Start zu "Spieler 1" migriert.
 */

const LEGACY_SAVE_KEY = 'neon-arena-save';
const PROFILES_KEY = 'neon-arena-profiles';
const PROFILE_PREFIX = 'neon-arena-save:';
export const MAX_PROFILES = 8;
export const MAX_PROFILE_NAME_LEN = 16;

export interface SaveSettings {
  autoAim: boolean;
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  muted: boolean;
  reduceFx: boolean;
  damageNumbers: boolean;
  /** Gamepad-Rumble. */
  vibration: boolean;
  difficulty: Difficulty;
  heroId: string;
  /** 'default' = Startwaffe des Helden, sonst 'laser' | 'star'. */
  weaponId: string;
  /** Farbvariante der Figur ('default' = Heldenfarbe), aus dem Sticker-Album. */
  colorwayId: string;
}

export interface SaveData {
  version: 1;
  cores: number;
  bestScores: Record<Difficulty, number>;
  bestWaves: Record<Difficulty, number>;
  /** Koop-Bestwerte (getrennt vom Solo — fairer Vergleich). */
  bestScoresCoop: Record<Difficulty, number>;
  bestWavesCoop: Record<Difficulty, number>;
  unlockedHeroes: string[];
  unlockedWeapons: string[];
  permaUpgrades: Record<string, number>;
  hardUnlocked: boolean;
  seenControls: boolean;
  tutorialDone: string[];
  settings: SaveSettings;
  stats: { totalKills: number; totalRuns: number };
  dailyBest: { date: string; score: number } | null;
  /** Sticker-Album: stickerId -> Unlock-Zeitpunkt (ISO, fuer NEU-Badges). */
  stickers: Record<string, string>;
  /** Kumulative Album-Zaehler (cores, crits, boss:<id>, ...). */
  stickerCounters: Record<string, number>;
  /** Abgeholte Seiten-Belohnungen (Page-IDs + 'gold'). */
  stickerPageRewards: string[];
  /** Freigeschaltete Farbvarianten. */
  unlockedColorways: string[];
  /** Letzter Album-Besuch (ISO) — steuert die NEU-Badges. */
  lastAlbumSeen: string;
}

export interface ProfileMeta {
  id: string;
  name: string;
  createdAt: number;
}

interface ProfileRegistry {
  version: 2;
  activeId: string;
  profiles: ProfileMeta[];
}

function defaults(): SaveData {
  return {
    version: 1,
    cores: 0,
    bestScores: { easy: 0, normal: 0, hard: 0 },
    bestWaves: { easy: 0, normal: 0, hard: 0 },
    bestScoresCoop: { easy: 0, normal: 0, hard: 0 },
    bestWavesCoop: { easy: 0, normal: 0, hard: 0 },
    unlockedHeroes: ['volt'],
    unlockedWeapons: [],
    permaUpgrades: {},
    hardUnlocked: false,
    seenControls: false,
    tutorialDone: [],
    settings: {
      autoAim: true,
      masterVolume: 0.5,
      sfxVolume: 0.8,
      musicVolume: 0.5,
      muted: false,
      reduceFx: false,
      damageNumbers: true,
      vibration: true,
      difficulty: 'normal',
      heroId: 'volt',
      weaponId: 'default',
      colorwayId: 'default',
    },
    stats: { totalKills: 0, totalRuns: 0 },
    dailyBest: null,
    stickers: {},
    stickerCounters: {},
    stickerPageRewards: [],
    unlockedColorways: [],
    lastAlbumSeen: '',
  };
}

function isDifficulty(v: unknown): v is Difficulty {
  return v === 'easy' || v === 'normal' || v === 'hard';
}

/** Fuellt fehlende/falsche Felder mit Defaults auf — kein Crash bei kaputtem Save. */
function sanitize(raw: unknown): SaveData {
  const d = defaults();
  if (typeof raw !== 'object' || raw === null) return d;
  const r = raw as Record<string, unknown>;

  if (typeof r.cores === 'number' && isFinite(r.cores)) d.cores = Math.max(0, Math.floor(r.cores));
  for (const key of ['easy', 'normal', 'hard'] as const) {
    const bs = (r.bestScores as Record<string, unknown> | undefined)?.[key];
    if (typeof bs === 'number' && isFinite(bs)) d.bestScores[key] = Math.max(0, bs);
    const bw = (r.bestWaves as Record<string, unknown> | undefined)?.[key];
    if (typeof bw === 'number' && isFinite(bw)) d.bestWaves[key] = Math.max(0, bw);
    const cs = (r.bestScoresCoop as Record<string, unknown> | undefined)?.[key];
    if (typeof cs === 'number' && isFinite(cs)) d.bestScoresCoop[key] = Math.max(0, cs);
    const cw = (r.bestWavesCoop as Record<string, unknown> | undefined)?.[key];
    if (typeof cw === 'number' && isFinite(cw)) d.bestWavesCoop[key] = Math.max(0, cw);
  }
  if (Array.isArray(r.unlockedHeroes)) {
    d.unlockedHeroes = r.unlockedHeroes.filter((h): h is string => typeof h === 'string');
    if (!d.unlockedHeroes.includes('volt')) d.unlockedHeroes.push('volt');
  }
  if (Array.isArray(r.unlockedWeapons)) {
    d.unlockedWeapons = r.unlockedWeapons.filter((w): w is string => typeof w === 'string');
  }
  if (typeof r.permaUpgrades === 'object' && r.permaUpgrades !== null) {
    for (const [k, v] of Object.entries(r.permaUpgrades as Record<string, unknown>)) {
      if (typeof v === 'number' && isFinite(v) && v > 0) d.permaUpgrades[k] = Math.floor(v);
    }
  }
  if (typeof r.hardUnlocked === 'boolean') d.hardUnlocked = r.hardUnlocked;
  if (typeof r.seenControls === 'boolean') d.seenControls = r.seenControls;
  if (Array.isArray(r.tutorialDone)) {
    d.tutorialDone = r.tutorialDone.filter((t): t is string => typeof t === 'string');
  }
  if (typeof r.settings === 'object' && r.settings !== null) {
    const s = r.settings as Record<string, unknown>;
    if (typeof s.autoAim === 'boolean') d.settings.autoAim = s.autoAim;
    for (const vol of ['masterVolume', 'sfxVolume', 'musicVolume'] as const) {
      const v = s[vol];
      if (typeof v === 'number' && isFinite(v)) d.settings[vol] = Math.min(1, Math.max(0, v));
    }
    if (typeof s.muted === 'boolean') d.settings.muted = s.muted;
    if (typeof s.reduceFx === 'boolean') d.settings.reduceFx = s.reduceFx;
    if (typeof s.damageNumbers === 'boolean') d.settings.damageNumbers = s.damageNumbers;
    if (typeof s.vibration === 'boolean') d.settings.vibration = s.vibration;
    if (isDifficulty(s.difficulty)) d.settings.difficulty = s.difficulty;
    if (typeof s.heroId === 'string') d.settings.heroId = s.heroId;
    if (typeof s.weaponId === 'string') d.settings.weaponId = s.weaponId;
    if (typeof s.colorwayId === 'string') d.settings.colorwayId = s.colorwayId;
  }
  if (typeof r.stats === 'object' && r.stats !== null) {
    const st = r.stats as Record<string, unknown>;
    if (typeof st.totalKills === 'number' && isFinite(st.totalKills)) d.stats.totalKills = st.totalKills;
    if (typeof st.totalRuns === 'number' && isFinite(st.totalRuns)) d.stats.totalRuns = st.totalRuns;
  }
  if (typeof r.dailyBest === 'object' && r.dailyBest !== null) {
    const db = r.dailyBest as Record<string, unknown>;
    if (typeof db.date === 'string' && typeof db.score === 'number' && isFinite(db.score)) {
      d.dailyBest = { date: db.date, score: Math.max(0, db.score) };
    }
  }
  // Sticker-Album (neue Felder sind bei Alt-Saves einfach leer)
  if (typeof r.stickers === 'object' && r.stickers !== null) {
    for (const [k, v] of Object.entries(r.stickers as Record<string, unknown>)) {
      if (typeof v === 'string') d.stickers[k] = v;
    }
  }
  if (typeof r.stickerCounters === 'object' && r.stickerCounters !== null) {
    for (const [k, v] of Object.entries(r.stickerCounters as Record<string, unknown>)) {
      if (typeof v === 'number' && isFinite(v) && v > 0) d.stickerCounters[k] = Math.floor(v);
    }
  }
  if (Array.isArray(r.stickerPageRewards)) {
    d.stickerPageRewards = r.stickerPageRewards.filter((p): p is string => typeof p === 'string');
  }
  if (Array.isArray(r.unlockedColorways)) {
    d.unlockedColorways = r.unlockedColorways.filter((c): c is string => typeof c === 'string');
  }
  if (typeof r.lastAlbumSeen === 'string') d.lastAlbumSeen = r.lastAlbumSeen;
  // Kreuz-Konsistenz: eine abgeholte Seiten-Belohnung MUSS ihre Farbvariante
  // freigeschaltet haben (sonst waere sie unwiederbringlich verloren, weil
  // claim() abgeholte Seiten ueberspringt)
  for (const claimed of d.stickerPageRewards) {
    if (claimed === GOLD_REWARD_ID) {
      if (!d.unlockedColorways.includes('gold')) d.unlockedColorways.push('gold');
      continue;
    }
    const page = ALBUM_PAGES.find((p) => p.id === claimed);
    if (page?.reward.kind === 'colorway' && !d.unlockedColorways.includes(page.reward.colorwayId)) {
      d.unlockedColorways.push(page.reward.colorwayId);
    }
  }

  // Schwierigkeit "Schwer" nie ohne Freischaltung aktiv lassen
  if (d.settings.difficulty === 'hard' && !d.hardUnlocked) d.settings.difficulty = 'normal';
  // Auswahl darf nur auf tatsaechlich Freigeschaltetes zeigen (manipulierte Saves)
  if (!d.unlockedHeroes.includes(d.settings.heroId)) d.settings.heroId = 'volt';
  if (d.settings.weaponId !== 'default' && !d.unlockedWeapons.includes(d.settings.weaponId)) {
    d.settings.weaponId = 'default';
  }
  if (d.settings.colorwayId !== 'default' && !d.unlockedColorways.includes(d.settings.colorwayId)) {
    d.settings.colorwayId = 'default';
  }
  return d;
}

function sanitizeName(name: string): string {
  const trimmed = name.trim().slice(0, MAX_PROFILE_NAME_LEN);
  return trimmed.length > 0 ? trimmed : 'Spieler';
}

export class SaveManager {
  /** Payload des AKTIVEN Profils — alle Screens lesen hierueber live. */
  data: SaveData;
  profiles: ProfileMeta[] = [];
  activeId = '';
  /** false, wenn localStorage nicht verfuegbar ist (dann In-Memory + UI-Hinweis). */
  storageAvailable = true;
  /** In-Memory-Fallback fuer Profil-Payloads bei blockiertem Storage. */
  private readonly memoryPayloads = new Map<string, SaveData>();

  constructor() {
    this.data = defaults();
    this.initProfiles();
  }

  get activeName(): string {
    return this.profiles.find((p) => p.id === this.activeId)?.name ?? 'Spieler';
  }

  // ------------------------------------------------ Registry & Migration

  private initProfiles(): void {
    let registry = this.loadRegistry();

    if (!registry) {
      // Erststart oder Legacy: Migration des alten Einzel-Keys zu "Spieler 1"
      const id = this.newId();
      registry = {
        version: 2,
        activeId: id,
        profiles: [{ id, name: 'Spieler 1', createdAt: Date.now() }],
      };
      const legacy = this.readRaw(LEGACY_SAVE_KEY);
      this.writePayload(id, sanitize(legacy));
      if (legacy !== null) this.removeRaw(LEGACY_SAVE_KEY);
      this.profiles = registry.profiles;
      this.activeId = id;
      this.saveRegistry();
    } else {
      this.profiles = registry.profiles;
      this.activeId = registry.activeId;
    }

    this.data = this.loadPayload(this.activeId);
  }

  private loadRegistry(): ProfileRegistry | null {
    const raw = this.readRaw(PROFILES_KEY);
    if (raw === null || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (!Array.isArray(r.profiles)) return null;
    const profiles: ProfileMeta[] = [];
    for (const p of r.profiles as unknown[]) {
      if (typeof p !== 'object' || p === null) continue;
      const pm = p as Record<string, unknown>;
      if (typeof pm.id === 'string' && typeof pm.name === 'string') {
        profiles.push({
          id: pm.id,
          name: sanitizeName(pm.name),
          createdAt: typeof pm.createdAt === 'number' ? pm.createdAt : 0,
        });
      }
    }
    if (profiles.length === 0) return null;
    const activeId = typeof r.activeId === 'string' && profiles.some((p) => p.id === r.activeId)
      ? r.activeId
      : (profiles[0] as ProfileMeta).id;
    return { version: 2, activeId, profiles };
  }

  private saveRegistry(): void {
    this.writeRaw(PROFILES_KEY, {
      version: 2,
      activeId: this.activeId,
      profiles: this.profiles,
    });
  }

  private newId(): string {
    return `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  }

  // ------------------------------------------------ Payload-IO

  private loadPayload(id: string): SaveData {
    // In-Memory-Stand ist immer der frischste (Write-Fallback); ansonsten
    // IMMER localStorage lesen — ein reiner Write-Fehler (Quota) macht
    // Reads nicht kaputt, storageAvailable darf Lesen nicht blockieren.
    const mem = this.memoryPayloads.get(id);
    if (mem) return mem;
    return sanitize(this.readRaw(PROFILE_PREFIX + id));
  }

  private writePayload(id: string, data: SaveData): void {
    // Schlaegt der Write fehl (Quota/blockiert), MUSS der Stand in den
    // Memory-Fallback — sonst verschwaende er beim Profilwechsel komplett.
    if (!this.storageAvailable || !this.writeRaw(PROFILE_PREFIX + id, data)) {
      this.memoryPayloads.set(id, data);
    }
  }

  private readRaw(key: string): unknown {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return null;
      return JSON.parse(raw) as unknown;
    } catch (err) {
      if (err instanceof SyntaxError) {
        console.warn(`Neon Arena: Daten unter "${key}" kaputt, ignoriere sie.`, err);
        return null;
      }
      console.warn('Neon Arena: localStorage nicht verfuegbar, Fortschritt nur im Speicher.', err);
      this.storageAvailable = false;
      return null;
    }
  }

  /** true = erfolgreich geschrieben; false = Aufrufer braucht Memory-Fallback. */
  private writeRaw(key: string, value: unknown): boolean {
    if (!this.storageAvailable) return false;
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn('Neon Arena: Speichern fehlgeschlagen, Fortschritt nur im Speicher.', err);
      this.storageAvailable = false;
      return false;
    }
  }

  private removeRaw(key: string): void {
    if (!this.storageAvailable) return;
    try {
      localStorage.removeItem(key);
    } catch {
      // egal — Key bleibt als Waise liegen
    }
  }

  // ------------------------------------------------ Oeffentliche Profil-API

  /** Speichert das aktive Profil (wie bisher `save()`). */
  save(): void {
    this.writePayload(this.activeId, this.data);
  }

  switchProfile(id: string): boolean {
    if (id === this.activeId) return false;
    if (!this.profiles.some((p) => p.id === id)) return false;
    // aktuellen Stand sichern, dann umschalten
    this.save();
    this.activeId = id;
    this.data = this.loadPayload(id);
    this.saveRegistry();
    return true;
  }

  createProfile(name: string): ProfileMeta | null {
    if (this.profiles.length >= MAX_PROFILES) return null;
    const meta: ProfileMeta = { id: this.newId(), name: sanitizeName(name), createdAt: Date.now() };
    this.profiles.push(meta);
    this.writePayload(meta.id, defaults());
    this.saveRegistry();
    return meta;
  }

  renameProfile(id: string, name: string): void {
    const meta = this.profiles.find((p) => p.id === id);
    if (!meta) return;
    meta.name = sanitizeName(name);
    this.saveRegistry();
  }

  /** Loescht ein Profil samt Payload; das letzte Profil ist unloeschbar. */
  deleteProfile(id: string): boolean {
    if (this.profiles.length <= 1) return false;
    const idx = this.profiles.findIndex((p) => p.id === id);
    if (idx < 0) return false;
    this.profiles.splice(idx, 1);
    this.removeRaw(PROFILE_PREFIX + id);
    this.memoryPayloads.delete(id);
    if (this.activeId === id) {
      this.activeId = (this.profiles[0] as ProfileMeta).id;
      this.data = this.loadPayload(this.activeId);
    }
    this.saveRegistry();
    return true;
  }

  /** Fuer die Bestenliste: Payload eines beliebigen Profils lesen (sanitized). */
  profileData(id: string): SaveData {
    if (id === this.activeId) return this.data;
    return this.loadPayload(id);
  }

  /** Fremdes Profil schreiben (Koop-Doppel-Credit am Run-Ende). */
  writeProfile(id: string, data: SaveData): void {
    if (id === this.activeId) {
      this.data = data;
      this.save();
      return;
    }
    if (!this.profiles.some((p) => p.id === id)) return;
    this.writePayload(id, data);
  }
}
