/**
 * Gamepad-Unterstuetzung: linker Stick = Bewegung, rechter Stick = Zielen
 * (ueberschreibt Auto-Aim solange ausgelenkt), A/RT = Dash, Start = Pause.
 * Spec-konform wird pro Frame gepollt.
 */
const DEADZONE = 0.15;

export class GamepadInput {
  moveX = 0;
  moveZ = 0;
  aimX = 0;
  aimZ = 0;
  aiming = false;
  dashJustPressed = false;
  pauseJustPressed = false;
  /** true, wenn zuletzt ein Gamepad benutzt wurde. */
  active = false;

  private prevDash = false;
  private prevPause = false;

  poll(): void {
    this.moveX = 0;
    this.moveZ = 0;
    this.aimX = 0;
    this.aimZ = 0;
    this.aiming = false;
    this.dashJustPressed = false;
    this.pauseJustPressed = false;

    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    let pad: Gamepad | null = null;
    for (const p of pads) {
      if (p && p.connected) {
        pad = p;
        break;
      }
    }
    if (!pad) {
      this.active = false;
      this.prevDash = false;
      this.prevPause = false;
      return;
    }

    const ax = (i: number): number => {
      const v = pad.axes[i] ?? 0;
      return Math.abs(v) > DEADZONE ? v : 0;
    };

    this.moveX = ax(0);
    this.moveZ = ax(1);
    const rx = ax(2);
    const rz = ax(3);
    if (rx !== 0 || rz !== 0) {
      this.aimX = rx;
      this.aimZ = rz;
      this.aiming = true;
    }

    const dashDown = (pad.buttons[0]?.pressed ?? false) || (pad.buttons[7]?.pressed ?? false);
    const pauseDown = pad.buttons[9]?.pressed ?? false;
    this.dashJustPressed = dashDown && !this.prevDash;
    this.pauseJustPressed = pauseDown && !this.prevPause;
    this.prevDash = dashDown;
    this.prevPause = pauseDown;

    this.active = this.moveX !== 0 || this.moveZ !== 0 || this.aiming || dashDown || pauseDown || this.active;
  }
}
