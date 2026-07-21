import { describe, it, expect } from 'vitest';
import {
  waveBudget,
  enemyHpFactor,
  enemySpeedFactor,
  enemyDamageFactor,
  isBossWave,
  DIFFICULTIES,
  type Difficulty,
} from './balance';

describe('waveBudget', () => {
  it('starts at 27 for wave 1', () => {
    expect(waveBudget(1)).toBe(27);
  });

  it('returns integers', () => {
    for (let w = 1; w <= 50; w++) {
      expect(Number.isInteger(waveBudget(w))).toBe(true);
    }
  });

  it('is monotonically increasing', () => {
    for (let w = 1; w < 50; w++) {
      expect(waveBudget(w + 1)).toBeGreaterThan(waveBudget(w));
    }
  });
});

describe('enemyHpFactor', () => {
  it('is 1 at wave 1', () => {
    expect(enemyHpFactor(1)).toBeCloseTo(1, 10);
  });

  it('is purely linear up to wave 10', () => {
    // Bis W10 ist der exponentielle Faktor 1.07^0 = 1.
    for (let w = 1; w <= 10; w++) {
      expect(enemyHpFactor(w)).toBeCloseTo(1 + 0.09 * (w - 1), 10);
    }
  });

  it('grows faster than linear after wave 10 (exponential kicks in)', () => {
    const linearAt15 = 1 + 0.09 * (15 - 1);
    expect(enemyHpFactor(15)).toBeGreaterThan(linearAt15);
  });

  it('is monotonically increasing', () => {
    for (let w = 1; w < 40; w++) {
      expect(enemyHpFactor(w + 1)).toBeGreaterThan(enemyHpFactor(w));
    }
  });
});

describe('enemySpeedFactor', () => {
  it('is 1 at wave 1', () => {
    expect(enemySpeedFactor(1)).toBe(1);
  });

  it('is capped at 1.4', () => {
    expect(enemySpeedFactor(1000)).toBe(1.4);
    for (let w = 1; w <= 1000; w++) {
      expect(enemySpeedFactor(w)).toBeLessThanOrEqual(1.4);
    }
  });
});

describe('enemyDamageFactor', () => {
  it('is 1 at wave 1 and +0.05 per wave (wave 11 -> 1.5)', () => {
    expect(enemyDamageFactor(1)).toBe(1);
    expect(enemyDamageFactor(11)).toBeCloseTo(1.5, 10);
  });
});

describe('isBossWave', () => {
  it('is true only on multiples of 5', () => {
    for (let w = 1; w <= 30; w++) {
      expect(isBossWave(w)).toBe(w % 5 === 0);
    }
  });
});

describe('DIFFICULTIES', () => {
  const keys: Difficulty[] = ['easy', 'normal', 'hard'];

  it('has an entry for every difficulty key', () => {
    for (const k of keys) {
      expect(DIFFICULTIES[k]).toBeDefined();
    }
  });

  it('scales damage and budget up across easy -> normal -> hard', () => {
    expect(DIFFICULTIES.easy.enemyDamage).toBeLessThan(DIFFICULTIES.normal.enemyDamage);
    expect(DIFFICULTIES.normal.enemyDamage).toBeLessThan(DIFFICULTIES.hard.enemyDamage);
    expect(DIFFICULTIES.easy.budget).toBeLessThan(DIFFICULTIES.normal.budget);
    expect(DIFFICULTIES.normal.budget).toBeLessThan(DIFFICULTIES.hard.budget);
  });

  it('gives fewer hearts on harder difficulties', () => {
    expect(DIFFICULTIES.easy.heartChance).toBeGreaterThan(DIFFICULTIES.normal.heartChance);
    expect(DIFFICULTIES.normal.heartChance).toBeGreaterThan(DIFFICULTIES.hard.heartChance);
  });
});
