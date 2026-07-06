import {
  FALLBACK_UPGRADES,
  LEGENDARY,
  RARITY_WEIGHTS,
  UPGRADES,
  UPGRADE_VALUES as UV,
  type UpgradeDef,
} from '../config/upgrades';
import type { EventBus } from '../core/EventBus';
import type { World } from '../core/World';
import type { Player } from '../entities/Player';
import type { Rng } from '../core/Rng';
import type { ScoreSystem } from './ScoreSystem';

/**
 * Zieht nach jeder Welle 3 verschiedene Upgrades (gewichtet nach Seltenheit,
 * ohne Zuruecklegen), 1 Gratis-Reroll. Ist der Pool ausgeschoepft, fuellen
 * Fallback-Karten auf — die Auswahl ist NIE leer.
 *
 * Koop: jeder Spieler zieht aus SEINEM Stream (P1 rngUpgrades wie Solo,
 * P2 rngUpgradesP2) mit eigenem Pity — P2s Ziehungen koennen den
 * Solo-Daily-Stream nicht verschieben.
 *
 * Legendaer: Basisgewicht mit unsichtbarem Pity (+1 pro Angebot ohne
 * Fund, Reset beim ANZEIGEN). Deterministisch, weil der Pity nur von den
 * bisherigen Ziehungen des jeweiligen Streams abhaengt.
 */
export class UpgradeSystem {
  currentOffers: UpgradeDef[] = [];
  rerollUsed = false;
  /** DEV-Testhilfe: erzwingt Legendaer im naechsten Angebot. */
  debugForceLegendary = false;
  private readonly legendaryPity: [number, number] = [0, 0];
  /** Fuer weightOf waehrend eines draw()-Laufs. */
  private drawingFor: 0 | 1 = 0;

  constructor(
    private readonly world: World,
    private readonly events: EventBus,
    private readonly score: ScoreSystem,
  ) {}

  reset(): void {
    this.currentOffers = [];
    this.rerollUsed = false;
    this.legendaryPity[0] = 0;
    this.legendaryPity[1] = 0;
  }

  /** Nach Boss-Wellen: Slot 1 garantiert Rare oder besser. */
  rollOffers(guaranteeRare: boolean, playerIdx: 0 | 1 = 0): UpgradeDef[] {
    this.rerollUsed = false;
    this.currentOffers = this.draw(guaranteeRare, playerIdx);
    return this.currentOffers;
  }

  reroll(guaranteeRare: boolean, playerIdx: 0 | 1 = 0): UpgradeDef[] | null {
    if (this.rerollUsed) return null;
    this.rerollUsed = true;
    this.currentOffers = this.draw(guaranteeRare, playerIdx);
    return this.currentOffers;
  }

  private draw(guaranteeRare: boolean, playerIdx: 0 | 1): UpgradeDef[] {
    this.drawingFor = playerIdx;
    const rng = playerIdx === 0 ? this.world.rngUpgrades : this.world.rngUpgradesP2;
    const player = (this.world.players[playerIdx] ?? this.world.players[0]) as Player;
    const pool = UPGRADES.filter((u) => {
      if (player.stackOf(u.id) >= u.maxStacks) return false;
      // Legendaere erst ab der Wahl nach Welle 2 (erste Wahl bleibt simpel)
      if (u.rarity === 'legendary' && this.world.wave < LEGENDARY.minWave) return false;
      // Kettenreaktion aktiv -> Nova-Karten waeren wirkungslos
      if (u.id === 'nova' && player.stats.novaChance >= 1) return false;
      return true;
    });
    const picks: UpgradeDef[] = [];

    // Nach einem legendaeren Pick: restliche Legendaere raus
    // (max. 1 pro Angebot — niemand soll eine Einmal-Karte wegwerfen muessen)
    const dropLegendaries = (): void => {
      for (let i = pool.length - 1; i >= 0; i--) {
        if ((pool[i] as UpgradeDef).rarity === 'legendary') pool.splice(i, 1);
      }
    };

    if (guaranteeRare) {
      const rarePool = pool.filter((u) => u.rarity !== 'common');
      if (rarePool.length > 0) {
        const pick = this.weightedPick(rarePool, rng);
        picks.push(pick);
        pool.splice(pool.indexOf(pick), 1);
        if (pick.rarity === 'legendary') dropLegendaries();
      }
    }

    while (picks.length < 3 && pool.length > 0) {
      const pick = this.weightedPick(pool, rng);
      picks.push(pick);
      pool.splice(pool.indexOf(pick), 1);
      if (pick.rarity === 'legendary') dropLegendaries();
    }

    // Pool erschoepft -> Fallback-Karten (nie leere Auswahl)
    let fallbackIdx = rng.int(FALLBACK_UPGRADES.length);
    while (picks.length < 3) {
      const fb = FALLBACK_UPGRADES[fallbackIdx % FALLBACK_UPGRADES.length] as UpgradeDef;
      if (!picks.includes(fb)) picks.push(fb);
      fallbackIdx++;
    }

    // Pity: steigt pro Angebot ohne Legendaer, Reset beim ANZEIGEN
    // (nicht erst bei der Wahl — sonst waere er durch Ignorieren farmbar)
    const legendary = picks.find((u) => u.rarity === 'legendary');
    if (legendary) {
      this.legendaryPity[playerIdx] = 0;
      this.events.emit('legendaryRevealed', { id: legendary.id });
    } else {
      this.legendaryPity[playerIdx] += LEGENDARY.pityPerOffer;
    }
    return picks;
  }

  private weightOf(u: UpgradeDef): number {
    if (u.rarity !== 'legendary') return RARITY_WEIGHTS[u.rarity];
    if (this.debugForceLegendary) return 100000;
    return Math.min(RARITY_WEIGHTS.legendary + this.legendaryPity[this.drawingFor], LEGENDARY.weightCap);
  }

  private weightedPick(pool: UpgradeDef[], rng: Rng): UpgradeDef {
    let totalWeight = 0;
    for (const u of pool) totalWeight += this.weightOf(u);
    let roll = rng.next() * totalWeight;
    for (const u of pool) {
      roll -= this.weightOf(u);
      if (roll <= 0) return u;
    }
    return pool[pool.length - 1] as UpgradeDef;
  }

  apply(def: UpgradeDef, playerIdx: 0 | 1 = 0): void {
    const world = this.world;
    const player = (world.players[playerIdx] ?? world.players[0]) as Player;
    if (def.instant) {
      switch (def.id) {
        case 'corePack':
          world.runCores += UV.corePackAmount;
          this.events.emit('coresChanged', { runCores: world.runCores });
          break;
        case 'repair':
          // Instant-Heilung gehoert dem Waehler
          player.heal(Math.round(player.stats.maxHp * UV.repairFrac));
          break;
        case 'scoreBoost':
          this.score.addRaw(UV.scoreBoostPerWave * world.wave);
          break;
      }
    } else {
      player.addStack(def.id);
    }
    this.events.emit('upgradeChosen', { id: def.id, rarity: def.rarity, playerIndex: playerIdx });
  }

  /** Dauer-Bonus "Kopfstart": Lauf beginnt mit 1 zufaelligen Common-Upgrade. */
  applyHeadstart(playerIdx: 0 | 1 = 0): UpgradeDef | null {
    const commons = UPGRADES.filter((u) => u.rarity === 'common');
    if (commons.length === 0) return null;
    const rng = playerIdx === 0 ? this.world.rngUpgrades : this.world.rngUpgradesP2;
    const pick = commons[rng.int(commons.length)] as UpgradeDef;
    const player = (this.world.players[playerIdx] ?? this.world.players[0]) as Player;
    player.addStack(pick.id);
    return pick;
  }
}
