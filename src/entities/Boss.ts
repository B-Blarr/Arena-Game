import {
  bossCooldownMult,
  bossProjectileSpeedMult,
  type BossDef,
} from '../config/bosses';
import type { EventBus } from '../core/EventBus';

export interface BossMini {
  active: boolean;
  x: number;
  z: number;
  prevX: number;
  prevZ: number;
  hp: number;
  maxHp: number;
  fireTimer: number;
  flashTimer: number;
  scalePop: number;
  radius: number;
}

function makeMini(): BossMini {
  return {
    active: false, x: 0, z: 0, prevX: 0, prevZ: 0,
    hp: 1, maxHp: 1, fireTimer: 2, flashTimer: 0, scalePop: 0, radius: 0.8,
  };
}

/** MINOS: gelegte Sprengzone (roter Warn-Ring via enemyFuse-Event). */
export interface BossBomb {
  active: boolean;
  x: number;
  z: number;
  fuseLeft: number;
}

function makeBomb(): BossBomb {
  return { active: false, x: 0, z: 0, fuseLeft: 0 };
}

export const MAX_BOSS_BOMBS = 8;

export type BossState = 'chase' | 'telegraph' | 'charging' | 'stunned';

/**
 * Boss-Datenhalter. Die Muster-Logik lebt in bossPatterns.ts,
 * die Optik im InstancedRenderer.
 */
export class Boss {
  def!: BossDef;
  tier = 0;
  x = 0;
  z = 0;
  prevX = 0;
  prevZ = 0;
  hp = 1;
  maxHp = 1;
  phase2 = false;
  /** HYDRA: waehrend der Mini-Phase unsichtbar/unverwundbar. */
  hidden = false;
  flashTimer = 0;
  scalePop = 0;
  /** > 0 waehrend eines Telegraphs — Renderer pulsiert den Boss. */
  telegraphGlow = 0;
  yRot = 0;
  contactDamageNow = 0;
  damageTakenMult = 1;
  projectileDamage = 10;

  state: BossState = 'chase';
  stateTimer = 0;
  salvoTimer = 0;
  salvoAngle = 0;
  salvoTelegraphed = false;
  trioTimer = 0;
  trioShotsLeft = 0;
  trioGapTimer = 0;
  chargeTimer = 0;
  chargeDirX = 0;
  chargeDirZ = 1;
  shockTimer = 0;
  /** Eigener Countdown fuer den Schock-Telegraph — stateTimer gehoert dem Charge. */
  shockTelegraphLeft = 0;
  shockActive = false;
  shockR = 0;
  /** Bitmaske pro playerIndex: wer wurde von diesem Ring schon geprueft. */
  shockHitMask = 0;
  shockX = 0;
  shockZ = 0;
  summonTimer = 0;
  fanTimer = 0;
  fanTelegraphed = false;
  callTimer = 0;
  splitIndex = 0;
  readonly minis: BossMini[] = [makeMini(), makeMini()];

  // GOLIATH v2: Billard-Abpraller + Doppel-Schockwelle
  bouncesLeft = 0;
  /** > 0 = zweite Schockwelle steht aus (Countdown bis zum Ausloesen). */
  shock2Countdown = 0;
  shock2Active = false;
  shock2R = 0;
  shock2HitMask = 0;

  // MINOS: Bomben-Zonen + Orbit
  readonly bombs: BossBomb[] = Array.from({ length: MAX_BOSS_BOMBS }, makeBomb);
  plantTimer = 0;
  strafeTimer = 0;
  strafeSign = 1;
  /** Koop: Bomben-Ziel alterniert deterministisch zwischen den Spielern. */
  bombTargetIdx = 0;

  // WIRBEL: Sog-Zyklus
  suctionTimer = 0;
  suctionLeft = 0;
  suctionTelegraphed = false;
  spiralTimer = 0;
  collapseTelegraphed = false;

  /** "+"-Varianten: alle Cooldowns x0.8^tier (Deckel 0.5), Projektile schneller. */
  cdMult = 1;
  projSpeedMult = 1;

  init(def: BossDef, tier: number, maxHp: number, projectileDamage: number): void {
    this.def = def;
    this.tier = tier;
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.phase2 = false;
    this.hidden = false;
    this.flashTimer = 0;
    this.scalePop = 0;
    this.telegraphGlow = 0;
    this.yRot = 0;
    this.contactDamageNow = def.contactDamage;
    this.damageTakenMult = 1;
    this.projectileDamage = projectileDamage;
    this.cdMult = bossCooldownMult(tier);
    this.projSpeedMult = bossProjectileSpeedMult(tier);

    this.state = 'chase';
    this.stateTimer = 0;
    this.salvoTimer = (def.salvoInterval ?? 0) * this.cdMult;
    this.salvoAngle = 0;
    this.salvoTelegraphed = false;
    this.trioTimer = (def.trioInterval ?? 0) * this.cdMult * 0.5; // versetzt starten
    this.trioShotsLeft = 0;
    this.trioGapTimer = 0;
    this.chargeTimer = (def.chargeInterval ?? 0) * this.cdMult;
    this.shockTimer = (def.shockInterval ?? 0) * this.cdMult * 0.6;
    this.summonTimer = 0;
    this.fanTimer = (def.fanInterval ?? 0) * this.cdMult;
    this.fanTelegraphed = false;
    this.callTimer = (def.callInterval ?? 0) * this.cdMult;
    this.splitIndex = 0;
    // Schockwellen-Zustand komplett zuruecksetzen — die Boss-Instanz wird
    // ueber die gesamte App-Lebensdauer wiederverwendet (Phantom-Schock sonst!)
    this.shockActive = false;
    this.shockR = 0;
    this.shockHitMask = 0;
    this.shockTelegraphLeft = 0;
    this.shockX = 0;
    this.shockZ = 0;
    for (const m of this.minis) m.active = false;
    // GOLIATH v2 (Phantom-Bounce/-Schock2 verhindern)
    this.bouncesLeft = 0;
    this.shock2Countdown = 0;
    this.shock2Active = false;
    this.shock2R = 0;
    this.shock2HitMask = 0;
    // MINOS (Phantom-Bomben verhindern)
    for (const b of this.bombs) b.active = false;
    this.plantTimer = (def.plantInterval ?? 0) * this.cdMult * 0.6;
    this.strafeTimer = def.strafeFlip ?? 0;
    this.strafeSign = 1;
    this.bombTargetIdx = 0;
    // WIRBEL (Phantom-Sog verhindern)
    this.suctionTimer = (def.suctionInterval ?? 0) * this.cdMult * 0.7;
    this.suctionLeft = 0;
    this.suctionTelegraphed = false;
    this.spiralTimer = 0;
    this.collapseTelegraphed = false;

    // Spawn am Rand gegenueber der Mitte
    this.x = 0;
    this.z = -14;
    this.prevX = this.x;
    this.prevZ = this.z;
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  takeDamage(amount: number, events: EventBus): void {
    if (this.hidden || this.hp <= 0) return;
    this.hp = Math.max(0, this.hp - amount * this.damageTakenMult);
    this.flashTimer = 0.08;
    this.scalePop = 0.12;
    events.emit('bossHpChanged', { hp: this.hp, maxHp: this.maxHp });
  }
}
