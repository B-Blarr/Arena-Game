import { PATH, RISK_ROOMS, ROOMS, ROOM_NORMAL, type RoomDef } from '../config/rooms';
import type { World } from '../core/World';

export interface RoomOffer {
  def: RoomDef;
  /** Nur bei Mystery gesetzt: der aufgeloeste echte Raum (Karte bleibt verdeckt). */
  hidden?: RoomDef;
}

/**
 * NEU (Reise-Modus): erzeugt die Weg-Wahl-Angebote deterministisch.
 * Zieht pro Entscheidung EXAKT PATH.draws (4) Werte aus rngPath — unabhaengig von
 * Pool-Groesse, Ergebnis und Spielerverhalten (Determinismus-Regel wie SurpriseDirector).
 * "Meist zwei Risiken": 2 garantierte Risiko-Raeume (Draw 1+2) + 1 Wildcard (Draw 3,
 * nur hier koennen normal/oasis auftauchen) + 1 fester Mystery-Aufloese-Draw (Draw 4).
 * weightedPickByRoll zieht selbst KEIN rng — es bekommt den vorgezogenen Wert.
 */
export class PathSystem {
  currentOffers: RoomOffer[] = [];

  constructor(private readonly world: World) {}

  reset(): void {
    this.currentOffers = [];
  }

  rollOffers(w: number): RoomOffer[] {
    const rng = this.world.rngPath;
    const eligibleRisk = RISK_ROOMS.filter((r) => r.minWave <= w);
    const eligibleAll = ROOMS.filter((r) => r.minWave <= w);
    const chosen: RoomDef[] = [];

    // Draw 1 + 2: zwei garantierte Risiko-Raeume (ohne Zuruecklegen). rng.next()
    // wird IMMER gezogen, auch wenn der Pool leer waere — feste Draw-Zahl.
    for (let k = 0; k < 2; k++) {
      const roll = rng.next();
      const pick = weightedPickByRoll(eligibleRisk.filter((r) => !chosen.includes(r)), roll);
      if (pick) chosen.push(pick);
    }
    // Draw 3: Wildcard aus dem Gesamt-Pool (normal/oasis nur hier moeglich, selten).
    const rollC = rng.next();
    const wildcard = weightedPickByRoll(eligibleAll.filter((r) => !chosen.includes(r)), rollC);
    if (wildcard) chosen.push(wildcard);

    // Draw 4: IMMER ziehen (haelt die Draw-Zahl konstant). Loest eine evtl. gezogene
    // Mystery-Karte zu einem echten Raum auf; ohne Mystery-Karte wird der Wert verworfen.
    const rollM = rng.next();
    const offers = chosen.map<RoomOffer>((def) => {
      if (def.id !== 'mystery') return { def };
      const pool = eligibleAll.filter((r) => r.id !== 'mystery' && !chosen.includes(r));
      return { def, hidden: weightedPickByRoll(pool, rollM) ?? ROOM_NORMAL };
    });

    this.currentOffers = offers;
    return offers;
  }
}

/** Gewichtete Auswahl mit VORGEZOGENEM roll [0,1) — zieht selbst KEIN rng (determinismus-neutral). */
function weightedPickByRoll(pool: readonly RoomDef[], roll: number): RoomDef | undefined {
  let total = 0;
  for (const r of pool) total += r.weight;
  if (total <= 0) return undefined;
  let x = roll * total;
  for (const r of pool) {
    x -= r.weight;
    if (x < 0) return r;
  }
  return pool[pool.length - 1];
}

// PATH re-exportiert, damit Aufrufer die feste Karten-/Draw-Zahl kennen.
export { PATH };
