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
      // Persoenliche Momente ruetteln nur den eigenen Pad, Boss-Events alle
      events.on('playerHit', (e) => this.play(RUMBLE.hit, e.playerIndex)),
      events.on('playerDashed', (e) => this.play(RUMBLE.dash, e.playerIndex)),
      events.on('abilityUsed', (e) => this.play(RUMBLE.ability, e.playerIndex)),
      events.on('playerDowned', (e) => this.play(RUMBLE.playerDied, e.playerIndex)),
      events.on('bossStomp', () => this.play(RUMBLE.bossStomp)),
      events.on('bossDied', () => this.play(RUMBLE.bossDied)),
      events.on('playerDied', () => this.play(RUMBLE.playerDied)),
    );
  }

  private play(preset: RumblePreset, slot = -1): void {
    if (!this.enabled || document.hidden) return;
    this.input.vibrateSlots(preset, this.intensityMult, slot);
  }

  dispose(): void {
    for (const u of this.unsubs) u();
  }
}
