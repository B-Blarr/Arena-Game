import { COOP } from '../config/balance';
import type { World } from '../core/World';
import type { Player } from '../entities/Player';

/**
 * Koop-Wiederbelebung: Steht der Partner nah genug bei einem Spieler am
 * Boden, fuellt sich ein Fortschritts-Ring; ausserhalb verfaellt er nur
 * langsam (verzeihend fuer Kinder). Am Wellenende stehen alle wieder auf.
 * In Solo-Runs ist das System komplett inert (niemand ist je downed).
 */
export class CoopSystem {
  /** Revive-Fortschritt [0..1] je Spieler-Slot (fuer Renderer/HUD). */
  private readonly progress: [number, number] = [0, 0];

  constructor(private readonly world: World) {}

  reset(): void {
    this.progress[0] = 0;
    this.progress[1] = 0;
  }

  update(dt: number): void {
    const players = this.world.players;
    if (players.length < 2) return;

    for (let i = 0; i < players.length; i++) {
      const p = players[i] as Player;
      if (!p.downed) {
        this.progress[i as 0 | 1] = 0;
        continue;
      }
      // Partner in der Revive-Zone?
      const partner = players[1 - i] as Player;
      let near = false;
      if (partner.targetable) {
        const d = Math.hypot(partner.x - p.x, partner.z - p.z);
        near = d <= COOP.revive.radius;
      }
      let prog = this.progress[i as 0 | 1];
      if (near) {
        prog += dt / COOP.revive.holdTime;
      } else {
        prog -= (dt * COOP.revive.decayMult) / COOP.revive.holdTime;
      }
      prog = Math.min(1, Math.max(0, prog));
      this.progress[i as 0 | 1] = prog;
      if (prog >= 1) {
        this.progress[i as 0 | 1] = 0;
        p.revive(COOP.revive.hpFrac, COOP.revive.iFrames);
      }
    }
  }

  /** Wellenende: niemand sitzt die Upgrade-Phase am Boden ab.
   *  byPartner=false — kein "Gerettet!"-Banner, kein Retter-Sticker. */
  reviveAll(): void {
    for (let i = 0; i < this.world.players.length; i++) {
      const p = this.world.players[i] as Player;
      if (p.downed) p.revive(COOP.revive.hpFrac, COOP.revive.iFrames, false);
      this.progress[i as 0 | 1] = 0;
    }
  }

  progressOf(index: number): number {
    return this.progress[index as 0 | 1] ?? 0;
  }
}
