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
 * (theme) und einen Namens-Charakter (enemyScaleMult / eliteScaleMult / forceType /
 * hazard ...) haben. ALLE neuen Felder sind optional mit No-Op-Default (x1 / 0 / undefined),
 * damit ROOM_NORMAL und der Klassik-Pfad byte-identisch bleiben (kein neuer RNG-Draw).
 */

import { ENEMY_SHOOTER, ENEMY_SWARM, ENEMY_TANK, ENEMY_SPLITTER, ENEMY_PHANTOM } from './enemies';

/** Rein optische Raum-Faerbung (Render-only, nie Gameplay/RNG). Fehlende Felder
 *  fallen auf das aktuelle Biome zurueck. Farben als 0xRRGGBB. */
export interface RoomTheme {
  bg?: number;
  grid?: number;
  wall?: number;
  ring?: number;
  fogDensity?: number;
  gridIntensity?: number;
  /** NEU (Atmosphaere): laufende Optik-Animation (Render-only, KEIN RNG).
   *  pulseFog = Nebel atmet, swirl = Grid dreht sich, flicker = Blitze,
   *  drift = Grid scrollt in Windrichtung (Windkanal-Telegraph). */
  anim?: 'pulseFog' | 'swirl' | 'flicker' | 'drift';
  /** NEU (Sinnes-Signatur, Render-only): Post-Grade als DELTA auf die Basis
   *  (Bloom-Basis 0.9, Vignette-Basis 0.55). +/- verschiebt, undefined = neutral.
   *  Renderer.setGrade daempft das Delta mit fxIntensity (reduce-fx). */
  bloom?: number;
  vignette?: number;
  /** NEU (Sinnes-Signatur): Sternenhimmel-Toenung (0xRRGGBB, multipliziert die
   *  Vertex-Farben; undefined = weiss/neutral) + Dreh-Tempo-Faktor (1 = normal). */
  starTint?: number;
  starSpeed?: number;
}

/** NEU (Gefahren-Zonen): rote Boden-Kreise, die kurz nach der Warnung zuenden und
 *  NUR den Spieler treffen (rot = ausweichen). Wiederverwendung des MINOS-Bomben-
 *  Vokabulars (enemyFuse-Warnring + explosion). Nur im Reise-Modus aktiv. */
export interface HazardDef {
  /** Sekunden zwischen zwei Zonen-Salven. */
  interval: number;
  /** Vorwarnzeit vom Erscheinen bis zur Zuendung. */
  warn: number;
  /** Radius der Schadenszone in Units. */
  radius: number;
  /** Grundschaden bei Zuendung (x world.mods.enemyDamage fuer Schwierigkeit). */
  damage: number;
  /** Zonen pro Salve (Basis-Wert der Startwelle). */
  count: number;
  /** NEU (Skalierung): je so viele Wellen ueber der Raum-minWave +1 Zone
   *  (undefined = keine Zunahme). Gedeckelt durch countMax. */
  countRampEvery?: number;
  countMax?: number;
  /** NEU (Skalierung): Intervall sinkt pro Welle ueber der minWave (Sek),
   *  nie unter intervalMin. Beide undefined = konstantes Tempo. */
  intervalRampPerWave?: number;
  intervalMin?: number;
  /** NEU (Muster): pro Salve zufaellig gewaehltes Layout (rngHazard, Reise-only).
   *  undefined = ['scatter'] (Verhalten wie bisher). */
  patterns?: ('scatter' | 'ring' | 'line')[];
  /** NEU (Sturm-Blitze): Warn-/Explosionsfarbe (0xRRGGBB). undefined = orange
   *  Explosion + roter Warnring (Minenfeld-Standard). */
  color?: number;
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
  /** Mono-Typ-Raeume: erzwingt einen Gegnertyp (Index) ... */
  forceType?: number;
  /** ... bis zu diesem Budget-Anteil (0..1, z.B. 0.7). Ohne forceType wirkungslos. */
  forceShare?: number;

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
  /** NEU (Kollaps-Arena): die Wand faehrt pro Welle bis zu diesem Faktor der Basis
   *  nach innen (z.B. 0.6). undefined = statische Arena. Wird in RunState.update
   *  pro Frame Richtung Boden getickt. */
  arenaShrinkTo?: number;
  /** NEU (Kollaps-Arena): Schrumpf-Tempo in Units/s (undefined = 0 = kein Schrumpfen). */
  arenaShrinkRate?: number;
  /** Gleichzeitig-Limit-Faktor fuer Gegner (Schwarm: mehr auf dem Schirm). */
  maxEnemiesMult?: number;
  /** Singularitaet: sanfter Sog des Spielers zur Mitte (Units/s, 0 = aus). */
  pullStrength?: number;
  /** NEU (Windkanal): konstanter gerichteter Drift des Spielers (Units/s, 0 = aus).
   *  Richtung setzt RunState.startWave deterministisch pro Welle. */
  driftStrength?: number;
  /** Minenfeld: periodische Gefahren-Zonen am Boden (undefined = keine). */
  hazard?: HazardDef;
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
  theme: { bg: 0x1a1206, grid: 0xffc83d, wall: 0xffc83d, ring: 0xffd76a, fogDensity: 0.020, gridIntensity: 0.55, bloom: 0.5, vignette: -0.05, starTint: 0xffe0a0, starSpeed: 0.8 },
};

/** Elite-Kammer: "Thronsaal" — WENIGE, RIESIGE, bedrohliche Kolosse in einer engen,
 *  ominoesen Kammer. Namens-Charakter jetzt viel staerker: eigenes Gold/Violett-Thron-Theme
 *  (nicht mehr das Biome-Magenta), atmende pulseFog-Atmosphaere, ALLE Gegner groesser
 *  (enemyScaleMult), weniger Budget aber mehr/groessere Elites. */
const ROOM_ELITE: RoomDef = {
  id: 'elite', icon: '💀', isRisk: true, minWave: 6, weight: 20,
  budgetMult: 0.8, eliteMult: 3.5, eliteMaxPerWave: 5,
  hpMult: 1.1, speedMult: 1.0, damageMult: 1.1,
  enemyScaleMult: 1.15, eliteScaleMult: 1.5, eliteHpMult: 1.4,
  arenaMult: 0.85,
  coreDropBonus: 0, guaranteeRare: true, healFrac: 0, bonusCores: 0,
  theme: { bg: 0x0c0418, grid: 0xffc83d, wall: 0x9a3dff, ring: 0xffe08a, fogDensity: 0.030, gridIntensity: 0.35, anim: 'pulseFog', bloom: 0.3, vignette: 0.35, starTint: 0xd4a017, starSpeed: 0.6 },
};

/** Sturm/Gefahr: deutlich schnellere+staerkere Gegner, dafuer doppelte Kerne.
 *  Optik: elektrisches Blau-Violett, dichterer Nebel. */
const ROOM_STORM: RoomDef = {
  id: 'storm', icon: '⚡', isRisk: true, minWave: 2, weight: 22,
  budgetMult: 1.15, eliteMult: 1.0,
  hpMult: 1.0, speedMult: 1.35, damageMult: 1.25,
  // NEU (Sturm-Blitze): vereinzelte, gut vorgewarnte elektrische Einschlaege ueber das
  // HazardSystem. Bewusst schwach dosiert (kleiner Radius) — der Sturm ist ohnehin hart.
  // Skaliert: 1 Blitz (W2-6) -> 2 (W7-11) -> 3 (W12+). Reise-only -> Klassik zieht rngHazard nie.
  hazard: { interval: 2.6, warn: 1.2, radius: 2.2, damage: 12, count: 1, color: 0x9adfff, countRampEvery: 5, countMax: 3, intervalMin: 2.0 },
  coreDropBonus: 1, guaranteeRare: false, healFrac: 0, bonusCores: 0,
  theme: { bg: 0x080618, grid: 0x6a5cff, wall: 0x8f7dff, ring: 0x9adfff, fogDensity: 0.024, gridIntensity: 0.5, anim: 'flicker', bloom: 0.3, vignette: 0.1, starTint: 0x9adfff, starSpeed: 2.2 },
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
  theme: { bg: 0x03140c, grid: 0x2fe08a, wall: 0x3dffb0, ring: 0x7dffb0, fogDensity: 0.012, gridIntensity: 0.45, bloom: 0.1, vignette: -0.15, starTint: 0xbfffe0, starSpeed: 0.5 },
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
  forceType: ENEMY_SWARM, forceShare: 0.5, enemyScaleMult: 0.8, maxEnemiesMult: 1.6,
  arenaMult: 1.2,
  coreDropBonus: 0, guaranteeRare: false, healFrac: 0, bonusCores: 4,
  theme: { bg: 0x0c1402, grid: 0xa8ff3d, wall: 0xc8ff5c, ring: 0xd6ff7a, fogDensity: 0.018, gridIntensity: 0.5, bloom: 0.15, starTint: 0xd6ff7a, starSpeed: 1.4 },
};

/** NEU Finsternis: dichter Nebel + gedimmtes Grid -> man kaempft im Muzzle-Flash.
 *  Belohnung fuers Kaempfen im Dunkeln: Bonus-Kerne + doppelte Kern-Drops. */
const ROOM_FINSTERNIS: RoomDef = {
  id: 'finsternis', icon: '🌑', isRisk: true, minWave: 5, weight: 14,
  budgetMult: 1.1, eliteMult: 1.0,
  hpMult: 1.0, speedMult: 1.0, damageMult: 1.0,
  coreDropBonus: 1, guaranteeRare: false, healFrac: 0, bonusCores: 3,
  theme: { bg: 0x010104, grid: 0x1a3a5c, wall: 0x24506e, ring: 0x3d6e8f, fogDensity: 0.042, gridIntensity: 0.18, anim: 'pulseFog', bloom: -0.5, vignette: 0.35, starTint: 0x2a4a6a, starSpeed: 0.3 },
};

/** NEU Singularitaet: sanfter Sog des Spielers zur Mitte -> man muss gegen die Drift
 *  ansteuern. Weite Arena + starke Belohnung. */
const ROOM_SINGULAR: RoomDef = {
  id: 'singular', icon: '🌀', isRisk: true, minWave: 7, weight: 12,
  budgetMult: 1.0, eliteMult: 1.0,
  hpMult: 1.0, speedMult: 1.0, damageMult: 1.0,
  pullStrength: 3.5, arenaMult: 1.1,
  coreDropBonus: 1, guaranteeRare: true, healFrac: 0, bonusCores: 6,
  theme: { bg: 0x0a0418, grid: 0x8f5cff, wall: 0xb07aff, ring: 0xc07aff, fogDensity: 0.026, gridIntensity: 0.45, anim: 'swirl', bloom: 0.25, vignette: 0.15, starTint: 0xc0a0ff, starSpeed: 1.6 },
};

/** NEU Minenfeld: periodische Gefahren-Zonen am Boden (rot = ausweichen, treffen
 *  NUR den Spieler). Etwas weniger Gegner, dafuer Kern-Bonus fuer die Nervenprobe. */
const ROOM_MINEFIELD: RoomDef = {
  id: 'minefield', icon: '💥', isRisk: true, minWave: 4, weight: 16,
  budgetMult: 0.85, eliteMult: 1.0,
  hpMult: 1.0, speedMult: 1.0, damageMult: 1.0,
  coreDropBonus: 1, guaranteeRare: false, healFrac: 0, bonusCores: 3,
  // NEU (Skalierung + Muster): startet mit 2 Zonen/3.0s (Welle 4), waechst bis 6 Zonen/1.8s
  // (Welle 16+). Jede Salve variiert ihr Layout (Streu/Ring/Linie), alle vorgewarnt.
  hazard: {
    interval: 3.0, warn: 1.4, radius: 3.2, damage: 18, count: 2,
    countRampEvery: 3, countMax: 6, intervalRampPerWave: 0.1, intervalMin: 1.8,
    patterns: ['scatter', 'ring', 'line'],
  },
  theme: { bg: 0x160a02, grid: 0xff8c1a, wall: 0xffb04d, ring: 0xffd08a, fogDensity: 0.022, gridIntensity: 0.5, bloom: 0.2, vignette: 0.1, starTint: 0xffb060, starSpeed: 1.3 },
};

/** NEU Panzerwall: fast nur Panzer — wenige, langsame, extrem zaehe Kolosse.
 *  Belagerungs-Gefuehl; maxAlive der Panzer drosselt die Gleichzeitig-Zahl. */
const ROOM_TANKS: RoomDef = {
  id: 'tanks', icon: '🛡️', isRisk: true, minWave: 8, weight: 14,
  budgetMult: 1.25, eliteMult: 1.0,
  hpMult: 1.0, speedMult: 1.0, damageMult: 1.0,
  forceType: ENEMY_TANK, forceShare: 0.8, maxEnemiesMult: 1.2,
  coreDropBonus: 1, guaranteeRare: false, healFrac: 0, bonusCores: 0,
  theme: { bg: 0x0a0e14, grid: 0x7f93b3, wall: 0x9fb4d8, ring: 0xc0d4f0, fogDensity: 0.022, gridIntensity: 0.42, bloom: -0.1, vignette: 0.15, starTint: 0xaac0e0, starSpeed: 0.7 },
};

/** NEU Schuetzenstand: fast nur Schuetzen — Kugelhagel aus der Distanz, staendig
 *  in Bewegung bleiben. */
const ROOM_SHOOTERS: RoomDef = {
  id: 'shooters', icon: '🎯', isRisk: true, minWave: 4, weight: 15,
  budgetMult: 1.0, eliteMult: 1.0,
  hpMult: 1.0, speedMult: 1.0, damageMult: 1.0,
  forceType: ENEMY_SHOOTER, forceShare: 0.85, arenaMult: 1.1,
  coreDropBonus: 1, guaranteeRare: false, healFrac: 0, bonusCores: 0,
  theme: { bg: 0x140f02, grid: 0xffd21a, wall: 0xffe25c, ring: 0xfff0a0, fogDensity: 0.02, gridIntensity: 0.5, bloom: 0.25, vignette: 0.05, starTint: 0xffe27a, starSpeed: 1.6 },
};

/** NEU Geisterstunde: fast nur Phantome — teleportierendes Chaos, sehr hektisch. */
const ROOM_PHANTOMS: RoomDef = {
  id: 'phantoms', icon: '👻', isRisk: true, minWave: 9, weight: 12,
  budgetMult: 1.05, eliteMult: 1.0,
  hpMult: 1.0, speedMult: 1.0, damageMult: 1.0,
  forceType: ENEMY_PHANTOM, forceShare: 0.85,
  coreDropBonus: 1, guaranteeRare: false, healFrac: 0, bonusCores: 0,
  theme: { bg: 0x0c0616, grid: 0x9a6bff, wall: 0xb98cff, ring: 0xd6b3ff, fogDensity: 0.03, gridIntensity: 0.35, anim: 'flicker', bloom: 0.1, vignette: 0.2, starTint: 0xc79cff, starSpeed: 1.9 },
};

/** NEU Zellteilung: fast nur Splitter — teilen sich beim Tod, der Schirm fuellt
 *  sich rasant, Combo-Fest. */
const ROOM_SPLITTERS: RoomDef = {
  id: 'splitters', icon: '🧫', isRisk: true, minWave: 6, weight: 14,
  budgetMult: 1.0, eliteMult: 1.0,
  hpMult: 1.0, speedMult: 1.0, damageMult: 1.0,
  forceType: ENEMY_SPLITTER, forceShare: 0.85, maxEnemiesMult: 1.3, arenaMult: 1.1,
  coreDropBonus: 0, guaranteeRare: false, healFrac: 0, bonusCores: 3,
  theme: { bg: 0x02140f, grid: 0x1fd6a0, wall: 0x4dffc3, ring: 0x8affda, fogDensity: 0.02, gridIntensity: 0.5, bloom: 0.2, starTint: 0x8affda, starSpeed: 1.5 },
};

/** NEU Windkanal: eine konstante Brise schiebt den Spieler ueber den Boden (feste
 *  Richtung je Welle) — Zielen/Positionhalten braucht Gegensteuern. Der scrollende
 *  Grid-Boden telegrafiert die Windrichtung. Spiegelt die Singularitaets-Mechanik. */
const ROOM_WINDKANAL: RoomDef = {
  id: 'windkanal', icon: '🌬️', isRisk: true, minWave: 3, weight: 14,
  budgetMult: 1.0, eliteMult: 1.0,
  hpMult: 1.0, speedMult: 1.0, damageMult: 1.0,
  driftStrength: 2.5, // ~42% der Spieler-Speed 6.0 -> immer gegensteuerbar (vgl. Sog 3.5)
  coreDropBonus: 1, guaranteeRare: false, healFrac: 0, bonusCores: 0,
  theme: { bg: 0x03121a, grid: 0x3dd4ff, wall: 0x6ae0ff, ring: 0x9af0ff, fogDensity: 0.016, gridIntensity: 0.5, anim: 'drift', bloom: 0.1, vignette: -0.1, starTint: 0xbfeaff, starSpeed: 3.0 },
};

/** NEU Glaskanonen: schnelle, hart zuschlagende Gegner, die beim ersten Treffer
 *  zerplatzen — Reflex- und Combo-Fest. Reiner Stat-Remix (kein forceType), eliteMult 0
 *  haelt die Ein-Treffer-Fantasie an spaeten Wellen intakt (keine Elite-HP-Reinflation). */
const ROOM_GLASSCANNON: RoomDef = {
  id: 'glasscannon', icon: '💠', isRisk: true, minWave: 4, weight: 14,
  budgetMult: 1.15, eliteMult: 0,
  hpMult: 0.5, speedMult: 1.35, damageMult: 1.25,
  enemyScaleMult: 0.9, maxEnemiesMult: 1.25,
  coreDropBonus: 1, guaranteeRare: false, healFrac: 0, bonusCores: 0,
  theme: { bg: 0x0a0f16, grid: 0x5ce0ff, wall: 0x8af0ff, ring: 0xbffaff, fogDensity: 0.018, gridIntensity: 0.55, bloom: 0.4, vignette: 0.05, starTint: 0xa0e0ff, starSpeed: 1.8 },
};

/** NEU Kollaps-Arena: die Energiewand faehrt ueber die Welle langsam nach innen und
 *  quetscht den Kampfraum — reines Kiten reicht nicht mehr. Der schrumpfende Ring ist
 *  der Telegraph; setzt jede Welle neu auf. Grosszuegiger Boden-Radius (faengt nie ein). */
const ROOM_COLLAPSE: RoomDef = {
  id: 'collapse', icon: '⭕', isRisk: true, minWave: 5, weight: 13,
  budgetMult: 1.0, eliteMult: 1.0,
  hpMult: 1.0, speedMult: 1.0, damageMult: 1.0,
  // NEU (distinkter): deutlich spuerbarerer Shrink (schneller + engeres Ende, faengt weiter
  // nie ein: Boden 22*0.52 ~= 11.4). Enger werdender Raum fuellt sich staerker.
  arenaMult: 1.1, arenaShrinkTo: 0.52, arenaShrinkRate: 0.28, maxEnemiesMult: 1.2,
  // NEU (Signatur-Gefahr): Rand-Zonen im Ring-Muster kriechen mit der schrumpfenden Wand
  // nach innen ("die Waende schlagen zu"). Bewusst mild fuer Kinder (1 Zone, grosse Vorwarnung).
  hazard: { interval: 3.2, warn: 1.4, radius: 2.6, damage: 12, count: 1, color: 0xff6a3d, countRampEvery: 6, countMax: 2, intervalMin: 2.4, patterns: ['ring'] },
  coreDropBonus: 1, guaranteeRare: false, healFrac: 0, bonusCores: 4,
  theme: { bg: 0x160806, grid: 0xff6a3d, wall: 0xff8a5c, ring: 0xffb08a, fogDensity: 0.024, gridIntensity: 0.5, anim: 'flicker', bloom: 0.2, vignette: 0.25, starTint: 0xff8060, starSpeed: 1.5 },
};

export const ROOMS: readonly RoomDef[] = [
  ROOM_NORMAL, ROOM_TREASURE, ROOM_ELITE, ROOM_STORM, ROOM_OASIS,
  ROOM_MYSTERY, ROOM_HORDE, ROOM_FINSTERNIS, ROOM_SINGULAR,
  ROOM_MINEFIELD, ROOM_TANKS, ROOM_SHOOTERS, ROOM_PHANTOMS, ROOM_SPLITTERS,
  ROOM_WINDKANAL, ROOM_GLASSCANNON, ROOM_COLLAPSE,
];

/** Risiko-Raeume werden im Angebot bevorzugt (Draw 1+2), "meist zwei Risiken". */
export const RISK_ROOMS: readonly RoomDef[] = ROOMS.filter((r) => r.isRisk);

/** picks = angebotene Karten, draws = FESTE rngPath-Ziehungen pro Entscheidung. */
export const PATH = { picks: 3, draws: 4 } as const;
