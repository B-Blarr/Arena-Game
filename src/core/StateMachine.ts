export interface GameState {
  enter(): void;
  exit(): void;
  update(dt: number): void;
  render(alpha: number, rawDt: number): void;
}

/** Top-Level-FSM: Menu -> Run -> GameOver -> (Shop <-> Menu). */
export class StateMachine {
  private current: GameState | null = null;

  change(next: GameState): void {
    this.current?.exit();
    this.current = next;
    next.enter();
  }

  update(dt: number): void {
    this.current?.update(dt);
  }

  render(alpha: number, rawDt: number): void {
    this.current?.render(alpha, rawDt);
  }

  /** FIX: aktiven State sauber verlassen (entfernt dessen window-Listener) — sonst
   *  leakt jeder HMR-Reload einen keydown-Handler auf einen entsorgten State. */
  dispose(): void {
    this.current?.exit();
    this.current = null;
  }
}
