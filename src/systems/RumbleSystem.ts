import { RUMBLE, type RumblePreset } from '../config/input';
import type { EventBus } from '../core/EventBus';
import type { InputManager } from '../input/InputManager';

/**
 * Dezentes Gamepad-Rumble auf zentrale Momente (Treffer, Dash, Boss).
 * Reiner EventBus-Abonnent wie der JuiceDirector; bewusst KEIN Rumble auf
 * enemyKilled/shotFired — das wuerde zum Dauerbrummen.
 */
export class RumbleSystem {
  /** Setting "Vibration". */
  enabled = true;
  /** reduceFx daempft (0.5), sonst 1. */
  intensityMult = 1;

  private readonly unsubs: Array<() => void> = [];

  constructor(
    events: EventBus,
    private readonly input: InputManager,
  ) {
    this.unsubs.push(
      events.on('playerHit', () => this.play(RUMBLE.hit)),
      events.on('playerDashed', () => this.play(RUMBLE.dash)),
      events.on('bossStomp', () => this.play(RUMBLE.bossStomp)),
      events.on('bossDied', () => this.play(RUMBLE.bossDied)),
      events.on('playerDied', () => this.play(RUMBLE.playerDied)),
    );
  }

  private play(preset: RumblePreset): void {
    if (!this.enabled || document.hidden) return;
    this.input.vibrateSlots(preset, this.intensityMult);
  }

  dispose(): void {
    for (const u of this.unsubs) u();
  }
}
