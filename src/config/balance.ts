/**
 * Zentrales Balancing. ALLE Zahlen des Spiels leben hier oder in den
 * Nachbar-Configs (enemies/bosses/upgrades/heroes) — nichts im Code verstreut.
 * Einheiten: 1 Unit = 1 Meter, Zeit in Sekunden, Schaden in HP.
 */

export const ARENA_RADIUS = 22;

export const PLAYER = {
  maxHp: 100,
  speed: 6.0,
  radius: 0.5,
  pickupRadius: 2.5,
  iFramesAfterHit: 1.0,
  critChance: 0.05,
  critMultiplier: 2.0,
};

export const DASH = {
  distance: 5.0,
  duration: 0.18,
  cooldown: 2.5,
  iFrames: 0.3,
};

export const AIM = {
  autoRange: 12,
  /** Skill-Anreiz: manuelles Zielen gibt +10 % Schaden. */
  manualDamageBonus: 1.1,
};

export const LIMITS = {
  maxEnemies: 40,
  maxEnemyProjectiles: 60,
};

/**
 * Pool-Kapazitaeten — Single Source fuer World UND InstancedRenderer,
 * damit Pool und Instanz-Mesh nie auseinanderlaufen koennen.
 */
export const POOLS = {
  enemies: 192,
  /** Zwei Multishot-Builds im Koop brauchen Luft (vorher 256). */
  playerProjectiles: 384,
  enemyProjectiles: 128,
  pickups: 256,
};

// ---------- Koop (lokaler 2-Spieler-Modus) ----------

export const COOP = {
  /** Mehr Gegner, aber nicht 2x — zwei Builds stacken ueberproportional. */
  budgetMult: 1.5,
  enemyHpMult: 1.2,
  /** Zusaetzlich zu enemyHpMult auf Boss-HP (~1.7x gesamt). */
  bossHpExtra: 1.42,
  /** Zwei Sammler = doppelte effektive Herz-Rate -> leicht daempfen. */
  heartChanceMult: 0.8,
  maxEnemies: 60,
  packBudget: 9,
  /** Spieler-Startpositionen (nebeneinander statt uebereinander). */
  spawnOffsetX: 1.6,
  revive: {
    radius: 2.0,
    holdTime: 1.5,
    /** Ausserhalb der Zone verfaellt Fortschritt nur langsam (verzeihend). */
    decayMult: 2,
    hpFrac: 0.4,
    iFrames: 2.0,
  },
  camera: {
    /** Sichtbarer Boden-Halbraum: Sued-Rand ist der Engpass. */
    nearHalfZ: 12,
    halfX: 20,
    margin: 2.5,
    zoomMax: 2.0,
    zoomDamp: 3,
  },
};

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface DifficultyMods {
  playerHp: number;
  enemySpeed: number;
  enemyHp: number;
  enemyDamage: number;
  budget: number;
  heartChance: number;
  coreMult: number;
  /** Multiplikator auf die Elite-Spawn-Chance. */
  eliteChanceMult: number;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyMods> = {
  easy: { playerHp: 1.5, enemySpeed: 0.85, enemyHp: 0.8, enemyDamage: 0.75, budget: 0.85, heartChance: 0.07, coreMult: 0.8, eliteChanceMult: 0.5 },
  normal: { playerHp: 1.0, enemySpeed: 1.0, enemyHp: 1.0, enemyDamage: 1.0, budget: 1.0, heartChance: 0.03, coreMult: 1.0, eliteChanceMult: 1.0 },
  hard: { playerHp: 1.0, enemySpeed: 1.1, enemyHp: 1.25, enemyDamage: 1.25, budget: 1.15, heartChance: 0.02, coreMult: 1.5, eliteChanceMult: 1.3 },
};

/** "Schwer" wird freigeschaltet, wenn Welle 10 auf Normal erreicht wurde. */
export const HARD_UNLOCK_WAVE = 10;

// ---------- Wellen-Formeln ----------

export function waveBudget(w: number): number {
  return Math.round(20 + 6 * w + 0.75 * w * w);
}

export function enemyHpFactor(w: number): number {
  // Exponentieller Anteil ab W10 beendet Unsterblichkeits-Builds zuverlaessig.
  return (1 + 0.09 * (w - 1)) * Math.pow(1.07, Math.max(0, w - 10));
}

export function enemySpeedFactor(w: number): number {
  return Math.min(1 + 0.015 * (w - 1), 1.4);
}

export function enemyDamageFactor(w: number): number {
  return 1 + 0.05 * (w - 1);
}

export function isBossWave(w: number): boolean {
  return w % 5 === 0;
}

export const SPAWN = {
  portalCount: 6,
  /** Gestaffelte Spawns: alle 3.5 s ein Paket von ~6 Budget-Einheiten. */
  packInterval: 3.5,
  packBudget: 6,
  telegraphTime: 1.0,
  minPlayerDistance: 8,
};

// ---------- Pickups ----------

export const PICKUPS = {
  heartHeal: 15,
  heartLifetime: 12,
  heartBlinkTime: 3,
  maxHearts: 2,
  /** Mitleids-Regel: unter 30 % HP steigt die Herz-Chance (x heartPityMult). */
  heartPityHpFrac: 0.3,
  heartPityMult: 1.5,
  /** Anti-Unsterblichkeit: ab Welle 20 halbiert sich die Herz-Chance. */
  heartNerfWave: 20,
  magnetChance: 0.015,
  magnetDuration: 8,
  coreFlySpeed: 12,
  coreFlyAccel: 40,
  coreMaxSpeed: 25,
  collectDistance: 0.7,
};

// ---------- Ueberraschungen (SurpriseDirector) ----------

export const SURPRISE = {
  /** Goldene Welle: doppelte Kern-Drops, auf Normal/Schwer etwas flottere Gegner. */
  goldenChance: 0.1,
  goldenMinWave: 4,
  /** Tempo-Aufschlag NUR auf Normal/Schwer — auf Einfach reine Belohnung. */
  goldenSpeedMult: 1.15,

  capsule: {
    /** Chance pro Nicht-Boss-Welle, nach Schwierigkeit. */
    chance: { easy: 0.3, normal: 0.22, hard: 0.18 } as Record<Difficulty, number>,
    minWave: 3,
    minWaveEasy: 2,
    /** Vorwarnzeit: goldener Ring am Landepunkt. */
    telegraphTime: 1.5,
    lifetime: 12,
    blinkTime: 3,
    /** Landet zufaellig 4–10 s nach Wellenstart. */
    dropTimeMin: 4,
    dropTimeMax: 10,
    /** Landeposition: Radius-Band in der Arena. */
    minRadius: 4,
    edgeMargin: 5,
    /** Belohnungs-Gewichte (cores/hearts/magnet/rapidFire), je Schwierigkeit. */
    rewards: {
      easy: { cores: 0.45, hearts: 0.3, magnet: 0.15, rapidFire: 0.1 },
      normal: { cores: 0.4, hearts: 0.25, magnet: 0.15, rapidFire: 0.2 },
      hard: { cores: 0.4, hearts: 0.25, magnet: 0.15, rapidFire: 0.2 },
    } as Record<Difficulty, { cores: number; hearts: number; magnet: number; rapidFire: number }>,
    rewardCores: 8,
    rewardHearts: 1,
    /** "Turbofeuer!": kurzzeitig +67 % Feuerrate (Cooldown x0.6). */
    rapidFireDuration: 8,
    rapidFireCooldownMult: 0.6,
  },
};

// ---------- Score & Combo ----------

export const COMBO = {
  window: 2.5,
  /** [Kills-Schwelle, Multiplikator] aufsteigend. */
  tiers: [
    [5, 1.5],
    [10, 2],
    [20, 3],
  ] as ReadonlyArray<readonly [number, number]>,
};

export const SCORE = {
  waveBonusPerWave: 50,
  /** "Perfekt!"-Bonus: Welle ohne erlittenen Treffer -> +50 % des Wellen-Bonus. */
  perfectBonusFrac: 0.5,
  bossBonusPerNr: 1000,
};

// ---------- Meta (Kerne) ----------

export const META = {
  /** Endbonus: floor(Score / 500) + 3 * hoechste Welle. */
  scorePerCore: 500,
  coresPerWave: 3,
  bossCoresBase: 15,
  bossCoresPerNr: 5,
  bossHealFrac: 0.15,
};
