/**
 * NEU (Reise-Modus): Raum-Typen fuer die "Weg-Wahl zwischen den Wellen".
 * Nach jeder geraeumten Welle waehlt der Spieler den Typ der naechsten Welle.
 * Alle GAMEPLAY-Wirkungen sind reine MULTIPLIKATOREN, die am Verbrauchsort
 * angewandt werden (WaveSystem.compose, World.scalingForWave, PickupSystem,
 * RunState, Enemy.applyElite, Player.update). ROOM_NORMAL ist bit-exakte
 * Identitaet (x*1.0 === x) -> der Klassik-Modus und eine gewaehlte Normal-Welle
 * sind komposition-identisch zu heute.
 *
 * NEU (Ausbau): jeder Raum kann eine eigene Arena-Groesse (arenaMult), Optik
 * (theme) und einen Namens-Charakter (enemyScaleMult / eliteScaleMult / swarmFill
 * ...) haben. ALLE neuen Felder sind optional mit No-Op-Default (x1 / 0 / undefined),
 * damit ROOM_NORMAL und der Klassik-Pfad byte-identisch bleiben (kein neuer RNG-Draw).
 */

/** Rein optische Raum-Faerbung (Render-only, nie Gameplay/RNG). Fehlende Felder
 *  fallen auf das aktuelle Biome zurueck. Farben als 0xRRGGBB. */
export interface RoomTheme {
  bg?: number;
  grid?: number;
  wall?: number;
  ring?: number;
  fogDensity?: number;
  gridIntensity?: number;
}

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
  /** Erzwingt zusaetzliche kleine Schwarm-Gegner: Budget-Anteil (0 = aus). */
  swarmFill?: number;

  // --- gelesen in World.scalingForWave / Enemy ---
  hpMult: number;
  speedMult: number;
  damageMult: number;
  /** Groesse ALLER Gegner (Kollision + Optik), 1 = unveraendert. */
  enemyScaleMult?: number;
  /** Elite-Kammer: vereinzelt riesige Elites (Kollision + Optik), 1 = normal. */
  eliteScaleMult?: number;
  /** Elite-Kammer: zaehere Elites (Max-HP), 1 = normal. */
  eliteHpMult?: number;

  // --- gelesen in RunState.startWave (Welt-weit) ---
  /** Arena-Radius-Faktor (0.8..1.3). 1 = Standard 22. */
  arenaMult?: number;
  /** Gleichzeitig-Limit-Faktor fuer Gegner (Schwarm: mehr auf dem Schirm). */
  maxEnemiesMult?: number;
  /** Singularitaet: sanfter Sog des Spielers zur Mitte (Units/s, 0 = aus). */
  pullStrength?: number;
  /** Rein optische Raum-Faerbung (undefined = reines Biome). */
  theme?: RoomTheme;

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

/** Basis-Kampf: reine Identitaet. AUCH der Wert im Klassik-Modus/vor Bossen.
 *  Laesst ALLE optionalen Felder weg -> No-Op (arenaMult/scale=1, pull=0, theme=undef). */
export const ROOM_NORMAL: RoomDef = {
  id: 'normal', icon: '⚔️', isRisk: false, minWave: 1, weight: 18,
  budgetMult: 1.0, eliteMult: 1.0,
  hpMult: 1.0, speedMult: 1.0, damageMult: 1.0,
  coreDropBonus: 0, guaranteeRare: false, healFrac: 0, bonusCores: 0,
};

/** Schatzkammer: normale Haerte, aber garantiert seltenes+ Upgrade + Bonus-Kerne.
 *  Optik: goldenes Gewoelbe. */
const ROOM_TREASURE: RoomDef = {
  id: 'treasure', icon: '💎', isRisk: true, minWave: 2, weight: 22,
  budgetMult: 1.1, eliteMult: 1.0,
  hpMult: 1.0, speedMult: 1.0, damageMult: 1.0,
  coreDropBonus: 0, guaranteeRare: true, healFrac: 0, bonusCores: 8,
  theme: { bg: 0x1a1206, grid: 0xffc83d, wall: 0xffc83d, ring: 0xffd76a, fogDensity: 0.020, gridIntensity: 0.55 },
};

/** Elite-Kammer: viel mehr Elite-Gegner (mehr Beute) + garantiert Rare.
 *  Namens-Charakter: engere Arena, vereinzelt RIESIGE, zaehe Elites. */
const ROOM_ELITE: RoomDef = {
  id: 'elite', icon: '💀', isRisk: true, minWave: 6, weight: 20,
  budgetMult: 0.9, eliteMult: 3.0, eliteMaxPerWave: 4,
  hpMult: 1.1, speedMult: 1.0, damageMult: 1.1,
  eliteScaleMult: 1.5, eliteHpMult: 1.4,
  arenaMult: 0.9,
  coreDropBonus: 0, guaranteeRare: true, healFrac: 0, bonusCores: 0,
  theme: { bg: 0x140109, grid: 0xd23dff, wall: 0xff3df2, ring: 0xff5ce0, fogDensity: 0.026, gridIntensity: 0.4 },
};

/** Sturm/Gefahr: deutlich schnellere+staerkere Gegner, dafuer doppelte Kerne.
 *  Optik: elektrisches Blau-Violett, dichterer Nebel. */
const ROOM_STORM: RoomDef = {
  id: 'storm', icon: '⚡', isRisk: true, minWave: 2, weight: 22,
  budgetMult: 1.15, eliteMult: 1.0,
  hpMult: 1.0, speedMult: 1.35, damageMult: 1.25,
  coreDropBonus: 1, guaranteeRare: false, healFrac: 0, bonusCores: 0,
  theme: { bg: 0x080618, grid: 0x6a5cff, wall: 0x8f7dff, ring: 0x9adfff, fogDensity: 0.024, gridIntensity: 0.5 },
};

/** Rast/Oase: wenige, schwaechere Gegner + Heilung, dafuer karge Belohnung.
 *  Namens-Charakter: kleine, gemuetliche Arena, ruhiges Gruen. */
const ROOM_OASIS: RoomDef = {
  id: 'oasis', icon: '🌿', isRisk: false, minWave: 3, weight: 9,
  budgetMult: 0.55, eliteMult: 0,
  hpMult: 0.9, speedMult: 0.9, damageMult: 0.9,
  enemyScaleMult: 0.95,
  arenaMult: 0.8,
  coreDropBonus: 0, guaranteeRare: false, healFrac: 0.30, bonusCores: 0,
  theme: { bg: 0x03140c, grid: 0x2fe08a, wall: 0x3dffb0, ring: 0x7dffb0, fogDensity: 0.012, gridIntensity: 0.45 },
};

/** Mystery: verdeckte "???"-Karte, loest beim Klick zu einem zufaelligen Raum auf.
 *  Eigene Felder sind Identitaet und werden nie direkt genutzt (immer aufgeloest);
 *  in der Arena zaehlt dann Optik/Groesse des aufgeloesten Raums. */
const ROOM_MYSTERY: RoomDef = {
  id: 'mystery', icon: '🌈', isRisk: true, minWave: 4, weight: 12,
  budgetMult: 1.0, eliteMult: 1.0,
  hpMult: 1.0, speedMult: 1.0, damageMult: 1.0,
  coreDropBonus: 0, guaranteeRare: false, healFrac: 0, bonusCores: 0,
};

/** Horde/Schwarm: viele SEHR kleine Gegner (Combo-Fest), weite Arena, kleine Kern-Pauschale. */
const ROOM_HORDE: RoomDef = {
  id: 'horde', icon: '🐝', isRisk: true, minWave: 3, weight: 16,
  budgetMult: 1.5, eliteMult: 0.5,
  hpMult: 0.7, speedMult: 1.1, damageMult: 0.9,
  swarmFill: 0.5, enemyScaleMult: 0.8, maxEnemiesMult: 1.6,
  arenaMult: 1.2,
  coreDropBonus: 0, guaranteeRare: false, healFrac: 0, bonusCores: 4,
  theme: { bg: 0x0c1402, grid: 0xa8ff3d, wall: 0xc8ff5c, ring: 0xd6ff7a, fogDensity: 0.018, gridIntensity: 0.5 },
};

/** NEU Finsternis: dichter Nebel + gedimmtes Grid -> man kaempft im Muzzle-Flash.
 *  Belohnung fuers Kaempfen im Dunkeln: Bonus-Kerne + doppelte Kern-Drops. */
const ROOM_FINSTERNIS: RoomDef = {
  id: 'finsternis', icon: '🌑', isRisk: true, minWave: 5, weight: 14,
  budgetMult: 1.1, eliteMult: 1.0,
  hpMult: 1.0, speedMult: 1.0, damageMult: 1.0,
  coreDropBonus: 1, guaranteeRare: false, healFrac: 0, bonusCores: 3,
  theme: { bg: 0x010104, grid: 0x1a3a5c, wall: 0x24506e, ring: 0x3d6e8f, fogDensity: 0.042, gridIntensity: 0.18 },
};

/** NEU Singularitaet: sanfter Sog des Spielers zur Mitte -> man muss gegen die Drift
 *  ansteuern. Weite Arena + starke Belohnung. */
const ROOM_SINGULAR: RoomDef = {
  id: 'singular', icon: '🌀', isRisk: true, minWave: 7, weight: 12,
  budgetMult: 1.0, eliteMult: 1.0,
  hpMult: 1.0, speedMult: 1.0, damageMult: 1.0,
  pullStrength: 3.5, arenaMult: 1.1,
  coreDropBonus: 1, guaranteeRare: true, healFrac: 0, bonusCores: 6,
  theme: { bg: 0x0a0418, grid: 0x8f5cff, wall: 0xb07aff, ring: 0xc07aff, fogDensity: 0.026, gridIntensity: 0.45 },
};

export const ROOMS: readonly RoomDef[] = [
  ROOM_NORMAL, ROOM_TREASURE, ROOM_ELITE, ROOM_STORM, ROOM_OASIS,
  ROOM_MYSTERY, ROOM_HORDE, ROOM_FINSTERNIS, ROOM_SINGULAR,
];

/** Risiko-Raeume werden im Angebot bevorzugt (Draw 1+2), "meist zwei Risiken". */
export const RISK_ROOMS: readonly RoomDef[] = ROOMS.filter((r) => r.isRisk);

/** picks = angebotene Karten, draws = FESTE rngPath-Ziehungen pro Entscheidung. */
export const PATH = { picks: 3, draws: 4 } as const;
