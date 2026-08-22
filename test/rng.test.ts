import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.js';

describe('Rng', () => {
  it('is deterministic for a seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('stays in [0, 1)', () => {
    const r = new Rng(1);
    for (let i = 0; i < 10_000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('gauss has roughly zero mean and unit variance', () => {
    const r = new Rng(3);
    const n = 20_000;
    let sum = 0;
    let sq = 0;
    for (let i = 0; i < n; i++) {
      const g = r.gauss();
      sum += g;
      sq += g * g;
    }
    expect(Math.abs(sum / n)).toBeLessThan(0.05);
    expect(Math.abs(sq / n - 1)).toBeLessThan(0.05);
  });
});
