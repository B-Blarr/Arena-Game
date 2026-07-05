import { Plane, Raycaster, Vector2, Vector3, type PerspectiveCamera } from 'three';
import { KEYS, PAD_BTN } from '../config/input';
import type { EventBus } from '../core/EventBus';
import { Keyboard } from './Keyboard';
import { Mouse } from './Mouse';
import { PadRegistry } from './PadRegistry';

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

/**
 * Eine Eingabe-Quelle fuer einen Spieler-Slot. 'arrows' hat keine
 * Ziel-Hardware — fuer diesen Spieler muss Auto-Aim greifen.
 */
export type InputSource = 'wasd+mouse' | 'arrows' | `pad:${number}`;

// Wiederverwendete Temporaries — keine Allokationen im Hot Path
const groundPlane = new Plane(new Vector3(0, 1, 0), 0);
const raycaster = new Raycaster();
const ndc = new Vector2();
const hit = new Vector3();

function makeState(): InputState {
  return {
    moveX: 0,
    moveZ: 0,
    dashJustPressed: false,
    pauseJustPressed: false,
    aimDirX: 0,
    aimDirZ: 1,
    hasManualAim: false,
  };
}

/**
 * Aggregiert Keyboard/Maus/Gamepads zu normalisierten Snapshots pro
 * Sim-Step — einen je Spieler-Slot. Solo (Standard): Slot 0 mischt alle
 * Quellen wie gehabt (WASD+Pfeile+Maus+erster Pad, letzte aktive gewinnt).
 * Koop: pro Slot ausschliesslich die zugewiesene Quelle.
 */
export class InputManager {
  readonly keyboard = new Keyboard();
  readonly mouse = new Mouse();
  readonly pads = new PadRegistry();

  private readonly states: [InputState, InputState] = [makeState(), makeState()];
  private readonly sources: [InputSource | null, InputSource | null] = [null, null];
  // Gecachte Slot-Aufloesung — sample() fasst keine Strings an
  private readonly slotPad: [number, number] = [-1, -1];
  private readonly slotKeys: ['wasd' | 'arrows' | 'none', 'wasd' | 'arrows' | 'none'] = ['none', 'none'];
  private readonly slotMouse: [boolean, boolean] = [false, false];
  private coop = false;
  /** Solo: automatisch zugewiesener Pad (erster verbundener, sticky). */
  private soloPadIndex = -1;

  constructor(private readonly events: EventBus) {
    this.pads.onConnectionChanged = (index, connected) => {
      if (connected) {
        if (this.soloPadIndex === -1) this.soloPadIndex = index;
        this.events.emit('padConnected', { index });
      } else {
        const slot = this.coop
          ? (this.slotPad[0] === index ? 0 : this.slotPad[1] === index ? 1 : -1)
          : (this.soloPadIndex === index ? 0 : -1);
        if (this.soloPadIndex === index) this.soloPadIndex = this.pads.firstConnected();
        this.events.emit('padDisconnected', { index, slot });
      }
    };
  }

  // ------------------------------------------------ Modus & Zuweisung

  /** Zurueck in den Solo-Mischbetrieb (Standard). */
  setSolo(): void {
    this.coop = false;
    this.sources[0] = null;
    this.sources[1] = null;
    this.recache();
  }

  /** Weist einem Slot eine exklusive Quelle zu und aktiviert den Koop-Modus. */
  assignSlot(slot: 0 | 1, source: InputSource): void {
    this.coop = true;
    const other = slot === 0 ? 1 : 0;
    if (this.sources[other] === source) this.sources[other] = null;
    this.sources[slot] = source;
    this.recache();
  }

  clearSlot(slot: 0 | 1): void {
    this.sources[slot] = null;
    this.recache();
  }

  sourceOfSlot(slot: 0 | 1): InputSource | null {
    return this.coop ? this.sources[slot] : slot === 0 ? 'wasd+mouse' : null;
  }

  /** Pad-Index eines Slots (-1 = Tastatur/keiner). */
  padIndexOfSlot(slot: 0 | 1): number {
    if (!this.coop) return slot === 0 ? this.soloPadIndex : -1;
    return this.slotPad[slot];
  }

  private recache(): void {
    for (let i = 0; i < 2; i++) {
      const src = this.sources[i];
      this.slotPad[i as 0 | 1] = src?.startsWith('pad:') ? Number(src.slice(4)) : -1;
      this.slotKeys[i as 0 | 1] = src === 'wasd+mouse' ? 'wasd' : src === 'arrows' ? 'arrows' : 'none';
      this.slotMouse[i as 0 | 1] = src === 'wasd+mouse';
    }
  }

  // ------------------------------------------------ Frame-Hooks

  /** 1x pro Render-Frame, VOR Sim-Steps und UI-Navigation. */
  pollPads(): void {
    this.pads.pollFrame();
  }

  /** Nach jedem Sim-Step: Edge-Trigger-Puffer der Simulation leeren. */
  endStep(): void {
    this.keyboard.clearFrame();
    this.pads.clearSimEdges();
  }

  /** Am Frame-Ende (nach UI-Navigation): UI-Flanken leeren. */
  endFrame(): void {
    this.pads.clearUiEdges();
  }

  /**
   * Alle fluechtigen Eingaben verwerfen (Keyboard-Zustand + beide
   * Pad-Edge-Puffer). Pflicht bei Kontextwechseln (Run-Start, Resume,
   * Upgrade-Ende) — sonst feuert ein Menue-Klick den ersten Dash.
   */
  resetTransient(): void {
    this.keyboard.reset();
    this.pads.clearSimEdges();
    this.pads.clearUiEdges();
  }

  // ------------------------------------------------ Abfragen (UI-Phase)

  anyPadConnected(): boolean {
    return this.pads.anyConnected();
  }

  /** Start-Flanke (UI-Puffer) eines relevanten Pads — Pause-Toggle. */
  uiStartPressed(): boolean {
    if (!this.coop) {
      return this.soloPadIndex >= 0 && this.pads.uiPressed(this.soloPadIndex, PAD_BTN.start);
    }
    for (let i = 0; i < 2; i++) {
      const pad = this.slotPad[i as 0 | 1];
      if (pad >= 0 && this.pads.uiPressed(pad, PAD_BTN.start)) return true;
    }
    return false;
  }

  /**
   * Koop-Setup: hat eine noch NICHT zugewiesene Pad-Quelle ihre
   * Dash-Taste gedrueckt? (Tastatur-Haelften meldet der Setup-Screen
   * selbst ueber keydown — Keyboard-Edges sind an Sim-Steps gebunden.)
   */
  consumeJoinPress(): InputSource | null {
    for (let i = 0; i < this.pads.pads.length; i++) {
      const p = this.pads.pads[i];
      if (!p?.connected) continue;
      if (this.slotPad[0] === i || this.slotPad[1] === i) continue;
      if (this.pads.uiPressed(i, PAD_BTN.a) || this.pads.uiPressed(i, PAD_BTN.rt)) {
        return `pad:${i}`;
      }
    }
    return null;
  }

  /** Rumble auf die Pads der Slots (slot -1 = alle zugewiesenen). */
  vibrateSlots(preset: { ms: number; strong: number; weak: number }, intensity: number, slot = -1): void {
    if (!this.coop) {
      if (slot <= 0) this.pads.vibrate(this.soloPadIndex, preset, intensity);
      return;
    }
    for (let i = 0; i < 2; i++) {
      if (slot >= 0 && slot !== i) continue;
      this.pads.vibrate(this.slotPad[i as 0 | 1], preset, intensity);
    }
  }

  // ------------------------------------------------ Sampling (Sim-Phase)

  /**
   * Einen Input-Snapshot fuer einen Spieler-Slot erzeugen. playerX/Z fuer
   * die Maus-Zielrichtung, Kamera fuer den Plane-Raycast. Gibt pro Slot
   * dasselbe wiederverwendete Objekt zurueck.
   */
  sample(slot: 0 | 1, camera: PerspectiveCamera, playerX: number, playerZ: number): InputState {
    const s = this.states[slot];
    s.moveX = 0;
    s.moveZ = 0;
    s.dashJustPressed = false;
    s.pauseJustPressed = false;
    s.hasManualAim = false;

    if (!this.coop) {
      if (slot === 0) this.sampleSoloMixed(s, camera, playerX, playerZ);
      return s;
    }

    const kb = this.keyboard;
    const keys = this.slotKeys[slot];
    const pad = this.slotPad[slot];

    let mx = 0;
    let mz = 0;
    if (keys !== 'none') {
      const map = KEYS[keys];
      if (kb.isDown(map.left)) mx -= 1;
      if (kb.isDown(map.right)) mx += 1;
      if (kb.isDown(map.up)) mz -= 1;
      if (kb.isDown(map.down)) mz += 1;
      for (const code of map.dash) {
        if (kb.wasJustPressed(code)) s.dashJustPressed = true;
      }
    }
    if (pad >= 0) {
      const p = this.pads.pads[pad];
      if (p?.connected) {
        if (mx === 0 && mz === 0) {
          mx = p.moveX;
          mz = p.moveZ;
        }
        if (this.pads.simPressed(pad, PAD_BTN.a) || this.pads.simPressed(pad, PAD_BTN.rt)) {
          s.dashJustPressed = true;
        }
        if (this.pads.simPressed(pad, PAD_BTN.start)) s.pauseJustPressed = true;
        this.applyStickAim(s, p.aimX, p.aimZ);
      }
    }
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    s.moveX = mx;
    s.moveZ = mz;

    for (const code of KEYS.pause) {
      if (kb.wasJustPressed(code)) s.pauseJustPressed = true;
    }
    if (!s.hasManualAim && this.slotMouse[slot]) {
      this.applyMouseAim(s, camera, playerX, playerZ);
    }
    return s;
  }

  /** Heutiges Solo-Verhalten: alle Quellen gemischt, letzte aktive gewinnt. */
  private sampleSoloMixed(s: InputState, camera: PerspectiveCamera, playerX: number, playerZ: number): void {
    const kb = this.keyboard;
    // WASD und Pfeiltasten gleichzeitig
    let mx = 0;
    let mz = 0;
    if (kb.isDown('KeyA') || kb.isDown('ArrowLeft')) mx -= 1;
    if (kb.isDown('KeyD') || kb.isDown('ArrowRight')) mx += 1;
    if (kb.isDown('KeyW') || kb.isDown('ArrowUp')) mz -= 1;
    if (kb.isDown('KeyS') || kb.isDown('ArrowDown')) mz += 1;

    const pad = this.soloPadIndex >= 0 ? this.pads.pads[this.soloPadIndex] : undefined;
    if (mx === 0 && mz === 0 && pad?.connected) {
      mx = pad.moveX;
      mz = pad.moveZ;
    }
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    s.moveX = mx;
    s.moveZ = mz;

    s.dashJustPressed = kb.wasJustPressed('Space');
    for (const code of KEYS.pause) {
      if (kb.wasJustPressed(code)) s.pauseJustPressed = true;
    }
    if (this.soloPadIndex >= 0 && pad?.connected) {
      if (this.pads.simPressed(this.soloPadIndex, PAD_BTN.a) || this.pads.simPressed(this.soloPadIndex, PAD_BTN.rt)) {
        s.dashJustPressed = true;
      }
      if (this.pads.simPressed(this.soloPadIndex, PAD_BTN.start)) s.pauseJustPressed = true;
      this.applyStickAim(s, pad.aimX, pad.aimZ);
    }
    if (!s.hasManualAim) this.applyMouseAim(s, camera, playerX, playerZ);
  }

  private applyStickAim(s: InputState, aimX: number, aimZ: number): void {
    if (aimX === 0 && aimZ === 0) return;
    const alen = Math.hypot(aimX, aimZ);
    s.aimDirX = aimX / alen;
    s.aimDirZ = aimZ / alen;
    s.hasManualAim = true;
  }

  private applyMouseAim(s: InputState, camera: PerspectiveCamera, playerX: number, playerZ: number): void {
    if (!this.mouse.hasMoved) return;
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

  dispose(): void {
    this.keyboard.dispose();
    this.mouse.dispose();
    this.pads.onConnectionChanged = null;
  }
}
