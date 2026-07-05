import { lerp } from '../utils/math';

/**
 * Zentrale Zeit-Skalierung: Hitstop, Zeitlupe (Boss-Tod) und Freeze
 * (Upgrade-Screen) manipulieren nur timeScale. Der GameLoop skaliert
 * damit den Accumulator — die Simulation selbst laeuft immer in
 * fixen 1/60-Schritten (Determinismus bleibt erhalten).
 * UI/Audio/Kamera laufen auf Echtzeit weiter.
 */
export class Time {
  /** 0 = eingefroren (Upgrade-Screen/Pause), 1 = normal. */
  baseScale = 1;

  private hitstopLeft = 0;
  private hitstopCooldown = 0;
  private slowHold = 0;
  private slowScale = 1;
  private slowRampDur = 0;
  private slowRampLeft = 0;

  get scale(): number {
    if (this.baseScale === 0) return 0;
    if (this.hitstopLeft > 0) return 0.05;
    if (this.slowHold > 0) return this.slowScale;
    if (this.slowRampLeft > 0 && this.slowRampDur > 0) {
      const t = 1 - this.slowRampLeft / this.slowRampDur;
      return lerp(this.slowScale, 1, t);
    }
    return this.baseScale;
  }

  /** Tick auf Echtzeit (rawDt), unabhaengig von der Spielzeit. */
  update(rawDt: number): void {
    if (this.hitstopCooldown > 0) this.hitstopCooldown -= rawDt;
    if (this.hitstopLeft > 0) {
      this.hitstopLeft -= rawDt;
      return;
    }
    if (this.slowHold > 0) {
      this.slowHold -= rawDt;
      return;
    }
    if (this.slowRampLeft > 0) this.slowRampLeft -= rawDt;
  }

  /** Kurzer Freeze-Frame. Cooldown verhindert Stottern bei Multikills. */
  hitstop(sec: number): void {
    if (this.hitstopCooldown > 0) return;
    this.hitstopLeft = sec;
    this.hitstopCooldown = 0.25 + sec;
  }

  /** Zeitlupe mit anschliessender Rueckkehr-Rampe (Boss-Tod). */
  slowmo(scale: number, hold: number, rampOut: number): void {
    this.slowScale = scale;
    this.slowHold = hold;
    this.slowRampDur = rampOut;
    this.slowRampLeft = rampOut;
  }

  reset(): void {
    this.baseScale = 1;
    this.hitstopLeft = 0;
    this.hitstopCooldown = 0;
    this.slowHold = 0;
    this.slowRampLeft = 0;
  }
}
