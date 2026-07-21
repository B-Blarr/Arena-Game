import { describe, it, expect } from 'vitest';
import {
  hashString,
  Rng,
  makeRng,
  RNG_STREAM_WAVES,
  RNG_STREAM_UPGRADES,
  RNG_STREAM_DROPS,
  RNG_STREAM_SUMMONS,
  RNG_STREAM_EVENTS,
  RNG_STREAM_UPGRADES_P2,
  RNG_STREAM_PATH,
  RNG_STREAM_HAZARD,
} from './Rng';

describe('hashString', () => {
  it('is deterministic for the same string', () => {
    expect(hashString('neon')).toBe(hashString('neon'));
  });

  it('differs for different strings', () => {
    expect(hashString('neon')).not.toBe(hashString('arena'));
  });

  it('returns an unsigned 32-bit integer', () => {
    const h = hashString('2026-07-05');
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });

  it('matches pinned reference values (regression guard)', () => {
    // Aendert sich einer dieser Werte, verschiebt sich der Daily-Seed
    // fuer ALLE Spieler — deshalb hart gepinnt.
    expect(hashString('2026-07-05')).toBe(3332204553);
    expect(hashString('neon')).toBe(1222328133);
  });
});

describe('Rng', () => {
  it('produces identical sequences for identical seeds', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const seqA = [a.next(), a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next(), b.next()];
    expect(seqA).toEqual(seqB);
  });

  it('diverges for different seeds', () => {
    expect(new Rng(1).next()).not.toBe(new Rng(2).next());
  });

  it('matches a pinned first value for a known seed (regression guard)', () => {
    expect(new Rng(12345).next()).toBe(0.9797282677609473);
  });

  it('next() output is always within [0, 1)', () => {
    const r = new Rng(999);
    for (let i = 0; i < 10000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('range() stays within [min, max) and returns min when min === max', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.range(5, 9);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThan(9);
    }
    expect(new Rng(7).range(3, 3)).toBe(3);
  });

  it('int(n) is always in [0, n) and int(1) is always 0', () => {
    const r = new Rng(42);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
      expect(r.int(1)).toBe(0);
    }
  });

  it('chance(0) is always false and chance(1) is always true', () => {
    const r = new Rng(3);
    for (let i = 0; i < 1000; i++) {
      expect(r.chance(0)).toBe(false);
      expect(r.chance(1)).toBe(true);
    }
  });

  it('pick() returns an element of the array and is seed-reproducible', () => {
    const arr = ['a', 'b', 'c', 'd'] as const;
    const picked = new Rng(55).pick(arr);
    expect(arr).toContain(picked);
    expect(new Rng(55).pick(arr)).toBe(picked);
  });
});

describe('makeRng streams', () => {
  it('is reproducible for the same (seed, stream)', () => {
    const a = makeRng(1000, RNG_STREAM_WAVES);
    const b = makeRng(1000, RNG_STREAM_WAVES);
    expect(a.next()).toBe(b.next());
  });

  it('WAVES and UPGRADES streams diverge from the same seed', () => {
    const waves = makeRng(1000, RNG_STREAM_WAVES);
    const upgrades = makeRng(1000, RNG_STREAM_UPGRADES);
    expect(waves.next()).not.toBe(upgrades.next());
  });

  it('all RNG_STREAM_* constants are distinct', () => {
    const streams = [
      RNG_STREAM_WAVES,
      RNG_STREAM_UPGRADES,
      RNG_STREAM_DROPS,
      RNG_STREAM_SUMMONS,
      RNG_STREAM_EVENTS,
      RNG_STREAM_UPGRADES_P2,
      RNG_STREAM_PATH,
      RNG_STREAM_HAZARD,
    ];
    expect(new Set(streams).size).toBe(streams.length);
  });
});
