import {
  ENEMY_SHOOTER,
  SEPARATION,
  SHOOTER_AI,
} from '../config/enemies';
import { ARENA_RADIUS } from '../config/balance';
import type { World } from '../core/World';
import type { EventBus } from '../core/EventBus';
import type { Enemy } from './Enemy';

// Wiederverwendeter Nachbarschafts-Puffer (allokationsfrei)
const neighborBuf: number[] = [];

/**
 * Steering aller Gegner: Timer, Bewegung Richtung Spieler, Schuetzen-KI,
 * weiche Separation via Spatial Hash, Knockback-Daempfung, Arena-Clamp.
 * Der Spatial Hash muss vorher fuer diesen Step befuellt worden sein.
 */
export function updateEnemies(world: World, dt: number, events: EventBus): void {
  const player = world.player;
  const pool = world.enemies;

  for (let i = 0; i < pool.count; i++) {
    const e = pool.get(i);
    e.prevX = e.x;
    e.prevZ = e.z;

    // Timer
    if (e.flashTimer > 0) e.flashTimer -= dt;
    if (e.scalePop > 0) e.scalePop = Math.max(0, e.scalePop - dt * 8);
    if (e.orbCooldown > 0) e.orbCooldown -= dt;
    if (e.spawnProtection > 0) e.spawnProtection -= dt;
    if (e.slowTimer > 0) {
      e.slowTimer -= dt;
      if (e.slowTimer <= 0) e.slowFactor = 1;
    }
    e.yRot += e.rotSpeed * dt;

    const dx = player.x - e.x;
    const dz = player.z - e.z;
    const dist = Math.hypot(dx, dz);
    const nx = dist > 0.001 ? dx / dist : 0;
    const nz = dist > 0.001 ? dz / dist : 1;
    const speed = e.speed * e.slowFactor;

    if (e.type === ENEMY_SHOOTER) {
      updateShooter(e, dt, dist, nx, nz, speed, world, events);
    } else {
      // Verfolger / Schwarm / Tank / Splitter: direkt auf den Spieler zu
      e.x += nx * speed * dt;
      e.z += nz * speed * dt;
    }

    // Knockback (exponentiell gedaempft), Tank (mass 0) ist immun
    if (e.mass > 0 && (e.kvx !== 0 || e.kvz !== 0)) {
      e.x += e.kvx * dt;
      e.z += e.kvz * dt;
      const dampF = Math.exp(-8 * dt);
      e.kvx *= dampF;
      e.kvz *= dampF;
      if (Math.abs(e.kvx) < 0.05 && Math.abs(e.kvz) < 0.05) {
        e.kvx = 0;
        e.kvz = 0;
      }
    }

    separate(e, world, dt);

    // Kreis-Arena-Clamp
    const maxR = ARENA_RADIUS - e.radius;
    const d = Math.hypot(e.x, e.z);
    if (d > maxR) {
      e.x = (e.x / d) * maxR;
      e.z = (e.z / d) * maxR;
    }
  }
}

function updateShooter(
  e: Enemy,
  dt: number,
  dist: number,
  nx: number,
  nz: number,
  speed: number,
  world: World,
  events: EventBus,
): void {
  const ai = SHOOTER_AI;

  // Waehrend des Telegraphs (Aufleuchten) stehen bleiben
  if (e.telegraphTimer > 0) {
    e.telegraphTimer -= dt;
    e.flashTimer = Math.max(e.flashTimer, 0.03); // dauerhaftes Glimmen
    if (e.telegraphTimer <= 0) {
      // Feuern!
      const px = world.player.x;
      const pz = world.player.z;
      const ddx = px - e.x;
      const ddz = pz - e.z;
      const dlen = Math.hypot(ddx, ddz) || 1;
      world.spawnEnemyProjectile(
        e.x, e.z, ddx / dlen, ddz / dlen,
        ai.projectileSpeed, e.damage, ai.projectileRange,
      );
      events.emit('enemyShot', { x: e.x, z: e.z });
      e.fireTimer = ai.fireInterval;
    }
    return;
  }

  // Abstand halten
  if (dist < ai.retreatRange) {
    e.x -= nx * speed * dt;
    e.z -= nz * speed * dt;
  } else if (dist > ai.approachRange) {
    e.x += nx * speed * dt;
    e.z += nz * speed * dt;
  } else {
    // leichtes seitliches Driften im Wunschabstand (Richtung nach uid)
    const side = e.uid % 2 === 0 ? 1 : -1;
    e.x += -nz * side * speed * 0.4 * dt;
    e.z += nx * side * speed * 0.4 * dt;
  }

  // Feuerzyklus nur, wenn der Spieler in Schussweite ist
  if (dist < ai.projectileRange) {
    e.fireTimer -= dt;
    if (e.fireTimer <= ai.telegraphTime && e.telegraphTimer <= 0) {
      e.telegraphTimer = ai.telegraphTime;
    }
  }
}

/** Weiche Abstossung ueberlappender Gegner — Schwaerme kollabieren nicht. */
function separate(e: Enemy, world: World, dt: number): void {
  if (e.mass <= 0) return; // Tank schiebt, wird nicht geschoben
  const found = world.spatialHash.queryCircle(e.x, e.z, e.radius + SEPARATION.radius, neighborBuf);
  const pool = world.enemies;
  const blend = Math.min(1, SEPARATION.strength * dt * 0.1);
  for (let n = 0; n < found; n++) {
    const j = neighborBuf[n] as number;
    if (j >= pool.count) continue;
    const other = pool.get(j);
    if (other.uid === e.uid) continue;
    const dx = e.x - other.x;
    const dz = e.z - other.z;
    const d = Math.hypot(dx, dz);
    const minDist = e.radius + other.radius + 0.15;
    if (d > 0.0001 && d < minDist) {
      const overlap = (minDist - d) * blend;
      e.x += (dx / d) * overlap;
      e.z += (dz / d) * overlap;
    } else if (d <= 0.0001) {
      // exakt uebereinander: deterministisch auseinander schieben
      e.x += (e.uid % 2 === 0 ? 1 : -1) * 0.05;
      e.z += (e.uid % 3 === 0 ? 1 : -1) * 0.05;
    }
  }
}
