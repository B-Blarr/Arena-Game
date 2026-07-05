import { ARENA_RADIUS, SURPRISE, isBossWave } from '../config/balance';
import type { EventBus } from '../core/EventBus';
import type { World } from '../core/World';
import type { PickupSystem } from './PickupSystem';

/**
 * Zufalls-Ueberraschungen im Lauf: Goldene Welle + Versorgungskapsel.
 *
 * DETERMINISMUS-KERNREGEL: rollForWave() zieht bei JEDEM Nicht-Boss-
 * Wellenstart exakt 5 Werte aus rngEvents (Golden, Kapsel, Zeit, Winkel,
 * Radius) — auch wenn nichts triggert. Fester Verbrauch pro Welle =
 * spielerunabhaengig, Daily Seeds bleiben stabil. Boss-Wellen: 0 Zuege.
 */
export class SurpriseDirector {
  private capsulePending = false;
  private capsuleTimer = 0;
  private capsuleX = 0;
  private capsuleZ = 0;
  private telegraphSent = false;

  constructor(
    private readonly world: World,
    private readonly events: EventBus,
    private readonly pickups: PickupSystem,
  ) {}

  reset(): void {
    this.capsulePending = false;
    this.capsuleTimer = 0;
    this.telegraphSent = false;
    this.world.goldenWave = false;
  }

  /** VOR waves.startWave(w) aufrufen — Spawns/Scaling sehen das Golden-Flag. */
  rollForWave(w: number): void {
    const world = this.world;
    world.goldenWave = false;
    this.capsulePending = false;
    this.telegraphSent = false;
    if (isBossWave(w)) return; // Boss-Wellen: keine Zuege (dokumentierte Regel)

    const rng = world.rngEvents;
    // Immer ALLE 5 Zuege verbrauchen — erst danach entscheiden
    const goldenRoll = rng.next();
    const capsuleRoll = rng.next();
    const dropTime = rng.range(SURPRISE.capsule.dropTimeMin, SURPRISE.capsule.dropTimeMax);
    const angle = rng.range(0, Math.PI * 2);
    const radius = rng.range(SURPRISE.capsule.minRadius, ARENA_RADIUS - SURPRISE.capsule.edgeMargin);

    if (w >= SURPRISE.goldenMinWave && goldenRoll < SURPRISE.goldenChance) {
      world.goldenWave = true;
      this.events.emit('goldenWave', { wave: w });
    }

    const isEasy = world.difficulty === 'easy';
    const minWave = isEasy ? SURPRISE.capsule.minWaveEasy : SURPRISE.capsule.minWave;
    if (w >= minWave && capsuleRoll < SURPRISE.capsule.chance[world.difficulty]) {
      this.capsulePending = true;
      this.capsuleTimer = dropTime;
      this.capsuleX = Math.cos(angle) * radius;
      this.capsuleZ = Math.sin(angle) * radius;
    }
  }

  update(dt: number): void {
    if (!this.capsulePending) return;
    this.capsuleTimer -= dt;

    // Vorwarnung: goldener Ring + Banner, kurz bevor sie landet
    if (!this.telegraphSent && this.capsuleTimer <= SURPRISE.capsule.telegraphTime) {
      this.telegraphSent = true;
      this.events.emit('capsuleIncoming', { x: this.capsuleX, z: this.capsuleZ });
    }

    if (this.capsuleTimer <= 0) {
      this.capsulePending = false;
      this.pickups.spawnCapsule(this.capsuleX, this.capsuleZ);
      this.events.emit('capsuleLanded', { x: this.capsuleX, z: this.capsuleZ });
    }
  }
}
