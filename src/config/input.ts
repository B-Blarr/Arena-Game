/**
 * Eingabe-Konfiguration: Gamepad-Buttons (Standard-Mapping), Tastatur-
 * Belegungen pro Quelle, UI-Navigations-Tuning und Rumble-Presets.
 * Alle Zahlen leben hier — nicht in den Input-Klassen.
 */

/** Button-Indizes im W3C-Standard-Mapping (Xbox-Namen als Referenz). */
export const PAD_BTN = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  /** Linker Trigger — Spezialfaehigkeit (natuerlicher Partner zu RT-Dash). */
  lt: 6,
  rt: 7,
  start: 9,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
} as const;

export const PAD_DEADZONE = 0.15;

/** Tastatur-Belegungen (e.code, layout-unabhaengig). */
export const KEYS = {
  wasd: { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', dash: ['Space'], ability: ['KeyE', 'ShiftLeft'] },
  // ShiftRight/Enter liegen direkt neben den Pfeilen — gut fuer Spieler 2;
  // ControlRight/Numpad0 sitzen im selben Cluster und sind frei fuer die Faehigkeit.
  arrows: {
    left: 'ArrowLeft',
    right: 'ArrowRight',
    up: 'ArrowUp',
    down: 'ArrowDown',
    dash: ['ShiftRight', 'Enter'],
    ability: ['ControlRight', 'Numpad0'],
  },
  pause: ['KeyP', 'Escape'],
} as const;

/** UI-Navigation per D-Pad/Stick/Pfeilen. */
export const NAV = {
  /** Stick-Hysterese: ab hier zaehlt eine Richtung ... */
  stickThreshold: 0.5,
  /** ... und erst unterhalb davon gilt sie als losgelassen. */
  stickRelease: 0.35,
  repeatDelayMs: 380,
  repeatIntervalMs: 150,
  /** Quer-Versatz-Strafe: Diagonale (unausgerichtete) Kandidaten. */
  orthoPenalty: 2.0,
  /** Quer-Versatz-Strafe innerhalb einer Reihe/Spalte (nur Tiebreaker). */
  alignedOrthoPenalty: 0.3,
  /** Slider-Schrittweite (0-100) pro Links/Rechts-Tick. */
  sliderStep: 5,
} as const;

export interface RumblePreset {
  ms: number;
  strong: number;
  weak: number;
}

export const RUMBLE = {
  hit: { ms: 100, strong: 0.5, weak: 0.3 },
  dash: { ms: 40, strong: 0.15, weak: 0.45 },
  /** Held-Spezialfaehigkeit ausgeloest — spuerbarer als der Dash. */
  ability: { ms: 120, strong: 0.45, weak: 0.35 },
  bossStomp: { ms: 150, strong: 0.7, weak: 0.2 },
  bossDied: { ms: 300, strong: 0.6, weak: 0.6 },
  playerDied: { ms: 400, strong: 0.5, weak: 0.5 },
  /** Daempfung bei "Effekte reduzieren". */
  reduceFxMult: 0.5,
} as const;
