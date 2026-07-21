import { AFFIX_SHIELD, ELITE, ENEMIES, ENEMY_PHANTOM, PHANTOM_AI, type EnemyDef } from '../config/enemies';

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
  /** NEU (Reise-Ausbau): Optik-Groessenfaktor (Raum + Elite-Kammer). 1 = normal.
   *  Kollision laeuft ueber radius, die Optik ueber diesen Faktor (Renderer). */
  sizeMult: number;
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
  /** Elite-Affix: 0 = kein Elite, 1 = Schild, 2 = Wut (dient auch als Elite-Flag). */
  eliteAffix: number;
  /** Elite-Schild: 1 = naechster Treffer wird nullifiziert. */
  shieldHp: number;
  /** Kern-Dieb: Anzahl gefressener Kerne. */
  carriedCores: number;
  /** Dieb entkommen: despawnt OHNE Kill-Pipeline (kein Loot/Combo/Nova). */
  escaped: boolean;
  /** Koop: Index des Spielers, der zuletzt getroffen hat (Lifesteal/Nova). */
  lastAttacker: number;
  yRot: number;
  rotSpeed: number;
  bobPhase: number;
}

export function makeEnemy(): Enemy {
  return {
    uid: 0,
    type: 0,
    x: 0,
    z: 0,
    prevX: 0,
    prevZ: 0,
    kvx: 0,
    kvz: 0,
    hp: 1,
    maxHp: 1,
    speed: 1,
    damage: 0,
    points: 0,
    radius: 0.5,
    sizeMult: 1,
    mass: 1,
    coreChance: 0,
    flashTimer: 0,
    scalePop: 0,
    slowTimer: 0,
    slowFactor: 1,
    fireTimer: 0,
    telegraphTimer: 0,
    spawnProtection: 0,
    orbCooldown: 0,
    dashHitToken: -1,
    novaDepth: 0,
    eliteAffix: 0,
    shieldHp: 0,
    carriedCores: 0,
    escaped: false,
    lastAttacker: 0,
    yRot: 0,
    rotSpeed: 0,
    bobPhase: 0,
  };
}

export interface EnemyScaling {
  hp: number;
  speed: number;
  damage: number;
  /** NEU (Reise-Ausbau): Groessenfaktor fuer Kollision + Optik (1 = normal). */
  size: number;
}

export function initEnemy(e: Enemy, type: number, x: number, z: number, scaling: EnemyScaling, uid: number): void {
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
  // NEU (Reise-Ausbau): Raum-Groessenfaktor auf Kollision UND Optik. size=1 -> No-Op.
  e.radius = def.radius * scaling.size;
  e.sizeMult = scaling.size;
  e.mass = def.mass;
  e.coreChance = def.coreChance;
  e.flashTimer = 0;
  e.scalePop = 0;
  e.slowTimer = 0;
  e.slowFactor = 1;
  // Phantom: Blink-Timer deterministisch (uid-gestaffelt) — der Teleport ist
  // Gameplay, kein Kosmetik-Jitter, und darf den Daily Seed nicht brechen.
  e.fireTimer = type === ENEMY_PHANTOM ? PHANTOM_AI.blinkInterval * (0.6 + 0.15 * (uid % 4)) : 1 + Math.random() * 1.5;
  e.telegraphTimer = 0;
  e.spawnProtection = 0;
  e.orbCooldown = 0;
  e.dashHitToken = -1;
  e.novaDepth = 0;
  e.eliteAffix = 0;
  e.shieldHp = 0;
  e.carriedCores = 0;
  e.escaped = false;
  e.lastAttacker = 0;
  e.yRot = Math.random() * Math.PI * 2;
  e.rotSpeed = (Math.random() - 0.5) * 3;
  e.bobPhase = Math.random() * Math.PI * 2;
}

/**
 * Macht einen frisch initialisierten Gegner zur Elite-Variante.
 * NEU (Reise-Ausbau): scaleMult/hpMult kommen aus der Elite-Kammer (roomMods),
 * um vereinzelt RIESIGE, zaehe Elites zu erzeugen. Defaults 1 -> unveraendert.
 */
export function applyElite(e: Enemy, affix: number, scaleMult = 1, hpMult = 1): void {
  e.maxHp = Math.round(e.maxHp * ELITE.hpMult * hpMult);
  e.hp = e.maxHp;
  e.damage = Math.round(e.damage * ELITE.damageMult);
  e.points = Math.round(e.points * ELITE.pointsMult);
  e.radius *= ELITE.radiusMult * scaleMult;
  e.sizeMult *= scaleMult;
  e.eliteAffix = affix;
  e.shieldHp = affix === AFFIX_SHIELD ? 1 : 0;
}
