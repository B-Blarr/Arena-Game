import { PAD_DEADZONE, type RumblePreset } from '../config/input';

const MAX_PADS = 4;

/**
 * Zustand eines Pad-Slots. Buttons als Bitmasken; "Edges" (frisch gedrueckt)
 * werden DOPPELT gefuehrt: Sim-Edges leert der Sim-Step (endStep), UI-Edges
 * leert das Frame-Ende. Grund: Bei Pause/Upgrade steht die Simulation
 * (timeScale 0) und endStep laeuft nicht — die UI braucht trotzdem Flanken.
 */
export interface PadState {
  connected: boolean;
  moveX: number;
  moveZ: number;
  aimX: number;
  aimZ: number;
  /** Aktuell gehaltene Buttons (Bitmaske ueber Button-Index). */
  buttonsDown: number;
  /** Seit dem letzten Sim-Step neu gedrueckt. */
  simEdges: number;
  /** Seit dem letzten Render-Frame neu gedrueckt. */
  uiEdges: number;
}

function makePad(): PadState {
  return { connected: false, moveX: 0, moveZ: 0, aimX: 0, aimZ: 0, buttonsDown: 0, simEdges: 0, uiEdges: 0 };
}

/**
 * Pollt alle Gamepads genau 1x pro Render-Frame (spec-konform) in
 * wiederverwendete Structs. Verbindungs-Erkennung laeuft als Poll-Diff
 * statt ueber gamepadconnected-Events — nur so ist sie mit einem
 * getGamepads-Mock testbar (Gamepad ist nicht konstruierbar).
 */
export class PadRegistry {
  readonly pads: PadState[] = [];
  onConnectionChanged: ((index: number, connected: boolean) => void) | null = null;

  constructor() {
    for (let i = 0; i < MAX_PADS; i++) this.pads.push(makePad());
  }

  /** 1x pro RAF, VOR Sim-Steps und UI-Navigation. */
  pollFrame(): void {
    const raw = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    for (let i = 0; i < MAX_PADS; i++) {
      const state = this.pads[i] as PadState;
      const pad = raw[i];
      const connected = !!pad && pad.connected;

      if (connected !== state.connected) {
        state.connected = connected;
        if (!connected) {
          state.moveX = 0;
          state.moveZ = 0;
          state.aimX = 0;
          state.aimZ = 0;
          state.buttonsDown = 0;
          state.simEdges = 0;
          state.uiEdges = 0;
        }
        this.onConnectionChanged?.(i, connected);
      }
      if (!connected || !pad) continue;

      state.moveX = dz(pad.axes[0] ?? 0);
      state.moveZ = dz(pad.axes[1] ?? 0);
      state.aimX = dz(pad.axes[2] ?? 0);
      state.aimZ = dz(pad.axes[3] ?? 0);

      let down = 0;
      const btns = pad.buttons;
      for (let b = 0; b < btns.length && b < 32; b++) {
        if (btns[b]?.pressed) down |= 1 << b;
      }
      const fresh = down & ~state.buttonsDown;
      state.buttonsDown = down;
      state.simEdges |= fresh;
      state.uiEdges |= fresh;
    }
  }

  isDown(index: number, btn: number): boolean {
    const p = this.pads[index];
    return !!p && (p.buttonsDown & (1 << btn)) !== 0;
  }

  simPressed(index: number, btn: number): boolean {
    const p = this.pads[index];
    return !!p && (p.simEdges & (1 << btn)) !== 0;
  }

  uiPressed(index: number, btn: number): boolean {
    const p = this.pads[index];
    return !!p && (p.uiEdges & (1 << btn)) !== 0;
  }

  clearSimEdges(): void {
    for (const p of this.pads) p.simEdges = 0;
  }

  clearUiEdges(): void {
    for (const p of this.pads) p.uiEdges = 0;
  }

  anyConnected(): boolean {
    for (const p of this.pads) if (p.connected) return true;
    return false;
  }

  /** Index des ersten verbundenen Pads, sonst -1. */
  firstConnected(): number {
    for (let i = 0; i < MAX_PADS; i++) {
      if ((this.pads[i] as PadState).connected) return i;
    }
    return -1;
  }

  /** Rumble auf einem Pad (live-Objekt noetig, daher frisches getGamepads). */
  vibrate(index: number, preset: RumblePreset, intensity: number): void {
    if (index < 0) return;
    const raw = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    const pad = raw[index];
    const actuator = pad?.vibrationActuator;
    if (!actuator || typeof actuator.playEffect !== 'function') return;
    actuator
      .playEffect('dual-rumble', {
        duration: preset.ms,
        strongMagnitude: Math.min(1, preset.strong * intensity),
        weakMagnitude: Math.min(1, preset.weak * intensity),
      })
      .catch(() => {});
  }
}

function dz(v: number): number {
  return Math.abs(v) > PAD_DEADZONE ? v : 0;
}
