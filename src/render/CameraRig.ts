import { PerspectiveCamera, Vector3 } from 'three';
import { clamp, damp } from '../utils/math';

const BASE_FOV = 55;
const DASH_FOV_KICK = 7;
const OFFSET = new Vector3(0, 24, 14);
const LOOKAHEAD_DIST = 2.5;
const MAX_SHAKE_OFFSET = 0.35;
const MAX_SHAKE_ROLL = (1.5 * Math.PI) / 180;
const TRAUMA_DECAY = 1.6;
/** Trauma-Zuwachs pro 100 ms gedeckelt — verhindert Dauervibration. */
const TRAUMA_GAIN_PER_WINDOW = 0.5;

const lookTarget = new Vector3();

/**
 * Kamera leicht schraeg von oben/hinten, weiches Follow mit Lookahead
 * (friert beim Stillstand ein statt zurueckzugleiten), Trauma-basiertes
 * Screenshake (Staerke = trauma²) und FOV-Kick beim Dash.
 * Laeuft komplett auf Echtzeit (rawDt) — bleibt auch im Hitstop weich.
 */
export class CameraRig {
  readonly camera: PerspectiveCamera;

  /** Globaler Effekt-Daempfer ("Effekte reduzieren"). */
  fxIntensity = 1;

  private trauma = 0;
  private traumaWindow = 0;
  private traumaGainInWindow = 0;
  private followX = 0;
  private followZ = 0;
  private lookaheadX = 0;
  private lookaheadZ = 0;
  private fovKick = 0;
  private noiseT = 0;

  constructor() {
    this.camera = new PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.1, 300);
    this.camera.position.copy(OFFSET);
    this.camera.lookAt(0, 0, 0);
  }

  addTrauma(amount: number): void {
    // Zuwachs-Cap pro 100-ms-Fenster
    const allowed = Math.max(0, TRAUMA_GAIN_PER_WINDOW - this.traumaGainInWindow);
    const add = Math.min(amount * this.fxIntensity, allowed);
    this.traumaGainInWindow += add;
    this.trauma = clamp(this.trauma + add, 0, 1);
  }

  dashKick(): void {
    this.fovKick = 1;
  }

  snapTo(x: number, z: number): void {
    this.followX = x;
    this.followZ = z;
    this.lookaheadX = 0;
    this.lookaheadZ = 0;
  }

  update(rawDt: number, targetX: number, targetZ: number, velX: number, velZ: number): void {
    // Lookahead in Bewegungsrichtung, selbst geglaettet — aber NUR waehrend
    // der Bewegung. Beim Stillstand friert er ein: das Zurueckgleiten zur
    // Mitte bei ansonsten stehendem Bild wirkte wie stoerendes Nachjustieren.
    const speed = Math.hypot(velX, velZ);
    if (speed > 0.1) {
      this.lookaheadX = damp(this.lookaheadX, (velX / speed) * LOOKAHEAD_DIST, 3, rawDt);
      this.lookaheadZ = damp(this.lookaheadZ, (velZ / speed) * LOOKAHEAD_DIST, 3, rawDt);
    }

    this.followX = damp(this.followX, targetX + this.lookaheadX, 8, rawDt);
    this.followZ = damp(this.followZ, targetZ + this.lookaheadZ, 8, rawDt);

    // Trauma-Decay + Fenster-Reset
    this.trauma = Math.max(0, this.trauma - TRAUMA_DECAY * rawDt);
    this.traumaWindow += rawDt;
    if (this.traumaWindow >= 0.1) {
      this.traumaWindow = 0;
      this.traumaGainInWindow = 0;
    }

    // Shake: 3 unabhaengige Pseudo-Noise-Kanaele (~22 Hz, layered sines)
    this.noiseT += rawDt * 22;
    const shake = this.trauma * this.trauma;
    const nX = Math.sin(this.noiseT * 1.13) * 0.6 + Math.sin(this.noiseT * 2.71 + 1.7) * 0.4;
    const nY = Math.sin(this.noiseT * 0.97 + 4.2) * 0.6 + Math.sin(this.noiseT * 2.31 + 0.4) * 0.4;
    const nRoll = Math.sin(this.noiseT * 1.31 + 2.5) * 0.6 + Math.sin(this.noiseT * 3.11 + 5.1) * 0.4;

    // FOV-Kick beim Dash: schnell rein, weich raus
    this.fovKick = Math.max(0, this.fovKick - rawDt / 0.25);
    const kick = this.fovKick * this.fovKick;
    const fov = BASE_FOV + DASH_FOV_KICK * kick;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    this.camera.position.set(
      this.followX + OFFSET.x + nX * shake * MAX_SHAKE_OFFSET,
      OFFSET.y + nY * shake * MAX_SHAKE_OFFSET,
      this.followZ + OFFSET.z,
    );
    lookTarget.set(this.followX, 0, this.followZ);
    this.camera.lookAt(lookTarget);
    this.camera.rotation.z += nRoll * shake * MAX_SHAKE_ROLL;
  }

  reset(): void {
    this.trauma = 0;
    this.fovKick = 0;
  }
}
