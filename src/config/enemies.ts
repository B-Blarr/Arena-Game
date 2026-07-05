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
export const ENEMY_TYPE_COUNT = 6;

export type EnemyShape = 'cube' | 'octahedron' | 'tetrahedron' | 'sphere';

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
