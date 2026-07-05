import { Pool } from '../utils/Pool';
import { SpatialHash } from '../utils/SpatialHash';
import { makeEnemy, initEnemy, type Enemy, type EnemyScaling } from '../entities/Enemy';
import { makeProjectile, initProjectile, type Projectile } from '../entities/Projectile';
import { makePickup, type Pickup } from '../entities/Pickup';
import { Player } from '../entities/Player';
import type { Boss } from '../entities/Boss';
import {
  ARENA_RADIUS,
  DIFFICULTIES,
  SURPRISE,
  enemyDamageFactor,
  enemyHpFactor,
  enemySpeedFactor,
  type Difficulty,
  type DifficultyMods,
} from '../config/balance';
import type { HeroDef } from '../config/heroes';
import { makeRng, Rng, RNG_STREAM_DROPS, RNG_STREAM_EVENTS, RNG_STREAM_SUMMONS, RNG_STREAM_UPGRADES, RNG_STREAM_WAVES } from './Rng';
import type { EventBus } from './EventBus';

/**
 * Gesamter Lauf-Zustand: Entity-Pools, Spieler, Boss, RNG-Streams.
 * Pools sind einmalig vorallokiert; reset() recycelt alles —
 * ein Neustart baut NICHTS neu (leakfrei per Konstruktion).
 */
export class World {
  readonly enemies = new Pool<Enemy>(makeEnemy, 192);
  readonly playerProjectiles = new Pool<Projectile>(makeProjectile, 256);
  readonly enemyProjectiles = new Pool<Projectile>(makeProjectile, 128);
  readonly pickups = new Pool<Pickup>(makePickup, 256);
  readonly spatialHash = new SpatialHash(ARENA_RADIUS + 2, 4);
  readonly player: Player;

  boss: Boss | null = null;
  wave = 0;
  difficulty: Difficulty = 'normal';
  mods: DifficultyMods = DIFFICULTIES.normal;
  rngWaves: Rng = new Rng(1);
  rngUpgrades: Rng = new Rng(2);
  rngDrops: Rng = new Rng(3);
  rngSummons: Rng = new Rng(4);
  rngEvents: Rng = new Rng(5);
  /** Goldene Welle aktiv: doppelte Kern-Drops (SurpriseDirector setzt das Flag). */
  goldenWave = false;
  /** In diesem Lauf gesammelte Kerne. */
  runCores = 0;
  /** Spielzeit im Lauf (fuer Bob-Animationen etc.). */
  elapsed = 0;
  isDaily = false;

  private uidCounter = 0;

  constructor(readonly events: EventBus) {
    this.player = new Player(events);
  }

  /** true = 2-Spieler-Koop (kommt mit dem Koop-Umbau; solo immer false). */
  get isCoop(): boolean {
    return false;
  }

  nextUid(): number {
    return ++this.uidCounter;
  }

  reset(
    seed: number,
    difficulty: Difficulty,
    hero: HeroDef,
    weaponId: string,
    perma: Record<string, number>,
    isDaily: boolean,
  ): void {
    this.enemies.clear();
    this.playerProjectiles.clear();
    this.enemyProjectiles.clear();
    this.pickups.clear();
    this.spatialHash.clear();
    this.boss = null;
    this.wave = 0;
    this.difficulty = difficulty;
    this.mods = DIFFICULTIES[difficulty];
    this.rngWaves = makeRng(seed, RNG_STREAM_WAVES);
    this.rngUpgrades = makeRng(seed, RNG_STREAM_UPGRADES);
    this.rngDrops = makeRng(seed, RNG_STREAM_DROPS);
    this.rngSummons = makeRng(seed, RNG_STREAM_SUMMONS);
    this.rngEvents = makeRng(seed, RNG_STREAM_EVENTS);
    this.goldenWave = false;
    this.runCores = 0;
    this.elapsed = 0;
    this.isDaily = isDaily;
    this.uidCounter = 0;
    this.player.reset(hero, weaponId, this.mods, perma);
  }

  scalingForWave(w: number): EnemyScaling {
    // Goldene Welle: auf Normal/Schwer flottere Gegner als Gegengewicht —
    // auf Einfach reine Belohnung (Kindermodus).
    const goldenSpeed = this.goldenWave && this.difficulty !== 'easy' ? SURPRISE.goldenSpeedMult : 1;
    return {
      hp: enemyHpFactor(w) * this.mods.enemyHp,
      speed: enemySpeedFactor(w) * this.mods.enemySpeed * goldenSpeed,
      damage: enemyDamageFactor(w) * this.mods.enemyDamage,
    };
  }

  spawnEnemy(type: number, x: number, z: number, scaling: EnemyScaling): Enemy | null {
    const e = this.enemies.spawn();
    if (!e) return null;
    initEnemy(e, type, x, z, scaling, this.nextUid());
    return e;
  }

  spawnEnemyProjectile(
    x: number, z: number,
    dirX: number, dirZ: number,
    speed: number, damage: number, range: number,
  ): Projectile | null {
    const p = this.enemyProjectiles.spawn();
    if (!p) return null;
    initProjectile(p, x, z, dirX, dirZ, speed, damage, range);
    p.radius = 0.19;
    return p;
  }
}
