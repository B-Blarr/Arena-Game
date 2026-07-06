import {
  ARENA_RADIUS,
  COOP,
  SPAWN,
  enemyDamageFactor,
  enemyHpFactor,
  isBossWave,
  waveBudget,
} from '../config/balance';
import type { Player } from '../entities/Player';
import { AFFIX_RAGE, AFFIX_SHIELD, ELITE, ENEMIES, ENEMY_CHASER, type EnemyDef } from '../config/enemies';
import { bossForWave, bossHp } from '../config/bosses';
import type { EventBus } from '../core/EventBus';
import type { World } from '../core/World';
import { applyElite } from '../entities/Enemy';
import { Boss } from '../entities/Boss';

interface PendingTelegraph {
  type: number;
  affix: number;
  x: number;
  z: number;
  timer: number;
}

/**
 * Wellen-Komposition per Budget-System, gestaffelte Portal-Spawns mit
 * Telegraph, Gleichzeitig-Limit mit Warteschlange, Boss-Spawns alle 5 Wellen.
 * Nutzt ausschliesslich rngWaves — Daily Seed ergibt identische Wellen.
 * pending-Eintraege kodieren `type | (eliteAffix << 8)`.
 */
export class WaveSystem {
  private pending: number[] = [];
  private telegraphs: PendingTelegraph[] = [];
  private packTimer = 0;
  private carryover = 0;
  bossActive = false;
  private readonly bossInstance = new Boss();

  constructor(
    private readonly world: World,
    private readonly events: EventBus,
  ) {}

  reset(): void {
    this.pending.length = 0;
    this.telegraphs.length = 0;
    this.packTimer = 0;
    this.carryover = 0;
    this.bossActive = false;
  }

  startWave(w: number): void {
    this.world.wave = w;
    if (isBossWave(w)) {
      this.spawnBoss(w);
      this.events.emit('waveStarted', { wave: w, isBossWave: true });
      return;
    }
    this.compose(w);
    this.packTimer = 0.6; // erstes Paket kommt zuegig
    this.events.emit('waveStarted', { wave: w, isBossWave: false });
  }

  /** Boss-Wellen haben KEIN Budget — nur der Boss (uebersichtlich fuer Kinder). */
  private spawnBoss(w: number): void {
    const { def, tier } = bossForWave(w);
    // Koop: Boss-HP zusaetzlich erhoeht — Einzelziel gegen doppelten DPS
    const coopMult = this.world.isCoop ? COOP.bossHpExtra : 1;
    const hp = Math.round(bossHp(w, enemyHpFactor(w), this.world.mods.enemyHp) * coopMult);
    const projDamage = Math.max(4, Math.round(10 * enemyDamageFactor(w) * this.world.mods.enemyDamage));
    this.bossInstance.init(def, tier, hp, projDamage);
    this.world.boss = this.bossInstance;
    this.bossActive = true;
    this.events.emit('bossSpawned', { name: def.id, maxHp: hp, x: this.bossInstance.x, z: this.bossInstance.z });
  }

  bossDefeated(): void {
    this.bossActive = false;
    this.world.boss = null;
  }

  private costPerUnit(def: EnemyDef): number {
    return def.budgetCost / def.groupSize;
  }

  private compose(w: number): void {
    const world = this.world;
    const rng = world.rngWaves;
    const isEasy = world.difficulty === 'easy';
    const total = Math.round(waveBudget(w) * world.mods.budget) + this.carryover;
    let remaining = total;
    const spent = new Array<number>(ENEMIES.length).fill(0);

    // Elite-Roll: seltene verstaerkte Einzel-Gegner (max. 2 pro Welle).
    // Laeuft ueber rngWaves — Daily Seed ergibt identische Elite-Plaene.
    const eliteMinWave = isEasy ? ELITE.minWaveEasy : ELITE.minWave;
    const eliteChance = Math.min(
      ELITE.baseChance + ELITE.chancePerWave * (w - eliteMinWave),
      ELITE.maxChance,
    ) * world.mods.eliteChanceMult;
    let elitesThisWave = 0;

    const buy = (type: number): void => {
      const def = ENEMIES[type] as EnemyDef;
      remaining -= def.budgetCost;
      spent[type] = (spent[type] as number) + def.budgetCost;
      let affix = 0;
      if (
        w >= eliteMinWave &&
        elitesThisWave < ELITE.maxPerWave &&
        ELITE.eligible.includes(type) &&
        rng.chance(eliteChance)
      ) {
        affix = rng.chance(0.5) ? AFFIX_SHIELD : AFFIX_RAGE;
        elitesThisWave++;
      }
      // Affix im pending-Eintrag kodiert (Typ bleibt in den unteren 8 Bit)
      for (let g = 0; g < def.groupSize; g++) this.pending.push(type | (affix << 8));
    };

    // Lesbarkeit fuer Einsteiger: W1-7 mindestens 30 % Verfolger
    if (w <= 7) {
      const target = total * 0.3;
      while ((spent[ENEMY_CHASER] as number) < target && remaining >= 4) buy(ENEMY_CHASER);
    }

    // Restbudget zufaellig verteilen (Anteils-Deckel je Typ beachten)
    for (let guard = 0; guard < 200; guard++) {
      const candidates: number[] = [];
      for (let t = 0; t < ENEMIES.length; t++) {
        const def = ENEMIES[t] as EnemyDef;
        const minWave = isEasy ? (def.minWaveEasy ?? def.minWave) : def.minWave;
        if (def.budgetCost <= 0 || minWave > w) continue;
        if (def.budgetCost > remaining) continue;
        if ((spent[t] as number) + def.budgetCost > total * def.budgetShare) continue;
        candidates.push(t);
      }
      if (candidates.length === 0) break;
      buy(rng.pick(candidates));
    }
    // Rest wird auf die naechste Welle uebertragen (gedeckelt)
    this.carryover = Math.min(remaining, 20);

    // Mischen, damit Pakete bunt sind (Fisher-Yates mit rngWaves)
    for (let i = this.pending.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      const tmp = this.pending[i] as number;
      this.pending[i] = this.pending[j] as number;
      this.pending[j] = tmp;
    }
  }

  update(dt: number): void {
    // Telegraphierte Spawns ausloesen
    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const t = this.telegraphs[i] as PendingTelegraph;
      t.timer -= dt;
      if (t.timer <= 0) {
        const scaling = this.world.scalingForWave(this.world.wave);
        const e = this.world.spawnEnemy(t.type, t.x, t.z, scaling);
        if (e) {
          e.spawnProtection = 0.3;
          if (t.affix > 0) {
            applyElite(e, t.affix);
            this.events.emit('eliteSpawned', { x: e.x, z: e.z, enemyType: e.type, affix: t.affix });
          }
        }
        this.telegraphs.splice(i, 1);
      }
    }

    // Naechstes Spawn-Paket
    if (this.pending.length > 0) {
      this.packTimer -= dt;
      if (this.packTimer <= 0) {
        this.packTimer = SPAWN.packInterval;
        this.emitPack();
      }
    }
  }

  private emitPack(): void {
    const world = this.world;
    const headroom = world.maxEnemiesLimit - world.enemies.count - this.telegraphs.length;
    if (headroom <= 0) {
      this.packTimer = 1; // frueh wieder pruefen
      return;
    }

    const packBudget = world.isCoop ? COOP.packBudget : SPAWN.packBudget;
    let cost = 0;
    let spawned = 0;
    let attempts = 0;
    while (this.pending.length > 0 && cost < packBudget && spawned < headroom && attempts < 50) {
      attempts++;
      // Eintraege sind kodiert: Typ in Bit 0-7, Elite-Affix ab Bit 8
      const raw = this.pending[0] as number;
      const type = raw & 0xff;
      const affix = raw >> 8;
      const def = ENEMIES[type] as EnemyDef;

      // Gleichzeitig-Limit pro Typ (Tank max. 3)
      if (def.maxAlive > 0 && this.countAlive(type) + this.countTelegraphed(type) >= def.maxAlive) {
        // ans Ende schieben und spaeter erneut versuchen
        this.pending.push(this.pending.shift() as number);
        continue;
      }
      this.pending.shift();

      const portal = this.pickPortal();
      this.telegraphs.push({ type, affix, x: portal.x, z: portal.z, timer: SPAWN.telegraphTime });
      this.events.emit('portalOpened', { x: portal.x, z: portal.z });
      cost += this.costPerUnit(def);
      spawned++;
    }
  }

  /** 6 feste Portale am Rand; nie naeher als 8 u an IRGENDEINEM Spieler.
   *  RNG-Zugzahl bleibt exakt wie im Solo (Daily-Determinismus). */
  private pickPortal(): { x: number; z: number } {
    const world = this.world;
    const rng = world.rngWaves;
    const r = ARENA_RADIUS - 2;
    const eligible: number[] = [];
    let farthest = 0;
    let farthestDist = -1;
    for (let i = 0; i < SPAWN.portalCount; i++) {
      const a = (i / SPAWN.portalCount) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      let d = Infinity;
      for (let k = 0; k < world.players.length; k++) {
        const p = world.players[k] as Player;
        if (!p.targetable) continue;
        const pd = Math.hypot(x - p.x, z - p.z);
        if (pd < d) d = pd;
      }
      if (d === Infinity) d = Math.hypot(x - world.player.x, z - world.player.z);
      if (d >= SPAWN.minPlayerDistance) eligible.push(i);
      if (d > farthestDist) {
        farthestDist = d;
        farthest = i;
      }
    }
    const idx = eligible.length > 0 ? rng.pick(eligible) : farthest;
    const a = (idx / SPAWN.portalCount) * Math.PI * 2;
    // kleiner Jitter, damit Gruppen nicht exakt stapeln
    const jitterA = a + rng.range(-0.15, 0.15);
    const jitterR = r - rng.range(0, 1.5);
    return { x: Math.cos(jitterA) * jitterR, z: Math.sin(jitterA) * jitterR };
  }

  private countAlive(type: number): number {
    let n = 0;
    const pool = this.world.enemies;
    for (let i = 0; i < pool.count; i++) {
      if (pool.get(i).type === type) n++;
    }
    return n;
  }

  private countTelegraphed(type: number): number {
    let n = 0;
    for (const t of this.telegraphs) if (t.type === type) n++;
    return n;
  }

  get spawningDone(): boolean {
    return this.pending.length === 0 && this.telegraphs.length === 0;
  }

  isWaveCleared(): boolean {
    if (this.bossActive) return false;
    return this.spawningDone && this.world.enemies.count === 0;
  }
}
