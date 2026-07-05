import type { Time } from './Time';

export const FIXED_DT = 1 / 60;
const MAX_FRAME_TIME = 0.1; // dt-Clamp: nach Tab-Wechsel max. 100 ms nachholen
const MAX_STEPS = 5; // danach Rest verwerfen -> kurze Zeitlupe statt Spiral of Death

/**
 * Fixed-Timestep-Loop (60 Hz) mit Accumulator und Render-Interpolation.
 * Der Accumulator waechst mit rawDt * timeScale — Hitstop/Zeitlupe/Freeze
 * bremsen so die Simulation, ohne die Schrittweite zu aendern.
 */
export class GameLoop {
  private rafId = 0;
  private last = 0;
  private acc = 0;
  running = false;

  constructor(
    private readonly time: Time,
    private readonly update: (dt: number) => void,
    private readonly render: (alpha: number, rawDt: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    const rawDt = Math.min((now - this.last) / 1000, MAX_FRAME_TIME);
    this.last = now;

    this.time.update(rawDt);
    this.acc += rawDt * this.time.scale;

    let steps = 0;
    while (this.acc >= FIXED_DT && steps < MAX_STEPS) {
      this.update(FIXED_DT);
      this.acc -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_STEPS) this.acc = 0;

    this.render(this.acc / FIXED_DT, rawDt);
  };
}
