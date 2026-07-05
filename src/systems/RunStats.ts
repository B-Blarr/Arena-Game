import { UPGRADES, type UpgradeDef } from '../config/upgrades';
import type { EventBus } from '../core/EventBus';
import type { Player } from '../entities/Player';

/** Ein Eintrag der Build-Anzeige im Game-Over-Screen. */
export interface BuildEntry {
  id: string;
  icon: string;
  rarity: string;
  stacks: number;
}

/**
 * Lauf-Statistik fuer die Game-Over-Zusammenfassung ("Dein Build").
 * Rein event-getrieben — kostet im Frame-Loop nichts und fuegt dem
 * Spiel selbst NULL Komplexitaet hinzu (Kinder koennen sie ignorieren,
 * Optimierer vergleichen DPS und Builds zwischen Laeufen).
 */
export class RunStats {
  damageDealt = 0;
  strongestHit = 0;
  kills = 0;
  maxComboMultiplier = 1;
  /** Upgrade-IDs in Wahl-Reihenfolge (ohne Instant-Karten). */
  private readonly upgradeOrder: string[] = [];
  private readonly unsubs: Array<() => void> = [];

  constructor(events: EventBus) {
    this.unsubs.push(
      events.on('enemyHit', (e) => {
        this.damageDealt += e.damage;
        if (e.damage > this.strongestHit) this.strongestHit = e.damage;
      }),
      events.on('enemyKilled', () => {
        this.kills++;
      }),
      events.on('comboChanged', (e) => {
        if (e.multiplier > this.maxComboMultiplier) this.maxComboMultiplier = e.multiplier;
      }),
      events.on('upgradeChosen', (e) => {
        const def = UPGRADES.find((u) => u.id === e.id);
        if (def && !this.upgradeOrder.includes(e.id)) this.upgradeOrder.push(e.id);
      }),
    );
  }

  reset(): void {
    this.damageDealt = 0;
    this.strongestHit = 0;
    this.kills = 0;
    this.maxComboMultiplier = 1;
    this.upgradeOrder.length = 0;
  }

  /** Schaden pro Sekunde ueber den ganzen Lauf. */
  dps(elapsed: number): number {
    return elapsed > 1 ? Math.round(this.damageDealt / elapsed) : this.damageDealt;
  }

  /** Build in Wahl-Reihenfolge, mit Stack-Zahlen aus dem Spieler. */
  build(player: Player): BuildEntry[] {
    const entries: BuildEntry[] = [];
    for (const id of this.upgradeOrder) {
      const def = UPGRADES.find((u) => u.id === id) as UpgradeDef | undefined;
      if (!def) continue;
      entries.push({ id, icon: def.icon, rarity: def.rarity, stacks: player.stackOf(id) });
    }
    return entries;
  }

  dispose(): void {
    for (const u of this.unsubs) u();
  }
}
