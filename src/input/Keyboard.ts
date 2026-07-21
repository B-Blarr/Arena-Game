/**
 * Tastatur-Tracking ueber e.code (physische Taste) — funktioniert auf
 * QWERTZ/QWERTY/AZERTY identisch. justPressed wird pro Sim-Step geleert,
 * damit Dash/Pause sauber edge-getriggert sind.
 */
export class Keyboard {
  private down = new Set<string>();
  private justPressed = new Set<string>();
  private disposers: Array<() => void> = [];

  // Verhindert Seiten-Scrollen durch Pfeile/Leertaste
  private static readonly PREVENT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

  constructor() {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (Keyboard.PREVENT.has(e.code)) e.preventDefault();
      if (!e.repeat) {
        this.justPressed.add(e.code);
      }
      this.down.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      this.down.delete(e.code);
    };
    const onBlur = (): void => this.reset();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    this.disposers.push(
      () => window.removeEventListener('keydown', onKeyDown),
      () => window.removeEventListener('keyup', onKeyUp),
      () => window.removeEventListener('blur', onBlur),
    );
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  wasJustPressed(code: string): boolean {
    return this.justPressed.has(code);
  }

  /** Nach jedem Sim-Step aufrufen. */
  clearFrame(): void {
    this.justPressed.clear();
  }

  reset(): void {
    this.down.clear();
    this.justPressed.clear();
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
  }
}
