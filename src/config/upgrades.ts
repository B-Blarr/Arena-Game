/**
 * Upgrade-Pool (Roguelite): 17 stapelbare Upgrades, 6 Legendaere +
 * 3 Fallback-Karten, damit die Auswahl NIE leer ist.
 * Namen/Beschreibungen in strings.de.ts.
 */

// NEU: 'mythic' — Stufe ueber legendaer, siehe MYTHIC/RARITY_WEIGHTS unten.
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

// NEU: mythic 0.05 — grob 6- bis 20-mal seltener als legendaer (das per Pity bis 1.0 steigt).
export const RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 60, rare: 30, epic: 10, legendary: 0.3, mythic: 0.05,
};

/** Legendaer-Regeln: EXTREM selten, nur ein sanfter Rest-Pity gegen Extrem-Pech. */
export const LEGENDARY = {
  /** Effektives Gewicht = min(base + pity, weightCap); pity nur pro Angebot, in dem
   *  Legendaere ueberhaupt moeglich waren (siehe UpgradeSystem.draw). */
  pityPerOffer: 0.15,
  weightCap: 1.0,
  /** Erst ab der Wahl NACH dieser Welle im Pool (frueher Lauf bleibt legendaer-frei). */
  minWave: 6,
};

/** NEU: Mythisch-Regeln: "so gut wie nie" — KEIN Pity (reines Glueck), spaeteres Gate,
 *  max. 1 pro Lauf (siehe UpgradeSystem: mythicTaken + Pool-Filter, alles rng-neutral). */
export const MYTHIC = {
  /** Erst ab der Wahl NACH dieser Welle im Pool (spaeter als legendaer). */
  minWave: 10,
};

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
  // Legendary (build-definierend, jeweils nur 1x pro Lauf)
  { id: 'mirrorClone', icon: '👥', rarity: 'legendary', maxStacks: 1, instant: false },
  { id: 'chainReaction', icon: '🧨', rarity: 'legendary', maxStacks: 1, instant: false },
  { id: 'orbitalLaser', icon: '🛰️', rarity: 'legendary', maxStacks: 1, instant: false },
  { id: 'blackHoleDash', icon: '🕳️', rarity: 'legendary', maxStacks: 1, instant: false },
  { id: 'overcharge', icon: '🚨', rarity: 'legendary', maxStacks: 1, instant: false },
  { id: 'megaShots', icon: '🌕', rarity: 'legendary', maxStacks: 1, instant: false },
  // NEU: Mythisch (ueber legendaer, extrem selten, max. 1 pro Lauf) — je 1x pro Lauf.
  { id: 'timeBreak', icon: '⏳', rarity: 'mythic', maxStacks: 1, instant: false },
  { id: 'phoenixCore', icon: '🐦‍🔥', rarity: 'mythic', maxStacks: 1, instant: false },
  { id: 'prismBeam', icon: '🌈', rarity: 'mythic', maxStacks: 1, instant: false },
  { id: 'singularity', icon: '♾️', rarity: 'mythic', maxStacks: 1, instant: false },
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
  /** 0.5 statt 1: Lebensraub war der staerkste "Dauervollleben"-Treiber. */
  lifestealPerKill: 0.5,
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
  // Legendaere Upgrades (alle maxStacks 1, build-definierend)
  /** Spiegelklon: Geist feuert jede Salve mit diesem Schadensanteil. */
  mirrorCloneDamageFrac: 0.5,
  mirrorCloneOffset: 1.5,
  /** Orbital-Laser: alle X s auf den Gegner mit den meisten HP (oder Boss). */
  orbitalLaserInterval: 5,
  orbitalLaserDamage: 120,
  /** Schwarzes Loch: Dash schleudert eine Singularitaet voraus, die Gegner
   *  per direktem Positions-Versatz einsaugt und am Ende explodiert. */
  blackHoleRadius: 5,
  /** Sog-GESCHWINDIGKEIT in u/s (direkter Versatz, keine Beschleunigung). */
  blackHolePull: 12,
  blackHoleDuration: 0.8,
  /** Wurfweite in Dash-Richtung ueber den Endpunkt hinaus. */
  blackHoleThrowDist: 2.5,
  /** Fangring: Gegner werden nie naeher als hierhin gezogen (kein Durchfliegen). */
  blackHoleCaptureRadius: 0.35,
  /** Innerhalb dieses Radius wird der Sog gedaempft (stabiler Knaeuel). */
  blackHoleSlowRadius: 1.5,
  blackHoleMinPullFrac: 0.35,
  /** Kollaps-Crunch am Lebensende. */
  blackHoleCrushRadius: 2.2,
  blackHoleCrushDamage: 20,
  /** Ueberladung: unter dieser HP-Schwelle +50 % Schaden. */
  overchargeHpFrac: 0.3,
  overchargeDamageBonus: 0.5,
  /** Mega-Kugeln: groessere, staerkere, durchschlagende Projektile. */
  megaShotsDamageBonus: 0.3,
  megaShotsRadiusMult: 2.2,
  megaShotsPierce: 2,
  projectileRadiusBase: 0.15,
  // NEU: Mythische Upgrades (alle maxStacks 1, build-definierend)
  /** Singularitaet: Feuerrate UND Schaden mal diesem Faktor. */
  singularityMult: 2,
  /** Zeitbruch: Zeitskala fuer normale Gegner + deren Projektile (0.55 = 45 % langsamer).
   *  Bosse laufen ueber einen eigenen Pfad und bleiben unberuehrt. */
  timeBreakScale: 0.55,
  /** Phoenixkern: einmalige Auto-Wiederbelebung, danach Schockwelle. */
  phoenixBlastRadius: 6,
  phoenixBlastDamage: 200,
  /** Prisma-Salve: extrem schnelles Schiessen mit dicken, durchschlagenden,
   *  prismatischen Kugeln (ersetzt das normale Feuern). Feste Rate -> nur der
   *  Schaden pro Kugel skaliert mit damageMult (DPS wie der alte Strahl). */
  prismShotInterval: 0.05, // 20 Schuss/s
  prismShotDamage: 9, // x damageMult -> DPS ~180
  prismShotPierce: 999, // durchschlaegt die ganze Linie
  prismShotSpeed: 32, // schnell, kurze Flugzeit
  prismShotRadius: 0.33, // dick (~2,2x Basis 0.15)
  prismShotRange: 18,
  // Fallback-Karten
  corePackAmount: 15,
  repairFrac: 0.25,
  scoreBoostPerWave: 500,
};
