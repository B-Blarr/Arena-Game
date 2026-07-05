/**
 * Upgrade-Pool (Roguelite): 17 stapelbare Upgrades + 3 Fallback-Karten,
 * damit die Auswahl NIE leer ist. Namen/Beschreibungen in strings.de.ts.
 */

export type Rarity = 'common' | 'rare' | 'epic';

export const RARITY_WEIGHTS: Record<Rarity, number> = { common: 60, rare: 30, epic: 10 };

export interface UpgradeDef {
  id: string;
  icon: string;
  rarity: Rarity;
  maxStacks: number;
  /** Fallback-Karten wirken sofort und zaehlen nicht als Stack. */
  instant: boolean;
}

export const UPGRADES: readonly UpgradeDef[] = [
  // Common
  { id: 'fireRate', icon: '⚡', rarity: 'common', maxStacks: 8, instant: false },
  { id: 'damage', icon: '🔥', rarity: 'common', maxStacks: 8, instant: false },
  { id: 'speed', icon: '👟', rarity: 'common', maxStacks: 5, instant: false },
  { id: 'maxHp', icon: '❤️', rarity: 'common', maxStacks: 5, instant: false },
  { id: 'magnet', icon: '🧲', rarity: 'common', maxStacks: 3, instant: false },
  { id: 'range', icon: '🔭', rarity: 'common', maxStacks: 3, instant: false },
  { id: 'coreGreed', icon: '💎', rarity: 'common', maxStacks: 2, instant: false },
  // Rare
  { id: 'multishot', icon: '🔱', rarity: 'rare', maxStacks: 4, instant: false },
  { id: 'pierce', icon: '🗡️', rarity: 'rare', maxStacks: 3, instant: false },
  { id: 'crit', icon: '🎯', rarity: 'rare', maxStacks: 4, instant: false },
  { id: 'lifesteal', icon: '💚', rarity: 'rare', maxStacks: 3, instant: false },
  { id: 'orb', icon: '🪐', rarity: 'rare', maxStacks: 3, instant: false },
  { id: 'dashBlade', icon: '💨', rarity: 'rare', maxStacks: 3, instant: false },
  { id: 'frost', icon: '❄️', rarity: 'rare', maxStacks: 2, instant: false },
  // Epic
  { id: 'nova', icon: '💥', rarity: 'epic', maxStacks: 3, instant: false },
  { id: 'doubleDash', icon: '🌀', rarity: 'epic', maxStacks: 1, instant: false },
  { id: 'ricochet', icon: '↩️', rarity: 'epic', maxStacks: 2, instant: false },
];

/** Fallback-Karten, wenn der regulaere Pool ausgeschoepft ist. */
export const FALLBACK_UPGRADES: readonly UpgradeDef[] = [
  { id: 'corePack', icon: '💰', rarity: 'common', maxStacks: 999, instant: true },
  { id: 'repair', icon: '🔧', rarity: 'common', maxStacks: 999, instant: true },
  { id: 'scoreBoost', icon: '✨', rarity: 'common', maxStacks: 999, instant: true },
];

/** Konkrete Wirkungs-Werte pro Stufe (vom Stat-System gelesen). */
export const UPGRADE_VALUES = {
  fireRatePerStack: 0.12,
  damagePerStack: 0.15,
  speedPerStack: 0.08,
  maxHpPerStack: 20,
  magnetPerStack: 0.75,
  rangePerStack: 0.2,
  coreGreedPerStack: 0.25,
  /** Mehrfachschuss: +1 Projektil, ABER alle Projektile x0.9 Schaden (multiplikativ). */
  multishotDamageMult: 0.9,
  multishotSpreadAngle: (8 * Math.PI) / 180,
  critPerStack: 0.1,
  critCap: 0.45,
  lifestealPerKill: 1,
  orbRadius: 2.2,
  orbRotationsPerSec: 0.8,
  orbDamage: 15,
  /** Orb trifft denselben Gegner max. alle 0.5 s; skaliert mit 50 % der Schadens-Boni. */
  orbHitCooldown: 0.5,
  orbDamageScaling: 0.5,
  dashBladeDamagePerStack: 25,
  frost: [
    { slow: 0.2, duration: 1.0 },
    { slow: 0.3, duration: 1.5 },
  ] as ReadonlyArray<{ slow: number; duration: number }>,
  novaChancePerStack: 0.2,
  novaRadius: 2.5,
  novaDamage: 15,
  /** Nova skaliert mit Schadens-Boni; Ketten-Explosionen max. Tiefe 3. */
  novaChainDepth: 3,
  ricochetRange: 6,
  ricochetDamageMult: 0.7,
  // Fallback-Karten
  corePackAmount: 15,
  repairFrac: 0.3,
  scoreBoostPerWave: 500,
};
