import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { sanitize, defaults, SaveManager } from './SaveManager';
import { GOLD_REWARD_ID, STICKERS } from '../config/stickers';
import { installFakeLocalStorage, resetStorage, type FakeStorage } from '../../tests/helpers/fakeStorage';

// Persistenz-Schluessel bewusst hier gespiegelt: aendert jemand sie im Code,
// sollen diese Migrations-Tests rot werden (Alt-Saves wuerden sonst verwaisen).
const LEGACY_SAVE_KEY = 'neon-arena-save';
const PROFILES_KEY = 'neon-arena-profiles';
const PROFILE_PREFIX = 'neon-arena-save:';

describe('sanitize', () => {
  it('returns full defaults for non-object input', () => {
    expect(sanitize(null)).toEqual(defaults());
    expect(sanitize(5)).toEqual(defaults());
    expect(sanitize('nope')).toEqual(defaults());
  });

  it('clamps cores to a non-negative integer and drops NaN/Infinity', () => {
    expect(sanitize({ cores: -5 }).cores).toBe(0);
    expect(sanitize({ cores: 3.9 }).cores).toBe(3);
    expect(sanitize({ cores: NaN }).cores).toBe(0);
    expect(sanitize({ cores: Infinity }).cores).toBe(0);
  });

  it('clamps volumes into [0, 1]', () => {
    expect(sanitize({ settings: { masterVolume: 5 } }).settings.masterVolume).toBe(1);
    expect(sanitize({ settings: { sfxVolume: -1 } }).settings.sfxVolume).toBe(0);
  });

  it("always keeps 'volt' in unlockedHeroes and filters non-strings", () => {
    const d = sanitize({ unlockedHeroes: ['blitz', 3, null] });
    expect(d.unlockedHeroes).toContain('volt');
    expect(d.unlockedHeroes).toContain('blitz');
    expect(d.unlockedHeroes).not.toContain(3 as unknown as string);
  });

  it("downgrades difficulty 'hard' to 'normal' when hardUnlocked is false", () => {
    expect(sanitize({ settings: { difficulty: 'hard' }, hardUnlocked: false }).settings.difficulty).toBe('normal');
    expect(sanitize({ settings: { difficulty: 'hard' }, hardUnlocked: true }).settings.difficulty).toBe('hard');
  });

  it('resets heroId/weaponId to defaults when not unlocked', () => {
    expect(sanitize({ settings: { heroId: 'phantom' } }).settings.heroId).toBe('volt');
    expect(sanitize({ settings: { weaponId: 'laser' }, unlockedWeapons: [] }).settings.weaponId).toBe('default');
    const withWeapon = sanitize({ settings: { weaponId: 'laser' }, unlockedWeapons: ['laser'] });
    expect(withWeapon.settings.weaponId).toBe('laser');
  });

  it('back-fills missing bestJourney fields with 0 (legacy-save shape)', () => {
    const d = sanitize({ cores: 10 });
    expect(d.bestJourneyScores).toEqual({ easy: 0, normal: 0, hard: 0 });
    expect(d.bestJourneyWaves).toEqual({ easy: 0, normal: 0, hard: 0 });
  });

  it("force-unlocks the gold colorway when the 'gold' page reward is claimed", () => {
    expect(sanitize({ stickerPageRewards: [GOLD_REWARD_ID] }).unlockedColorways).toContain('gold');
  });

  it('force-unlocks a trail when its sticker reward is claimed', () => {
    const trailSticker = STICKERS.find((s) => s.reward?.kind === 'trail');
    expect(trailSticker, 'expected at least one sticker with a trail reward').toBeDefined();
    const reward = trailSticker!.reward as { kind: 'trail'; trailId: string };
    const d = sanitize({ stickerRewards: [trailSticker!.id] });
    expect(d.unlockedTrails).toContain(reward.trailId);
  });
});

describe('SaveManager migration', () => {
  let storage: FakeStorage;

  beforeEach(() => {
    storage = installFakeLocalStorage();
  });

  afterEach(() => {
    resetStorage();
  });

  it('creates one "Spieler 1" profile on a fresh start', () => {
    const sm = new SaveManager();
    expect(sm.profiles).toHaveLength(1);
    expect(sm.profiles[0]!.name).toBe('Spieler 1');
    expect(sm.activeId).toBe(sm.profiles[0]!.id);
    expect(sm.data.cores).toBe(0);
    expect(storage.getItem(PROFILES_KEY)).not.toBeNull();
  });

  it('migrates the legacy single-key save into a profile and removes it', () => {
    storage.setItem(LEGACY_SAVE_KEY, JSON.stringify({ version: 1, cores: 42 }));
    const sm = new SaveManager();
    expect(sm.data.cores).toBe(42);
    expect(sm.profiles).toHaveLength(1);
    expect(storage.getItem(LEGACY_SAVE_KEY)).toBeNull();
    expect(storage.getItem(PROFILE_PREFIX + sm.activeId)).not.toBeNull();
  });

  it('loads an existing v2 registry and respects its activeId', () => {
    storage.setItem(
      PROFILES_KEY,
      JSON.stringify({
        version: 2,
        activeId: 'p2',
        profiles: [
          { id: 'p1', name: 'Anna', createdAt: 1 },
          { id: 'p2', name: 'Ben', createdAt: 2 },
        ],
      }),
    );
    storage.setItem(PROFILE_PREFIX + 'p2', JSON.stringify({ version: 1, cores: 7 }));
    const sm = new SaveManager();
    expect(sm.activeId).toBe('p2');
    expect(sm.profiles.map((p) => p.name)).toEqual(['Anna', 'Ben']);
    expect(sm.data.cores).toBe(7);
  });

  it('treats a corrupt registry (profiles not an array) as a fresh start', () => {
    storage.setItem(PROFILES_KEY, JSON.stringify({ version: 2, profiles: 'oops' }));
    const sm = new SaveManager();
    expect(sm.profiles).toHaveLength(1);
    expect(sm.profiles[0]!.name).toBe('Spieler 1');
  });
});
