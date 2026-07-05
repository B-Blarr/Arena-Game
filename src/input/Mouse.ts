/** Maus-Position in Normalized Device Coordinates + Button-Zustand. */
export class Mouse {
  /** NDC in [-1, 1]. */
  ndcX = 0;
  ndcY = 0;
  buttonDown = false;
  /** true, sobald sich die Maus einmal bewegt hat (sonst kein Maus-Zielen). */
  hasMoved = false;
  lastMoveTime = 0;

  private disposers: Array<() => void> = [];

  constructor() {
    const onMove = (e: MouseEvent): void => {
      this.ndcX = (e.clientX / window.innerWidth) * 2 - 1;
      this.ndcY = -(e.clientY / window.innerHeight) * 2 + 1;
      this.hasMoved = true;
      this.lastMoveTime = performance.now();
    };
    const onDown = (e: MouseEvent): void => {
      if (e.button === 0) this.buttonDown = true;
    };
    const onUp = (e: MouseEvent): void => {
      if (e.button === 0) this.buttonDown = false;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    this.disposers.push(
      () => window.removeEventListener('mousemove', onMove),
      () => window.removeEventListener('mousedown', onDown),
      () => window.removeEventListener('mouseup', onUp),
    );
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
  }
}
