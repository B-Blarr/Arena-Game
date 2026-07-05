import type { Difficulty } from '../config/balance';

/**
 * localStorage-Persistenz mit Versionsfeld, Shape-Guard und
 * In-Memory-Fallback (Safari privat / Quota / blockierte Cookies).
 * Es wird NIE im Frame-Loop gespeichert — nur bei Run-Ende,
 * Shop-Kauf und Settings-Aenderung.
 */

const SAVE_KEY = 'neon-arena-save';

export interface SaveSettings {
  autoAim: boolean;
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  muted: boolean;
  reduceFx: boolean;
  damageNumbers: boolean;
  difficulty: Difficulty;
  heroId: string;
  /** 'default' = Startwaffe des Helden, sonst 'laser' | 'star'. */
  weaponId: string;
}

export interface SaveData {
  version: 1;
  cores: number;
  bestScores: Record<Difficulty, number>;
  bestWaves: Record<Difficulty, number>;
  unlockedHeroes: string[];
  unlockedWeapons: string[];
  permaUpgrades: Record<string, number>;
  hardUnlocked: boolean;
  seenControls: boolean;
  tutorialDone: string[];
  settings: SaveSettings;
  stats: { totalKills: number; totalRuns: number };
  dailyBest: { date: string; score: number } | null;
}

function defaults(): SaveData {
  return {
    version: 1,
    cores: 0,
    bestScores: { easy: 0, normal: 0, hard: 0 },
    bestWaves: { easy: 0, normal: 0, hard: 0 },
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
      difficulty: 'normal',
      heroId: 'volt',
      weaponId: 'default',
    },
    stats: { totalKills: 0, totalRuns: 0 },
    dailyBest: null,
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
    if (isDifficulty(s.difficulty)) d.settings.difficulty = s.difficulty;
    if (typeof s.heroId === 'string') d.settings.heroId = s.heroId;
    if (typeof s.weaponId === 'string') d.settings.weaponId = s.weaponId;
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
  // Schwierigkeit "Schwer" nie ohne Freischaltung aktiv lassen
  if (d.settings.difficulty === 'hard' && !d.hardUnlocked) d.settings.difficulty = 'normal';
  // Auswahl darf nur auf tatsaechlich Freigeschaltetes zeigen (manipulierte Saves)
  if (!d.unlockedHeroes.includes(d.settings.heroId)) d.settings.heroId = 'volt';
  if (d.settings.weaponId !== 'default' && !d.unlockedWeapons.includes(d.settings.weaponId)) {
    d.settings.weaponId = 'default';
  }
  return d;
}

export class SaveManager {
  data: SaveData;
  /** false, wenn localStorage nicht verfuegbar ist (dann In-Memory + UI-Hinweis). */
  storageAvailable = true;

  constructor() {
    this.data = this.load();
  }

  private load(): SaveData {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw === null) return defaults();
      const parsed: unknown = JSON.parse(raw);
      // Migration: bei unbekannter Version Felder retten, Rest auf Default
      return sanitize(parsed);
    } catch (err) {
      if (err instanceof SyntaxError) {
        console.warn('Neon Arena: Save-Daten kaputt, starte mit Defaults.', err);
        return defaults();
      }
      console.warn('Neon Arena: localStorage nicht verfuegbar, Fortschritt nur im Speicher.', err);
      this.storageAvailable = false;
      return defaults();
    }
  }

  save(): void {
    if (!this.storageAvailable) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch (err) {
      console.warn('Neon Arena: Speichern fehlgeschlagen, Fortschritt nur im Speicher.', err);
      this.storageAvailable = false;
    }
  }
}
