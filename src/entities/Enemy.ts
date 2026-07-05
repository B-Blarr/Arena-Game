import { ENEMIES, type EnemyDef } from '../config/enemies';

/**
 * Gegner als flaches, poolbares Daten-Struct. Die Optik (InstancedMesh)
 * lebt komplett im InstancedRenderer.
 */
export interface Enemy {
  /** Eindeutige ID (Pool-Indizes sind wegen swap-remove instabil). */
  uid: number;
  type: number;
  x: number;
  z: number;
  prevX: number;
  prevZ: number;
  /** Knockback-Geschwindigkeit (exponentiell gedaempft). */
  kvx: number;
  kvz: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  points: number;
  radius: number;
  mass: number;
  coreChance: number;
  flashTimer: number;
  scalePop: number;
  slowTimer: number;
  slowFactor: number;
  /** Schuetze: Zeit bis zum naechsten Schuss / Telegraph-Restzeit. */
  fireTimer: number;
  telegraphTimer: number;
  spawnProtection: number;
  /** Schutz-Orb-Trefferrate: max. 1 Treffer pro 0.5 s pro Gegner. */
  orbCooldown: number;
  /** Dash-Klinge: pro Dash nur einmal getroffen werden. */
  dashHitToken: number;
  /** Nova-Ketten-Tiefe: von welcher Explosions-Generation getroffen. */
  novaDepth: number;
  yRot: number;
  rotSpeed: number;
  bobPhase: number;
}

export function makeEnemy(): Enemy {
  return {
    uid: 0, type: 0,
    x: 0, z: 0, prevX: 0, prevZ: 0, kvx: 0, kvz: 0,
    hp: 1, maxHp: 1, speed: 1, damage: 0, points: 0, radius: 0.5, mass: 1, coreChance: 0,
    flashTimer: 0, scalePop: 0, slowTimer: 0, slowFactor: 1,
    fireTimer: 0, telegraphTimer: 0, spawnProtection: 0,
    orbCooldown: 0, dashHitToken: -1, novaDepth: 0,
    yRot: 0, rotSpeed: 0, bobPhase: 0,
  };
}

export interface EnemyScaling {
  hp: number;
  speed: number;
  damage: number;
}

export function initEnemy(
  e: Enemy,
  type: number,
  x: number,
  z: number,
  scaling: EnemyScaling,
  uid: number,
): void {
  const def = ENEMIES[type] as EnemyDef;
  e.uid = uid;
  e.type = type;
  e.x = x;
  e.z = z;
  e.prevX = x;
  e.prevZ = z;
  e.kvx = 0;
  e.kvz = 0;
  e.maxHp = Math.round(def.hp * scaling.hp);
  e.hp = e.maxHp;
  e.speed = def.speed * scaling.speed;
  e.damage = Math.round(def.damage * scaling.damage);
  e.points = def.points;
  e.radius = def.radius;
  e.mass = def.mass;
  e.coreChance = def.coreChance;
  e.flashTimer = 0;
  e.scalePop = 0;
  e.slowTimer = 0;
  e.slowFactor = 1;
  e.fireTimer = 1 + Math.random() * 1.5;
  e.telegraphTimer = 0;
  e.spawnProtection = 0;
  e.orbCooldown = 0;
  e.dashHitToken = -1;
  e.novaDepth = 0;
  e.yRot = Math.random() * Math.PI * 2;
  e.rotSpeed = (Math.random() - 0.5) * 3;
  e.bobPhase = Math.random() * Math.PI * 2;
}
