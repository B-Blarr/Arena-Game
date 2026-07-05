import {
  FALLBACK_UPGRADES,
  RARITY_WEIGHTS,
  UPGRADES,
  UPGRADE_VALUES as UV,
  type UpgradeDef,
} from '../config/upgrades';
import type { EventBus } from '../core/EventBus';
import type { World } from '../core/World';
import type { Rng } from '../core/Rng';
import type { ScoreSystem } from './ScoreSystem';

/**
 * Zieht nach jeder Welle 3 verschiedene Upgrades (gewichtet nach Seltenheit,
 * ohne Zuruecklegen), 1 Gratis-Reroll. Ist der Pool ausgeschoepft, fuellen
 * Fallback-Karten auf — die Auswahl ist NIE leer.
 */
export class UpgradeSystem {
  currentOffers: UpgradeDef[] = [];
  rerollUsed = false;

  constructor(
    private readonly world: World,
    private readonly events: EventBus,
    private readonly score: ScoreSystem,
  ) {}

  reset(): void {
    this.currentOffers = [];
    this.rerollUsed = false;
  }

  /** Nach Boss-Wellen: Slot 1 garantiert Rare oder Epic. */
  rollOffers(guaranteeRare: boolean): UpgradeDef[] {
    this.rerollUsed = false;
    this.currentOffers = this.draw(guaranteeRare);
    return this.currentOffers;
  }

  reroll(guaranteeRare: boolean): UpgradeDef[] | null {
    if (this.rerollUsed) return null;
    this.rerollUsed = true;
    this.currentOffers = this.draw(guaranteeRare);
    return this.currentOffers;
  }

  private draw(guaranteeRare: boolean): UpgradeDef[] {
    const rng = this.world.rngUpgrades;
    const player = this.world.player;
    const pool = UPGRADES.filter((u) => player.stackOf(u.id) < u.maxStacks);
    const picks: UpgradeDef[] = [];

    if (guaranteeRare) {
      const rarePool = pool.filter((u) => u.rarity !== 'common');
      if (rarePool.length > 0) {
        const pick = this.weightedPick(rarePool, rng);
        picks.push(pick);
        pool.splice(pool.indexOf(pick), 1);
      }
    }

    while (picks.length < 3 && pool.length > 0) {
      const pick = this.weightedPick(pool, rng);
      picks.push(pick);
      pool.splice(pool.indexOf(pick), 1);
    }

    // Pool erschoepft -> Fallback-Karten (nie leere Auswahl)
    let fallbackIdx = rng.int(FALLBACK_UPGRADES.length);
    while (picks.length < 3) {
      const fb = FALLBACK_UPGRADES[fallbackIdx % FALLBACK_UPGRADES.length] as UpgradeDef;
      if (!picks.includes(fb)) picks.push(fb);
      fallbackIdx++;
    }
    return picks;
  }

  private weightedPick(pool: UpgradeDef[], rng: Rng): UpgradeDef {
    let totalWeight = 0;
    for (const u of pool) totalWeight += RARITY_WEIGHTS[u.rarity];
    let roll = rng.next() * totalWeight;
    for (const u of pool) {
      roll -= RARITY_WEIGHTS[u.rarity];
      if (roll <= 0) return u;
    }
    return pool[pool.length - 1] as UpgradeDef;
  }

  apply(def: UpgradeDef): void {
    const world = this.world;
    if (def.instant) {
      switch (def.id) {
        case 'corePack':
          world.runCores += UV.corePackAmount;
          this.events.emit('coresChanged', { runCores: world.runCores });
          break;
        case 'repair':
          world.player.heal(Math.round(world.player.stats.maxHp * UV.repairFrac));
          break;
        case 'scoreBoost':
          this.score.addRaw(UV.scoreBoostPerWave * world.wave);
          break;
      }
    } else {
      world.player.addStack(def.id);
    }
    this.events.emit('upgradeChosen', { id: def.id });
  }

  /** Dauer-Bonus "Kopfstart": Lauf beginnt mit 1 zufaelligen Common-Upgrade. */
  applyHeadstart(): UpgradeDef | null {
    const commons = UPGRADES.filter((u) => u.rarity === 'common');
    if (commons.length === 0) return null;
    const pick = commons[this.world.rngUpgrades.int(commons.length)] as UpgradeDef;
    this.world.player.addStack(pick.id);
    return pick;
  }
}
