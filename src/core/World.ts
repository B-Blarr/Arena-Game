import { Pool } from '../utils/Pool';
import { SpatialHash } from '../utils/SpatialHash';
import { makeEnemy, initEnemy, type Enemy, type EnemyScaling } from '../entities/Enemy';
import { makeProjectile, initProjectile, type Projectile } from '../entities/Projectile';
import { makePickup, type Pickup } from '../entities/Pickup';
import { Player } from '../entities/Player';
import type { Boss } from '../entities/Boss';
import {
  ARENA_RADIUS,
  COOP,
  DIFFICULTIES,
  LIMITS,
  POOLS,
  SURPRISE,
  enemyDamageFactor,
  enemyHpFactor,
  enemySpeedFactor,
  type Difficulty,
  type DifficultyMods,
} from '../config/balance';
import type { HeroDef } from '../config/heroes';
import { ROOM_NORMAL, type RoomDef } from '../config/rooms';
import {
  makeRng, Rng,
  RNG_STREAM_DROPS, RNG_STREAM_EVENTS, RNG_STREAM_HAZARD, RNG_STREAM_PATH, RNG_STREAM_SUMMONS,
  RNG_STREAM_UPGRADES, RNG_STREAM_UPGRADES_P2, RNG_STREAM_WAVES,
} from './Rng';
import type { EventBus } from './EventBus';

/** Startaufstellung eines Spielers (Solo: genau eine, Koop: zwei). */
export interface PlayerConfig {
  hero: HeroDef;
  weaponId: string;
  perma: Record<string, number>;
  autoAim: boolean;
}

/**
 * Gesamter Lauf-Zustand: Entity-Pools, Spieler (1 im Solo, 2 im Koop),
 * Boss, RNG-Streams. Pools sind einmalig vorallokiert; reset() recycelt
 * alles — ein Neustart baut NICHTS neu (leakfrei per Konstruktion).
 */
export class World {
  readonly enemies = new Pool<Enemy>(makeEnemy, POOLS.enemies);
  readonly playerProjectiles = new Pool<Projectile>(makeProjectile, POOLS.playerProjectiles);
  readonly enemyProjectiles = new Pool<Projectile>(makeProjectile, POOLS.enemyProjectiles);
  readonly pickups = new Pool<Pickup>(makePickup, POOLS.pickups);
  // NEU (Reise-Ausbau): fuer den groessten moeglichen Raum-Radius dimensioniert
  // (arenaMult ist auf <= 1.3 begrenzt), damit Gegner nie ausserhalb des Hash landen.
  readonly spatialHash = new SpatialHash(ARENA_RADIUS * 1.3 + 2, 4);

  /** Aktive Spieler (Laenge 1 oder 2). Instanzen sind vorallokiert. */
  readonly players: Player[] = [];
  private readonly playerSlots: [Player, Player];

  boss: Boss | null = null;
  wave = 0;
  difficulty: Difficulty = 'normal';
  mods: DifficultyMods = DIFFICULTIES.normal;
  /** Gleichzeitig-Limit fuer Gegner (Solo 40, Koop 60). */
  maxEnemiesLimit = LIMITS.maxEnemies;
  /** NEU (mythisch "Zeitbruch"): Zeitskala fuer NORMALE Gegner + deren Projektile.
   *  1 = normal, <1 = langsamer. Bosse laufen ueber einen eigenen Pfad und bleiben
   *  davon unberuehrt. RunState setzt den Wert pro Frame. */
  enemyTimeScale = 1;
  rngWaves: Rng = new Rng(1);
  rngUpgrades: Rng = new Rng(2);
  /** Koop: eigener Angebots-Stream fuer Spieler 2 (Solo unbenutzt). */
  rngUpgradesP2: Rng = new Rng(6);
  rngDrops: Rng = new Rng(3);
  rngSummons: Rng = new Rng(4);
  rngEvents: Rng = new Rng(5);
  /** NEU (Reise-Modus): Weg-Wahl-Angebote (eigener Stream, im Klassik nie gezogen). */
  rngPath: Rng = new Rng(7);
  /** NEU (Reise-Ausbau): Gefahren-Zonen-Positionen (Minenfeld). Eigener Stream,
   *  im Klassik nie gezogen -> Daily byte-identisch. */
  rngHazard: Rng = new Rng(9);
  /** Goldene Welle aktiv: doppelte Kern-Drops (SurpriseDirector setzt das Flag). */
  goldenWave = false;
  /** NEU (Reise-Modus): Raum-Modifikator der laufenden Welle. Klassik/Boss:
   *  ROOM_NORMAL (bit-exakte Identitaet). NIE world.mods mutieren, nur hier lesen. */
  roomMods: RoomDef = ROOM_NORMAL;
  /** NEU (Reise-Ausbau): Arena-Radius der laufenden Welle. Klassik/Boss/Normal:
   *  ARENA_RADIUS (22). RunState.startWave setzt roomMods.arenaMult ein. */
  arenaRadius = ARENA_RADIUS;
  /** In diesem Lauf gesammelte Kerne (geteilte Team-Waehrung). */
  runCores = 0;
  /** Spielzeit im Lauf (fuer Bob-Animationen etc.). */
  elapsed = 0;
  isDaily = false;

  private uidCounter = 0;
  private effectiveMods: DifficultyMods = { ...DIFFICULTIES.normal };

  constructor(readonly events: EventBus) {
    this.playerSlots = [new Player(events, 0), new Player(events, 1)];
    this.players.push(this.playerSlots[0]);
  }

  /**
   * Kompat-Alias auf players[0] — nur noch fuer Solo-Semantik erlaubt
   * (Menue-Backdrop, Tutorial). Gameplay-Systeme iterieren ueber players.
   */
  get player(): Player {
    return this.playerSlots[0];
  }

  get isCoop(): boolean {
    return this.players.length > 1;
  }

  nextUid(): number {
    return ++this.uidCounter;
  }

  reset(
    seed: number,
    difficulty: Difficulty,
    configs: readonly PlayerConfig[],
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

    // Effektive Mods als KOPIE — DIFFICULTIES darf nie mutiert werden.
    // Koop legt seine Multiplikatoren als weiteren Layer darueber.
    const base = DIFFICULTIES[difficulty];
    const coop = configs.length > 1;
    this.effectiveMods.playerHp = base.playerHp;
    this.effectiveMods.enemySpeed = base.enemySpeed;
    this.effectiveMods.enemyHp = base.enemyHp * (coop ? COOP.enemyHpMult : 1);
    this.effectiveMods.enemyDamage = base.enemyDamage;
    this.effectiveMods.budget = base.budget * (coop ? COOP.budgetMult : 1);
    this.effectiveMods.heartChance = base.heartChance * (coop ? COOP.heartChanceMult : 1);
    this.effectiveMods.coreMult = base.coreMult;
    this.effectiveMods.eliteChanceMult = base.eliteChanceMult;
    this.mods = this.effectiveMods;
    this.maxEnemiesLimit = coop ? COOP.maxEnemies : LIMITS.maxEnemies;

    this.rngWaves = makeRng(seed, RNG_STREAM_WAVES);
    this.rngUpgrades = makeRng(seed, RNG_STREAM_UPGRADES);
    this.rngUpgradesP2 = makeRng(seed, RNG_STREAM_UPGRADES_P2);
    this.rngDrops = makeRng(seed, RNG_STREAM_DROPS);
    this.rngSummons = makeRng(seed, RNG_STREAM_SUMMONS);
    this.rngEvents = makeRng(seed, RNG_STREAM_EVENTS);
    this.rngPath = makeRng(seed, RNG_STREAM_PATH);
    this.rngHazard = makeRng(seed, RNG_STREAM_HAZARD);
    this.goldenWave = false;
    // NEU (Reise-Modus): roomMods BEDINGUNGSLOS neutralisieren — sonst leckt ein
    // vorheriger Reise-Lauf in einen danach gestarteten (klassischen) Daily.
    this.roomMods = ROOM_NORMAL;
    // NEU (Reise-Ausbau): Arena-Radius neutralisieren, sonst leckt ein Reise-Lauf
    // (kleinere/groessere Arena) in einen danach gestarteten Daily.
    this.arenaRadius = ARENA_RADIUS;
    this.enemyTimeScale = 1; // NEU: Zeitbruch startet jeden Lauf inaktiv
    this.runCores = 0;
    this.elapsed = 0;
    this.isDaily = isDaily;
    this.uidCounter = 0;

    this.players.length = 0;
    for (let i = 0; i < configs.length && i < 2; i++) {
      const cfg = configs[i] as PlayerConfig;
      const p = this.playerSlots[i as 0 | 1];
      // Koop: nebeneinander starten (Solo exakt mittig wie bisher)
      const startX = coop ? (i === 0 ? -COOP.spawnOffsetX : COOP.spawnOffsetX) : 0;
      p.reset(cfg.hero, cfg.weaponId, this.mods, cfg.perma, startX);
      p.hasTeammate = coop;
      p.autoAim = cfg.autoAim;
      this.players.push(p);
    }
  }

  // ------------------------------------------------ Spieler-Helfer

  /**
   * Naechster angreifbarer Spieler zu (x, z) — DIE Targeting-Funktion fuer
   * Gegner und Bosse. Fallback players[0], nie null (behaviors bleibt auch
   * in der Sterbe-Phase total). Solo ist das exakt der bisherige Spieler.
   */
  nearestAlivePlayer(x: number, z: number): Player {
    let best: Player | null = null;
    let bestD2 = Infinity;
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i] as Player;
      if (!p.targetable) continue;
      const dx = p.x - x;
      const dz = p.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = p;
      }
    }
    return best ?? (this.playerSlots[0] as Player);
  }

  /** Niedrigster HP-Anteil der angreifbaren Spieler (Mitleids-Herzen). */
  minAliveHpFrac(): number {
    let min = 1;
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i] as Player;
      if (!p.targetable) continue;
      const frac = p.hp / p.stats.maxHp;
      if (frac < min) min = frac;
    }
    return min;
  }

  /** Hoechster Kern-Chance-Multiplikator im Team (Kern-Gier/Glueckskern). */
  maxCoreChanceMult(): number {
    let max = 0;
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i] as Player;
      if (p.stats.coreChanceMult > max) max = p.stats.coreChanceMult;
    }
    return max || 1;
  }

  /** Alle Spieler down/tot? (Koop-Game-Over-Bedingung) */
  allPlayersDown(): boolean {
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i] as Player;
      if (p.targetable) return false;
    }
    return true;
  }

  scalingForWave(w: number): EnemyScaling {
    // Goldene Welle: auf Normal/Schwer flottere Gegner als Gegengewicht —
    // auf Einfach reine Belohnung (Kindermodus).
    const goldenSpeed = this.goldenWave && this.difficulty !== 'easy' ? SURPRISE.goldenSpeedMult : 1;
    // NEU (Reise-Modus): Raum-Modifikator stapelt multiplikativ (ROOM_NORMAL = x1.0 -> No-Op).
    const rm = this.roomMods;
    return {
      hp: enemyHpFactor(w) * this.mods.enemyHp * rm.hpMult,
      speed: enemySpeedFactor(w) * this.mods.enemySpeed * goldenSpeed * rm.speedMult,
      damage: enemyDamageFactor(w) * this.mods.enemyDamage * rm.damageMult,
      // NEU (Reise-Ausbau): Raum-Groessenfaktor fuer ALLE Gegner (Schwarm winzig,
      // Oase leicht kleiner). ROOM_NORMAL laesst enemyScaleMult weg -> 1 -> No-Op.
      size: rm.enemyScaleMult ?? 1,
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
    fromBoss = false, // NEU: Boss-Projektile werden vom "Zeitbruch"-Slow ausgenommen
  ): Projectile | null {
    const p = this.enemyProjectiles.spawn();
    if (!p) return null;
    initProjectile(p, x, z, dirX, dirZ, speed, damage, range);
    p.radius = 0.19;
    p.fromBoss = fromBoss;
    return p;
  }
}
