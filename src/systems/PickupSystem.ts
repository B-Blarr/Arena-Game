import { ARENA_RADIUS, PICKUPS, SURPRISE } from '../config/balance';
import { ELITE, ENEMY_TANK } from '../config/enemies';
import type { EventBus } from '../core/EventBus';
import type { World } from '../core/World';
import type { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import { initPickup, PICKUP_CAPSULE, PICKUP_CORE, PICKUP_HEART, PICKUP_MAGNET } from '../entities/Pickup';

/**
 * Drops, Magnet-Sog und Einsammeln. Kerne despawnen nie waehrend der
 * Welle — am Wellenende fliegen alle Rest-Kerne automatisch zum Spieler
 * (kein Absuchen-Zwang fuer Kinder).
 */
export class PickupSystem {
  /** Magnet-Kugel aktiv: alle Pickups arenaweit angezogen. */
  private magnetTimer = 0;

  constructor(
    private readonly world: World,
    private readonly events: EventBus,
  ) {}

  reset(): void {
    this.magnetTimer = 0;
  }

  dropFrom(e: Enemy): void {
    const world = this.world;
    const rng = world.rngDrops;

    // Kern (Goldene Welle: doppelt); Koop: bester Kern-Chance-Mult im Team
    const coreChance = e.coreChance * world.maxCoreChanceMult();
    if (rng.chance(Math.min(coreChance, 0.95))) this.spawnCoreMaybeGolden(e.x, e.z);

    // Tank: garantiert Kern (75 %) oder Herz (25 %) zusaetzlich
    if (e.type === ENEMY_TANK) {
      if (rng.chance(0.25)) this.spawn(PICKUP_HEART, e.x + 0.4, e.z);
      else this.spawnCoreMaybeGolden(e.x + 0.4, e.z);
    }

    // Elite: garantierte Bonus-Beute (macht den harten Kampf lohnend)
    if (e.eliteAffix > 0) {
      for (let i = 0; i < ELITE.dropCores; i++) this.spawnCoreMaybeGolden(e.x + 0.3 * i, e.z - 0.3 * i);
      if (rng.chance(ELITE.dropHeartChance)) this.spawn(PICKUP_HEART, e.x, e.z + 0.5);
    }

    // Herz mit Mitleids-Regel (Koop: der knappste Spieler zaehlt) und
    // Anti-Unsterblichkeits-Nerf
    let heartChance = world.mods.heartChance;
    if (world.minAliveHpFrac() < PICKUPS.heartPityHpFrac) heartChance *= PICKUPS.heartPityMult;
    if (world.wave >= PICKUPS.heartNerfWave) heartChance *= 0.5;
    if (this.countHearts() < PICKUPS.maxHearts && rng.chance(heartChance)) {
      this.spawn(PICKUP_HEART, e.x - 0.3, e.z + 0.3);
    }

    // Magnet-Kugel (selten)
    if (rng.chance(PICKUPS.magnetChance)) this.spawn(PICKUP_MAGNET, e.x, e.z - 0.4);
  }

  /** Einzelner Kern (Dieb-Beute, Belohnungen). */
  spawnCore(x: number, z: number): void {
    this.spawn(PICKUP_CORE, x, z);
  }

  /** Versorgungskapsel (SurpriseDirector): laeuft ab und blinkt am Ende. */
  spawnCapsule(x: number, z: number): void {
    const p = this.world.pickups.spawn();
    if (!p) return;
    initPickup(p, PICKUP_CAPSULE, x, z, SURPRISE.capsule.lifetime);
    // Kapsel landet punktgenau im Telegraph-Ring — kein Auswurf-Impuls
    p.vx = 0;
    p.vz = 0;
  }

  /** Boss-Belohnung: Kern-Fontaene. */
  spawnCoreFountain(x: number, z: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const p = this.spawn(PICKUP_CORE, x, z);
      if (p) {
        // kraeftiger ballistischer Auswurf
        const a = (i / count) * Math.PI * 2 + this.world.rngDrops.next();
        const s = 3 + this.world.rngDrops.next() * 5;
        p.vx = Math.cos(a) * s;
        p.vz = Math.sin(a) * s;
      }
    }
  }

  /** Goldene Welle / Sturm-Kammer: jeder Gegner-Kern-Drop bekommt Extra-Kerne. */
  private spawnCoreMaybeGolden(x: number, z: number): void {
    this.spawn(PICKUP_CORE, x, z);
    // NEU (Reise-Modus): Sturm-Kern-Bonus laeuft ueber roomMods.coreDropBonus, NICHT
    // ueber goldenWave (das gehoert dem SurpriseDirector). ROOM_NORMAL = 0 -> No-Op.
    const extra = (this.world.goldenWave ? 1 : 0) + this.world.roomMods.coreDropBonus;
    for (let i = 0; i < extra; i++) {
      this.spawn(PICKUP_CORE, x + 0.35 * (i + 1), z + 0.35 * (i + 1));
    }
  }

  private spawn(kind: number, x: number, z: number) {
    const p = this.world.pickups.spawn();
    if (!p) return null;
    const lifetime = kind === PICKUP_HEART ? PICKUPS.heartLifetime : 0;
    initPickup(p, kind, x, z, lifetime);
    return p;
  }

  private countHearts(): number {
    let n = 0;
    const pool = this.world.pickups;
    for (let i = 0; i < pool.count; i++) {
      if (pool.get(i).kind === PICKUP_HEART) n++;
    }
    return n;
  }

  /** Wellenende: alle liegenden Kerne zum Spieler ziehen. */
  collectAllCores(): void {
    const pool = this.world.pickups;
    for (let i = 0; i < pool.count; i++) {
      const p = pool.get(i);
      if (p.kind === PICKUP_CORE) p.magnetized = true;
    }
  }

  update(dt: number): void {
    const world = this.world;
    const pool = world.pickups;
    if (this.magnetTimer > 0) this.magnetTimer -= dt;

    for (let i = pool.count - 1; i >= 0; i--) {
      const p = pool.get(i);
      p.prevX = p.x;
      p.prevZ = p.z;
      p.age += dt;

      // Herzen/Kapseln laufen ab (blinken die letzten Sekunden im Renderer)
      if (p.lifetime > 0 && p.age >= p.lifetime) {
        pool.despawn(i);
        continue;
      }

      // Koop: der NAECHSTE angreifbare Spieler ist Sog-Ziel und Einsammler
      const player = world.nearestAlivePlayer(p.x, p.z);
      const dx = player.x - p.x;
      const dz = player.z - p.z;
      const dist = Math.hypot(dx, dz);

      // Einsammeln (Herz heilt den, der es beruehrt)
      if (dist < PICKUPS.collectDistance + 0.2) {
        this.collect(p.kind, p.x, p.z, player);
        pool.despawn(i);
        continue;
      }

      // Magnet-Sog (Kapseln muessen bewusst abgeholt werden)
      const inRange = dist < player.stats.pickupRadius || this.magnetTimer > 0;
      if (inRange && p.kind !== PICKUP_CAPSULE) p.magnetized = true;

      if (p.magnetized && dist > 0.001) {
        // Homing mit Beschleunigung + leichter Seitwaertskomponente (Spiralbahn)
        const nx = dx / dist;
        const nz = dz / dist;
        p.vx += (nx + nz * 0.2) * PICKUPS.coreFlyAccel * dt;
        p.vz += (nz - nx * 0.2) * PICKUPS.coreFlyAccel * dt;
        const speed = Math.hypot(p.vx, p.vz);
        if (speed > PICKUPS.coreMaxSpeed) {
          p.vx = (p.vx / speed) * PICKUPS.coreMaxSpeed;
          p.vz = (p.vz / speed) * PICKUPS.coreMaxSpeed;
        }
      } else {
        // Auswurf-Impuls daempfen
        const dampF = Math.exp(-3 * dt);
        p.vx *= dampF;
        p.vz *= dampF;
      }

      p.x += p.vx * dt;
      p.z += p.vz * dt;

      const maxR = ARENA_RADIUS - 0.4;
      const d = Math.hypot(p.x, p.z);
      if (d > maxR) {
        p.x = (p.x / d) * maxR;
        p.z = (p.z / d) * maxR;
        p.vx *= -0.4;
        p.vz *= -0.4;
      }
    }
  }

  private collect(kind: number, x: number, z: number, collector: Player): void {
    const world = this.world;
    if (kind === PICKUP_CORE) {
      world.runCores += 1;
      this.events.emit('pickupCollected', { kind: 'core', x, z, value: 1 });
      this.events.emit('coresChanged', { runCores: world.runCores });
    } else if (kind === PICKUP_HEART) {
      collector.heal(PICKUPS.heartHeal);
      this.events.emit('pickupCollected', { kind: 'heart', x, z, value: PICKUPS.heartHeal });
    } else if (kind === PICKUP_CAPSULE) {
      this.openCapsule(x, z, collector);
    } else {
      this.magnetTimer = PICKUPS.magnetDuration;
      this.events.emit('pickupCollected', { kind: 'magnet', x, z, value: 0 });
    }
  }

  /** Kapsel-Belohnung: gewichteter Zufall (rngDrops — spielerabhaengig erlaubt). */
  private openCapsule(x: number, z: number, collector: Player): void {
    const world = this.world;
    const cfg = SURPRISE.capsule;
    const weights = cfg.rewards[world.difficulty];
    const roll = world.rngDrops.next() * (weights.cores + weights.hearts + weights.magnet + weights.rapidFire);
    let kind: 'cores' | 'hearts' | 'magnet' | 'rapidFire';
    if (roll < weights.cores) {
      kind = 'cores';
      this.spawnCoreFountain(x, z, cfg.rewardCores);
    } else if (roll < weights.cores + weights.hearts) {
      kind = 'hearts';
      // bewusst am maxHearts-Deckel vorbei — die Kapsel ist das Geschenk
      for (let i = 0; i < cfg.rewardHearts; i++) this.spawn(PICKUP_HEART, x + 0.4 * (i + 1), z - 0.3 * i);
    } else if (roll < weights.cores + weights.hearts + weights.magnet) {
      kind = 'magnet';
      this.magnetTimer = PICKUPS.magnetDuration;
    } else {
      kind = 'rapidFire';
      collector.rapidFireTimer = cfg.rapidFireDuration;
    }
    this.events.emit('pickupCollected', { kind: 'capsule', x, z, value: 0 });
    this.events.emit('capsuleReward', { x, z, kind });
  }
}
