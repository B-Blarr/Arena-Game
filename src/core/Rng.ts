/** FNV-1a-Hash fuer Seed-Strings (z. B. "2026-07-05" beim Daily Seed). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Mulberry32-PRNG: klein, schnell, deterministisch.
 * Getrennte Streams (Wellen/Upgrades/Drops) verhindern, dass
 * Spieler-Verhalten die Wellen-Zusammensetzung "verschiebt".
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Gleichverteilt in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Ganzzahl in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)] as T;
  }
}

export const RNG_STREAM_WAVES = 0;
export const RNG_STREAM_UPGRADES = 0x9e3779b9;
export const RNG_STREAM_DROPS = 0x85ebca6b;
/** Boss-Beschwoerungen: eigener Stream — ihr spielerabhaengiger Verbrauch
 *  darf den Wellen-Plan (rngWaves) im Daily Seed nicht verschieben. */
export const RNG_STREAM_SUMMONS = 0xc2b2ae35;
/** Ueberraschungs-Events (Goldene Welle, Versorgungskapsel): eigener Stream
 *  mit FESTEM Verbrauch pro Wellenstart — Daily Seed bleibt stabil. */
export const RNG_STREAM_EVENTS = 0x27d4eb2f;

export function makeRng(seed: number, stream: number): Rng {
  return new Rng((seed ^ stream) >>> 0);
}
