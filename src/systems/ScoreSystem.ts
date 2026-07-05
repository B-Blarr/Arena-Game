import { COMBO, SCORE } from '../config/balance';
import type { EventBus } from '../core/EventBus';

/**
 * Punkte + Combo. Kills in schneller Folge steigern den Multiplikator;
 * ein erlittener Treffer bricht die Kette (belohnt sauberes Spiel).
 */
export class ScoreSystem {
  score = 0;
  comboKills = 0;
  comboTimer = 0;
  multiplier = 1;

  private readonly unsubs: Array<() => void> = [];

  constructor(private readonly events: EventBus) {
    this.unsubs.push(
      events.on('enemyKilled', (e) => this.onKill(e.points)),
      events.on('playerHit', () => this.breakCombo()),
    );
  }

  reset(): void {
    this.score = 0;
    this.comboKills = 0;
    this.comboTimer = 0;
    this.multiplier = 1;
  }

  private onKill(points: number): void {
    this.comboKills++;
    this.comboTimer = COMBO.window;
    const oldMult = this.multiplier;
    this.multiplier = 1;
    for (const [threshold, mult] of COMBO.tiers) {
      if (this.comboKills >= threshold) this.multiplier = mult;
    }
    this.addRaw(Math.round(points * this.multiplier));
    if (this.multiplier !== oldMult || this.comboKills >= (COMBO.tiers[0]?.[0] ?? 5)) {
      this.events.emit('comboChanged', { kills: this.comboKills, multiplier: this.multiplier });
    }
  }

  private breakCombo(): void {
    if (this.comboKills === 0) return;
    this.comboKills = 0;
    this.comboTimer = 0;
    this.multiplier = 1;
    this.events.emit('comboBroken', {});
  }

  update(dt: number): void {
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.breakCombo();
    }
  }

  /** Anteil [0..1] der Combo-Restzeit (fuer den HUD-Ring). */
  get comboTimeFrac(): number {
    return this.comboTimer > 0 ? this.comboTimer / COMBO.window : 0;
  }

  addRaw(points: number): void {
    if (points <= 0) return;
    this.score += points;
    this.events.emit('scoreChanged', { score: this.score, delta: points });
  }

  /** Wellen-Abschluss-Bonus; "Perfekt!" (kein Treffer) gibt +50 %. */
  waveBonus(wave: number, perfect: boolean): number {
    let bonus = SCORE.waveBonusPerWave * wave;
    if (perfect) bonus += Math.round(bonus * SCORE.perfectBonusFrac);
    this.addRaw(bonus);
    return bonus;
  }

  bossBonus(bossNr: number): number {
    const bonus = SCORE.bossBonusPerNr * bossNr;
    this.addRaw(bonus);
    return bonus;
  }

  dispose(): void {
    for (const u of this.unsubs) u();
  }
}
