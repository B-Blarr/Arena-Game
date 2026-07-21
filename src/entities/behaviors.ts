import {
  AFFIX_RAGE,
  BOMBER_AI,
  ELITE,
  ENEMY_BOMBER,
  ENEMY_PHANTOM,
  ENEMY_SHOOTER,
  ENEMY_THIEF,
  PHANTOM_AI,
  SEPARATION,
  SHOOTER_AI,
  THIEF_AI,
} from '../config/enemies';
import { PICKUP_CORE } from './Pickup';
import type { World } from '../core/World';
import type { EventBus } from '../core/EventBus';
import type { Enemy } from './Enemy';

// Wiederverwendeter Nachbarschafts-Puffer (allokationsfrei)
const neighborBuf: number[] = [];

/**
 * Steering aller Gegner: Timer, Bewegung Richtung des NAECHSTEN Spielers
 * (Koop: jeder Gegner jagt individuell), Schuetzen-KI, weiche Separation
 * via Spatial Hash, Knockback-Daempfung, Arena-Clamp.
 * Der Spatial Hash muss vorher fuer diesen Step befuellt worden sein.
 */
export function updateEnemies(world: World, dt: number, events: EventBus): void {
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

    const player = world.nearestAlivePlayer(e.x, e.z);
    const dx = player.x - e.x;
    const dz = player.z - e.z;
    const dist = Math.hypot(dx, dz);
    const nx = dist > 0.001 ? dx / dist : 0;
    const nz = dist > 0.001 ? dz / dist : 1;
    // NEU (mythisch "Zeitbruch"): globale Gegner-Zeitskala (1 = normal). Einziger
    // Bewegungs-Choke-Point -> deckt alle Gegner-KIs ab; Boss laeuft separat.
    let speed = e.speed * e.slowFactor * world.enemyTimeScale;
    // Elite-Affix "Wut": unter 50 % HP deutlich schneller
    if (e.eliteAffix === AFFIX_RAGE && e.hp < e.maxHp * ELITE.rageThreshold) {
      speed *= ELITE.rageSpeedMult;
    }

    if (e.type === ENEMY_SHOOTER) {
      updateShooter(e, dt, dist, nx, nz, speed, world, events);
    } else if (e.type === ENEMY_BOMBER) {
      updateBomber(e, dt, dist, nx, nz, speed, world, events);
    } else if (e.type === ENEMY_THIEF) {
      updateThief(e, dt, dist, nx, nz, speed, world, events);
    } else if (e.type === ENEMY_PHANTOM) {
      updatePhantom(e, dt, dist, nx, nz, speed, world, events);
    } else {
      // Verfolger / Schwarm / Tank / Splitter: direkt auf den Spieler zu
      e.x += nx * speed * dt;
      e.z += nz * speed * dt;
    }

    // Zuendender Bomber steht fest — sonst schieben Knockback/Sog/Separation
    // den Blast aus dem angezeigten Warn-Ring (unfair fuer den Spieler)
    const fusing = e.type === ENEMY_BOMBER && e.telegraphTimer > 0;

    // Knockback (exponentiell gedaempft), Tank (mass 0) ist immun
    if (!fusing && e.mass > 0 && (e.kvx !== 0 || e.kvz !== 0)) {
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

    if (!fusing) separate(e, world, dt);

    // Kreis-Arena-Clamp (NEU: Raum-Radius statt fester Konstante)
    const maxR = world.arenaRadius - e.radius;
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
      // Feuern! (auf den JETZT naechsten Spieler — nicht den vom Zyklusstart)
      const target = world.nearestAlivePlayer(e.x, e.z);
      const px = target.x;
      const pz = target.z;
      const ddx = px - e.x;
      const ddz = pz - e.z;
      const dlen = Math.hypot(ddx, ddz) || 1;
      world.spawnEnemyProjectile(e.x, e.z, ddx / dlen, ddz / dlen, ai.projectileSpeed, e.damage, ai.projectileRange);
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

/**
 * Bomber "Zuender": rennt heran, STOPPT bei Naehe und zuendet nach
 * Telegraph (roter Boden-Ring). telegraphTimer dient als Zuendschnur;
 * die Detonation selbst passiert in CombatSystem.processKill.
 */
function updateBomber(
  e: Enemy,
  dt: number,
  dist: number,
  nx: number,
  nz: number,
  speed: number,
  world: World,
  events: EventBus,
): void {
  if (e.telegraphTimer > 0) {
    // Zuendung laeuft: stillstehen (der Warn-Ring bleibt akkurat), Glimmen
    e.flashTimer = Math.max(e.flashTimer, 0.03);
    e.telegraphTimer -= dt;
    if (e.telegraphTimer <= 0) {
      // Sentinel bleibt > 0 — processKill erkennt daran die aktive Zuendung
      e.telegraphTimer = 0.001;
      e.hp = 0; // sweepDead detoniert ihn im selben Step
    }
    return;
  }
  if (dist < BOMBER_AI.triggerRange) {
    const fuse = BOMBER_AI.fuseTime * (world.difficulty === 'easy' ? BOMBER_AI.easyFuseMult : 1);
    e.telegraphTimer = fuse;
    // Rest-Knockback aus dem Anlauf verwerfen — Ring und Blast bleiben deckungsgleich
    e.kvx = 0;
    e.kvz = 0;
    events.emit('enemyFuse', { x: e.x, z: e.z, radius: BOMBER_AI.blastRadius, duration: fuse });
    return;
  }
  e.x += nx * speed * dt;
  e.z += nz * speed * dt;
}

/**
 * Kern-Dieb: frisst liegende Kerne, flieht mit der Beute und entkommt
 * nach Ablauf des Fluchttimers (fireTimer). Kill gibt alles zurueck.
 * Komplett deterministisch — kein RNG.
 */
function updateThief(
  e: Enemy,
  dt: number,
  dist: number,
  nx: number,
  nz: number,
  speed: number,
  world: World,
  events: EventBus,
): void {
  const isEasy = world.difficulty === 'easy';
  const maxCarry = isEasy ? THIEF_AI.maxCarryEasy : THIEF_AI.maxCarry;

  // Fluchttimer laeuft ab dem ersten Diebstahl
  if (e.carriedCores > 0) {
    e.fireTimer -= dt;
    if (e.fireTimer <= 0) {
      // Entkommen: escaped-Flag laesst sweepDead die KOMPLETTE Kill-Pipeline
      // ueberspringen (kein Loot, kein Combo-Kill, kein Lifesteal, keine Nova)
      events.emit('thiefEscaped', { x: e.x, z: e.z, cores: e.carriedCores });
      e.carriedCores = 0;
      e.escaped = true;
      e.hp = 0;
      return;
    }
  }

  // Naechsten liegenden Kern suchen (Pool <= 256, max. 2 Diebe — billig)
  let targetIdx = -1;
  let bestD2 = Infinity;
  const pickups = world.pickups;
  if (e.carriedCores < maxCarry) {
    for (let i = 0; i < pickups.count; i++) {
      const p = pickups.get(i);
      if (p.kind !== PICKUP_CORE) continue;
      const ddx = p.x - e.x;
      const ddz = p.z - e.z;
      const d2 = ddx * ddx + ddz * ddz;
      if (d2 < bestD2) {
        bestD2 = d2;
        targetIdx = i;
      }
    }
  }

  if (targetIdx >= 0) {
    // Zum Kern laufen und fressen
    const p = pickups.get(targetIdx);
    const d = Math.sqrt(bestD2);
    if (d < THIEF_AI.stealDistance) {
      pickups.despawn(targetIdx);
      if (e.carriedCores === 0) {
        e.fireTimer = isEasy ? THIEF_AI.escapeTimeEasy : THIEF_AI.escapeTime;
      }
      e.carriedCores++;
      e.scalePop = 0.3;
      events.emit('coreStolen', { x: e.x, z: e.z, carried: e.carriedCores });
    } else {
      e.x += ((p.x - e.x) / d) * speed * dt;
      e.z += ((p.z - e.z) / d) * speed * dt;
    }
    return;
  }

  if (e.carriedCores > 0) {
    // Fliehen: weg vom Spieler (Arena-Clamp laesst ihn am Rand entlangrutschen)
    e.x -= nx * speed * dt;
    e.z -= nz * speed * dt;
    return;
  }

  // Nichts zu stehlen: seitlicher Orbit in Auto-Aim-Reichweite (kein Patt)
  if (dist > THIEF_AI.orbitRange + 1) {
    e.x += nx * speed * dt;
    e.z += nz * speed * dt;
  } else if (dist < THIEF_AI.orbitRange - 1) {
    e.x -= nx * speed * dt;
    e.z -= nz * speed * dt;
  } else {
    const side = e.uid % 2 === 0 ? 1 : -1;
    e.x += -nz * side * speed * 0.5 * dt;
    e.z += nx * side * speed * 0.5 * dt;
  }
}

/**
 * Phantom: naehert sich normal, blinkt aber zur Flanke, sobald der
 * Spieler zu nah ist — bestraft stures Rueckwaerts-Kiten.
 * Blink-Richtung deterministisch ueber uid (kein RNG).
 */
function updatePhantom(
  e: Enemy,
  dt: number,
  dist: number,
  nx: number,
  nz: number,
  speed: number,
  world: World,
  events: EventBus,
): void {
  void world;
  e.fireTimer -= dt;
  if (e.fireTimer <= 0 && dist < PHANTOM_AI.blinkRange) {
    const side = e.uid % 2 === 0 ? 1 : -1;
    const fromX = e.x;
    const fromZ = e.z;
    e.x += -nz * side * PHANTOM_AI.blinkDistance;
    e.z += nx * side * PHANTOM_AI.blinkDistance;
    // kein Interpolations-Schlieren ueber die Blink-Distanz
    e.prevX = e.x;
    e.prevZ = e.z;
    e.fireTimer = PHANTOM_AI.blinkInterval;
    events.emit('phantomBlink', { fromX, fromZ, toX: e.x, toZ: e.z });
    return;
  }
  e.x += nx * speed * dt;
  e.z += nz * speed * dt;
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
