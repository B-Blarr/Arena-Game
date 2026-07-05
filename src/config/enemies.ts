/**
 * Gegnertyp-Definitionen. Farben: Spieler ist Cyan, Gegner sind warm/bunt,
 * ALLE Gegner-Projektile sind Rot ("Rot = ausweichen" — eine Regel,
 * die auch ein 7-Jaehriger sofort lernt).
 */

export const ENEMY_CHASER = 0;
export const ENEMY_SHOOTER = 1;
export const ENEMY_SWARM = 2;
export const ENEMY_TANK = 3;
export const ENEMY_SPLITTER = 4;
export const ENEMY_SPLITTER_CHILD = 5;
export const ENEMY_BOMBER = 6;
export const ENEMY_THIEF = 7;
export const ENEMY_PHANTOM = 8;
export const ENEMY_TYPE_COUNT = 9;

export type EnemyShape = 'cube' | 'octahedron' | 'tetrahedron' | 'sphere' | 'icosahedron' | 'torus';

export interface EnemyDef {
  id: string;
  color: number;
  shape: EnemyShape;
  /** Kollisionsradius in Units. */
  radius: number;
  /** Visuelle Skalierung des Basis-Meshes. */
  scale: number;
  hp: number;
  speed: number;
  damage: number;
  points: number;
  coreChance: number;
  /** Knockback-Empfindlichkeit; 0 = immun (Tank). */
  mass: number;
  /** Wellen-Budget: Kosten pro Spawn-Einheit (Schwarm = ganze Gruppe). */
  budgetCost: number;
  minWave: number;
  /** Auf "Einfach" erst spaeter freigeschaltet (Kindermodus bleibt sanft). */
  minWaveEasy?: number;
  /** Max. Anteil am Wellen-Budget (1 = unbegrenzt). */
  budgetShare: number;
  groupSize: number;
  /** Max. gleichzeitig aktiv (0 = unbegrenzt). */
  maxAlive: number;
}

export const ENEMY_PROJECTILE_COLOR = 0xff3b30;

export const ENEMIES: readonly EnemyDef[] = [
  {
    id: 'chaser', color: 0xff2d95, shape: 'cube', radius: 0.5, scale: 1.0,
    hp: 20, speed: 3.6, damage: 10, points: 10, coreChance: 0.08, mass: 1.0,
    budgetCost: 4, minWave: 1, budgetShare: 1, groupSize: 1, maxAlive: 0,
  },
  {
    id: 'shooter', color: 0xff9f1c, shape: 'octahedron', radius: 0.55, scale: 1.0,
    hp: 30, speed: 2.8, damage: 8, points: 25, coreChance: 0.12, mass: 0.9,
    budgetCost: 8, minWave: 3, budgetShare: 0.35, groupSize: 1, maxAlive: 0,
  },
  {
    id: 'swarm', color: 0x39ff14, shape: 'tetrahedron', radius: 0.35, scale: 0.7,
    hp: 8, speed: 5.2, damage: 5, points: 5, coreChance: 0.03, mass: 1.4,
    budgetCost: 9, minWave: 2, budgetShare: 0.4, groupSize: 6, maxAlive: 0,
  },
  {
    id: 'tank', color: 0x7b2dff, shape: 'cube', radius: 1.0, scale: 1.8,
    hp: 120, speed: 1.6, damage: 20, points: 50, coreChance: 0.25, mass: 0,
    budgetCost: 20, minWave: 8, budgetShare: 0.3, groupSize: 1, maxAlive: 3,
  },
  {
    id: 'splitter', color: 0xffd60a, shape: 'sphere', radius: 0.55, scale: 1.0,
    hp: 35, speed: 3.0, damage: 10, points: 20, coreChance: 0.1, mass: 1.0,
    budgetCost: 10, minWave: 6, budgetShare: 0.3, groupSize: 1, maxAlive: 0,
  },
  {
    // Splitter-Kind: spawnt nur beim Tod eines Splitters, splittet NIE erneut.
    id: 'splitterChild', color: 0xffe97a, shape: 'sphere', radius: 0.35, scale: 0.6,
    hp: 10, speed: 4.5, damage: 5, points: 5, coreChance: 0, mass: 1.3,
    budgetCost: 0, minWave: 999, budgetShare: 0, groupSize: 1, maxAlive: 0,
  },
  {
    // Bomber "Zuender": Projektil-Rot = "weg hier!". Schadet NUR per
    // Explosion (Kontakt-Ausnahme in CollisionSystem), damage = Blast.
    id: 'bomber', color: 0xff3b30, shape: 'sphere', radius: 0.5, scale: 1.05,
    hp: 18, speed: 4.2, damage: 26, points: 30, coreChance: 0.12, mass: 1.1,
    budgetCost: 10, minWave: 6, minWaveEasy: 9, budgetShare: 0.25, groupSize: 1, maxAlive: 4,
  },
  {
    // Kern-Dieb: einziger kalt-heller Gegner, frisst liegende Kerne.
    id: 'thief', color: 0xdbe4ff, shape: 'icosahedron', radius: 0.45, scale: 0.9,
    hp: 26, speed: 4.6, damage: 5, points: 40, coreChance: 0, mass: 1.2,
    // budgetShare 0.25: bei 0.15 wuerde der budgetShare-Deckel (total*share)
    // den Dieb auf Normal erst ab Welle 6 zulassen — minWave 4 waere tot
    budgetCost: 12, minWave: 4, minWaveEasy: 8, budgetShare: 0.25, groupSize: 1, maxAlive: 2,
  },
  {
    // Phantom: blinkt zur Flanke — bestraft stures Rueckwaerts-Kiten.
    id: 'phantom', color: 0xb84dff, shape: 'tetrahedron', radius: 0.5, scale: 1.15,
    hp: 24, speed: 3.4, damage: 12, points: 35, coreChance: 0.15, mass: 0.8,
    budgetCost: 11, minWave: 9, minWaveEasy: 12, budgetShare: 0.2, groupSize: 1, maxAlive: 3,
  },
];

/** Verhaltens-Parameter Schuetze. */
export const SHOOTER_AI = {
  desiredRange: 9,
  retreatRange: 7,
  approachRange: 11,
  fireInterval: 2.5,
  telegraphTime: 0.5,
  projectileSpeed: 7,
  projectileRange: 16,
};

/** Splitter: 2 Kinder in ±60°-Richtung, kurzer Spawnschutz. */
export const SPLITTER = {
  childCount: 2,
  childAngle: Math.PI / 3,
  childSpawnProtection: 0.3,
};

/** Weiche Separation, damit Schwaerme nicht zu einem Punkt kollabieren. */
export const SEPARATION = {
  radius: 0.9,
  strength: 18,
};

/** Bomber ("Zuender"): rennt heran, stoppt, zuendet nach Telegraph. */
export const BOMBER_AI = {
  /** Ab dieser Distanz zum Spieler startet die Zuendung. */
  triggerRange: 2.4,
  fuseTime: 0.9,
  /** Auf "Einfach" laengere Zuendschnur — mehr Zeit zum Weglaufen. */
  easyFuseMult: 1.5,
  blastRadius: 3.2,
  /** Explosion trifft andere Gegner doppelt so hart wie den Spieler. */
  enemyDamageMult: 2.0,
};

/** Kern-Dieb: frisst liegende Kerne und flieht mit der Beute. */
export const THIEF_AI = {
  stealDistance: 0.6,
  maxCarry: 4,
  maxCarryEasy: 2,
  /** Fluchtzeit ab erstem Diebstahl, danach entkommt er. */
  escapeTime: 6,
  escapeTimeEasy: 9,
  /** Ohne Kerne: seitlicher Orbit in dieser Distanz (wie Schuetze). */
  orbitRange: 8,
  bonusCoresOnKill: 1,
};

/** Phantom: blinkt zur Flanke, wenn der Spieler zu nah kommt. */
export const PHANTOM_AI = {
  blinkInterval: 2.8,
  blinkRange: 5,
  blinkDistance: 4,
};

/** Elite-Varianten: seltene, sichtbar staerkere Einzel-Gegner mit 1 Affix. */
export const ELITE = {
  minWave: 6,
  minWaveEasy: 9,
  /** Chance pro gekaufter Einheit: base + perWave * (Welle - minWave), gedeckelt. */
  baseChance: 0.05,
  chancePerWave: 0.01,
  maxChance: 0.15,
  maxPerWave: 2,
  hpMult: 2.2,
  damageMult: 1.3,
  pointsMult: 3,
  visualScale: 1.35,
  radiusMult: 1.2,
  /** Affix "Wut": unter 50 % HP Tempo-Schub. */
  rageThreshold: 0.5,
  rageSpeedMult: 1.45,
  dropCores: 2,
  dropHeartChance: 0.35,
  /** Nur diese Typen koennen Elite werden (Indizes). */
  eligible: [ENEMY_CHASER, ENEMY_SHOOTER, ENEMY_TANK, ENEMY_SPLITTER] as readonly number[],
};

/** Elite-Affixe (Werte im Enemy-Struct-Feld eliteAffix). */
export const AFFIX_NONE = 0;
export const AFFIX_SHIELD = 1;
export const AFFIX_RAGE = 2;
