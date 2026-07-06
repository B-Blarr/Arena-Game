/**
 * NEU (Reise-Modus): Raum-Typen fuer die "Weg-Wahl zwischen den Wellen".
 * Nach jeder geraeumten Welle waehlt der Spieler den Typ der naechsten Welle.
 * Alle Wirkungen sind reine MULTIPLIKATOREN, die am Verbrauchsort angewandt
 * werden (WaveSystem.compose, World.scalingForWave, PickupSystem, RunState).
 * ROOM_NORMAL ist bit-exakte Identitaet (x*1.0 === x) -> der Klassik-Modus und
 * eine gewaehlte Normal-Welle sind komposition-identisch zu heute.
 */
export interface RoomDef {
  id: string;
  icon: string;
  /** Steuert den Angebots-Pool (Risiko-Raeume werden garantiert angeboten). */
  isRisk: boolean;
  /** Erst ab dieser Welle angebotsfaehig (deterministisch, kein RNG). */
  minWave: number;
  /** Auswahlgewicht innerhalb seines Pools. */
  weight: number;

  // --- gelesen in WaveSystem.compose ---
  budgetMult: number;
  eliteMult: number;
  /** Ueberschreibt ELITE.maxPerWave, wenn gesetzt (Elite-Kammer). */
  eliteMaxPerWave?: number;

  // --- gelesen in World.scalingForWave ---
  hpMult: number;
  speedMult: number;
  damageMult: number;

  // --- gelesen in PickupSystem.spawnCoreMaybeGolden ---
  /** Zusaetzliche Kerne pro Kern-Drop (1 = "doppelt", wie eine Goldene Welle). */
  coreDropBonus: number;

  // --- konsumiert in RunState.onWaveCleared ---
  /** Garantiert ein seltenes+ Upgrade in der Wahl NACH dieser Raum-Welle. */
  guaranteeRare: boolean;
  /** Heilung beim Raeumen (Anteil der Max-HP, 0 = keine). */
  healFrac: number;
  /** Pauschale Bonus-Kerne beim Raeumen. */
  bonusCores: number;
}

/** Basis-Kampf: reine Identitaet. AUCH der Wert im Klassik-Modus/vor Bossen. */
export const ROOM_NORMAL: RoomDef = {
  id: 'normal', icon: '⚔️', isRisk: false, minWave: 1, weight: 18,
  budgetMult: 1.0, eliteMult: 1.0,
  hpMult: 1.0, speedMult: 1.0, damageMult: 1.0,
  coreDropBonus: 0, guaranteeRare: false, healFrac: 0, bonusCores: 0,
};

/** Schatzkammer: normale Haerte, aber garantiert seltenes+ Upgrade + Bonus-Kerne. */
const ROOM_TREASURE: RoomDef = {
  id: 'treasure', icon: '💎', isRisk: true, minWave: 2, weight: 22,
  budgetMult: 1.1, eliteMult: 1.0,
  hpMult: 1.0, speedMult: 1.0, damageMult: 1.0,
  coreDropBonus: 0, guaranteeRare: true, healFrac: 0, bonusCores: 8,
};

/** Elite-Kammer: viel mehr Elite-Gegner (mehr Beute) + garantiert Rare. */
const ROOM_ELITE: RoomDef = {
  id: 'elite', icon: '💀', isRisk: true, minWave: 6, weight: 20,
  budgetMult: 0.9, eliteMult: 3.0, eliteMaxPerWave: 4,
  hpMult: 1.1, speedMult: 1.0, damageMult: 1.1,
  coreDropBonus: 0, guaranteeRare: true, healFrac: 0, bonusCores: 0,
};

/** Sturm/Gefahr: deutlich schnellere+staerkere Gegner, dafuer doppelte Kerne. */
const ROOM_STORM: RoomDef = {
  id: 'storm', icon: '⚡', isRisk: true, minWave: 2, weight: 22,
  budgetMult: 1.15, eliteMult: 1.0,
  hpMult: 1.0, speedMult: 1.35, damageMult: 1.25,
  coreDropBonus: 1, guaranteeRare: false, healFrac: 0, bonusCores: 0,
};

/** Rast/Oase: wenige, schwaechere Gegner + Heilung, dafuer karge Belohnung. */
const ROOM_OASIS: RoomDef = {
  id: 'oasis', icon: '🌿', isRisk: false, minWave: 3, weight: 9,
  budgetMult: 0.55, eliteMult: 0,
  hpMult: 0.9, speedMult: 0.9, damageMult: 0.9,
  coreDropBonus: 0, guaranteeRare: false, healFrac: 0.30, bonusCores: 0,
};

/** Mystery: verdeckte "???"-Karte, loest beim Klick zu einem zufaelligen Raum auf.
 *  Eigene Felder sind Identitaet und werden nie direkt genutzt (immer aufgeloest). */
const ROOM_MYSTERY: RoomDef = {
  id: 'mystery', icon: '🌈', isRisk: true, minWave: 4, weight: 12,
  budgetMult: 1.0, eliteMult: 1.0,
  hpMult: 1.0, speedMult: 1.0, damageMult: 1.0,
  coreDropBonus: 0, guaranteeRare: false, healFrac: 0, bonusCores: 0,
};

/** Horde/Schwarm: viele schwache Gegner (Combo-Fest), kleine Kern-Pauschale. */
const ROOM_HORDE: RoomDef = {
  id: 'horde', icon: '🐝', isRisk: true, minWave: 3, weight: 16,
  budgetMult: 1.5, eliteMult: 0.5,
  hpMult: 0.7, speedMult: 1.1, damageMult: 0.9,
  coreDropBonus: 0, guaranteeRare: false, healFrac: 0, bonusCores: 4,
};

export const ROOMS: readonly RoomDef[] = [
  ROOM_NORMAL, ROOM_TREASURE, ROOM_ELITE, ROOM_STORM, ROOM_OASIS, ROOM_MYSTERY, ROOM_HORDE,
];

/** Risiko-Raeume werden im Angebot bevorzugt (Draw 1+2), "meist zwei Risiken". */
export const RISK_ROOMS: readonly RoomDef[] = ROOMS.filter((r) => r.isRisk);

/** picks = angebotene Karten, draws = FESTE rngPath-Ziehungen pro Entscheidung. */
export const PATH = { picks: 3, draws: 4 } as const;
