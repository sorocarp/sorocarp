import { describe, expect, it } from 'vitest';
import { scoreToFood, scoreToken } from '../src/market/scoring.js';
import type { TokenSnapshot } from '../src/market/types.js';

const base: TokenSnapshot = {
  address: 'x',
  symbol: 'X',
  name: 'X',
  priceUsd: 1,
  volume24hUsd: 5_000_000,
  liquidityUsd: 5_000_000,
  priceChange1hPct: 0,
  priceChange24hPct: 0,
  updatedAt: 0,
};

describe('scoreToken', () => {
  it('is bounded in [-1, 1]', () => {
    for (const pct of [-500, -50, -5, 0, 5, 50, 500]) {
      const s = scoreToken({ ...base, priceChange1hPct: pct, priceChange24hPct: pct });
      expect(s.total).toBeGreaterThanOrEqual(-1);
      expect(s.total).toBeLessThanOrEqual(1);
    }
  });

  it('prefers momentum', () => {
    const up = scoreToken({ ...base, priceChange1hPct: 8, priceChange24hPct: 20 });
    const flat = scoreToken(base);
    const down = scoreToken({ ...base, priceChange1hPct: -8, priceChange24hPct: -20 });
    expect(up.total).toBeGreaterThan(flat.total);
    expect(flat.total).toBeGreaterThan(down.total);
    expect(down.total).toBeLessThan(0);
  });

  it('punishes thin liquidity', () => {
    const deep = scoreToken({ ...base, liquidityUsd: 20_000_000, volume24hUsd: 20_000_000 });
    const thin = scoreToken({ ...base, liquidityUsd: 20_000, volume24hUsd: 20_000 });
    expect(thin.fragility).toBeGreaterThan(0);
    expect(deep.fragility).toBe(0);
    expect(thin.total).toBeLessThan(deep.total);
  });

  it('rewards turnover', () => {
    const busy = scoreToken({ ...base, volume24hUsd: 15_000_000 });
    const quiet = scoreToken({ ...base, volume24hUsd: 100_000 });
    expect(busy.activity).toBeGreaterThan(quiet.activity);
  });
});

describe('scoreToFood', () => {
  it('splits sign into attract and toxicity', () => {
    expect(scoreToFood(0.6)).toEqual({ attract: 0.6, toxicity: 0 });
    expect(scoreToFood(-0.3)).toEqual({ attract: 0, toxicity: 0.3 });
    expect(scoreToFood(0)).toEqual({ attract: 0, toxicity: 0 });
  });
});
