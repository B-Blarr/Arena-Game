import { Plane, Raycaster, Vector2, Vector3, type PerspectiveCamera } from 'three';
import { Keyboard } from './Keyboard';
import { Mouse } from './Mouse';
import { GamepadInput } from './GamepadInput';

export interface InputState {
  /** Normalisiert — Diagonale ist nicht schneller. */
  moveX: number;
  moveZ: number;
  dashJustPressed: boolean;
  pauseJustPressed: boolean;
  /** Manuelle Ziel-Richtung (Maus/rechter Stick), Einheitsvektor. */
  aimDirX: number;
  aimDirZ: number;
  hasManualAim: boolean;
}

// Wiederverwendete Temporaries — keine Allokationen im Hot Path
const groundPlane = new Plane(new Vector3(0, 1, 0), 0);
const raycaster = new Raycaster();
const ndc = new Vector2();
const hit = new Vector3();

/**
 * Aggregiert Keyboard/Maus/Gamepad zu einem normalisierten Snapshot
 * pro Sim-Step. Letzte aktive Quelle gewinnt (kein Modus-Umschalter).
 */
export class InputManager {
  readonly keyboard = new Keyboard();
  readonly mouse = new Mouse();
  readonly gamepad = new GamepadInput();

  readonly state: InputState = {
    moveX: 0,
    moveZ: 0,
    dashJustPressed: false,
    pauseJustPressed: false,
    aimDirX: 0,
    aimDirZ: 1,
    hasManualAim: false,
  };

  /**
   * Einen Input-Snapshot erzeugen. playerX/Z fuer die Maus-Zielrichtung,
   * Kamera fuer den Plane-Raycast (mathematisch, kein Mesh-Raycast).
   */
  sample(camera: PerspectiveCamera, playerX: number, playerZ: number): InputState {
    this.gamepad.poll();
    const s = this.state;
    const kb = this.keyboard;

    // WASD und Pfeiltasten gleichzeitig
    let mx = 0;
    let mz = 0;
    if (kb.isDown('KeyA') || kb.isDown('ArrowLeft')) mx -= 1;
    if (kb.isDown('KeyD') || kb.isDown('ArrowRight')) mx += 1;
    if (kb.isDown('KeyW') || kb.isDown('ArrowUp')) mz -= 1;
    if (kb.isDown('KeyS') || kb.isDown('ArrowDown')) mz += 1;

    if (mx === 0 && mz === 0) {
      mx = this.gamepad.moveX;
      mz = this.gamepad.moveZ;
    }
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    s.moveX = mx;
    s.moveZ = mz;

    s.dashJustPressed = kb.wasJustPressed('Space') || this.gamepad.dashJustPressed;
    s.pauseJustPressed =
      kb.wasJustPressed('KeyP') || kb.wasJustPressed('Escape') || this.gamepad.pauseJustPressed;

    // Manuelles Zielen: rechter Stick hat Vorrang, sonst Maus
    s.hasManualAim = false;
    if (this.gamepad.aiming) {
      const alen = Math.hypot(this.gamepad.aimX, this.gamepad.aimZ);
      if (alen > 0) {
        s.aimDirX = this.gamepad.aimX / alen;
        s.aimDirZ = this.gamepad.aimZ / alen;
        s.hasManualAim = true;
      }
    } else if (this.mouse.hasMoved) {
      ndc.set(this.mouse.ndcX, this.mouse.ndcY);
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(groundPlane, hit)) {
        const dx = hit.x - playerX;
        const dz = hit.z - playerZ;
        const dlen = Math.hypot(dx, dz);
        if (dlen > 0.001) {
          s.aimDirX = dx / dlen;
          s.aimDirZ = dz / dlen;
          s.hasManualAim = true;
        }
      }
    }

    return s;
  }

  /** Nach jedem Sim-Step: Edge-Trigger-Puffer leeren. */
  endStep(): void {
    this.keyboard.clearFrame();
  }

  dispose(): void {
    this.keyboard.dispose();
    this.mouse.dispose();
  }
}
