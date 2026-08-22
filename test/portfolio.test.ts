import { describe, expect, it } from 'vitest';
import { Portfolio } from '../src/engine/portfolio.js';

describe('Portfolio', () => {
  it('tracks weighted returns against an equal-weight benchmark', () => {
    const p = new Portfolio(1000);
    const prices = new Map([
      ['a', 10],
      ['b', 10],
    ]);
    // First mark only records prices and weights.
    p.markToMarket(prices, new Map([['a', 1]]), 1);
    expect(p.value).toBe(1000);

    // a doubles, b halves. Organism is fully in a; benchmark is 50/50.
    p.markToMarket(
      new Map([
        ['a', 20],
        ['b', 5],
      ]),
      new Map([['a', 0.5]]),
      2,
    );
    expect(p.value).toBeCloseTo(2000);
    expect(p.benchmark).toBeCloseTo(1000 * (1 + (1 - 0.5) / 2));
    expect(p.history).toHaveLength(2);
  });

  it('cash earns nothing', () => {
    const p = new Portfolio(500);
    p.markToMarket(new Map([['a', 1]]), new Map(), 1);
    p.markToMarket(new Map([['a', 3]]), new Map(), 2);
    expect(p.value).toBe(500);
    expect(p.returnPct).toBe(0);
  });

  it('reset restores starting capital', () => {
    const p = new Portfolio(100);
    p.markToMarket(new Map([['a', 1]]), new Map([['a', 1]]), 1);
    p.markToMarket(new Map([['a', 2]]), new Map([['a', 1]]), 2);
    p.reset();
    expect(p.value).toBe(100);
    expect(p.history).toHaveLength(0);
  });
});
