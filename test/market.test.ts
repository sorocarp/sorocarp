import { describe, expect, it } from 'vitest';
import { DexScreenerMarketSource, pairsToSnapshots, type DexPair } from '../src/market/dexscreener.js';
import { MockMarketSource } from '../src/market/mock.js';

describe('MockMarketSource', () => {
  it('is deterministic for a seed', async () => {
    const a = new MockMarketSource(9);
    const b = new MockMarketSource(9);
    const sa = await a.fetch();
    const sb = await b.fetch();
    expect(sa.map((s) => s.priceUsd)).toEqual(sb.map((s) => s.priceUsd));
  });

  it('produces finite, positive data', async () => {
    const m = new MockMarketSource(1);
    for (let i = 0; i < 50; i++) {
      for (const s of await m.fetch()) {
        expect(s.priceUsd).toBeGreaterThan(0);
        expect(s.liquidityUsd).toBeGreaterThan(0);
        expect(s.volume24hUsd).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(s.priceChange1hPct)).toBe(true);
        expect(Number.isFinite(s.priceChange24hPct)).toBe(true);
      }
    }
  });

  it('reset replays the same path', async () => {
    const m = new MockMarketSource(5);
    const first = (await m.fetch()).map((s) => s.priceUsd);
    await m.fetch();
    m.reset();
    const again = (await m.fetch()).map((s) => s.priceUsd);
    expect(again).toEqual(first);
  });
});

const pair = (over: Partial<DexPair> & { address: string; liq: number }): DexPair => ({
  chainId: 'solana',
  dexId: 'raydium',
  pairAddress: 'pair-' + over.address + over.liq,
  baseToken: { address: over.address, name: 'Token ' + over.address, symbol: over.address.toUpperCase() },
  quoteToken: { address: 'So11111111111111111111111111111111111111112', name: 'Wrapped SOL', symbol: 'SOL' },
  priceUsd: '1.25',
  volume: { h24: 1000 },
  priceChange: { h1: 2.5, h24: -3 },
  liquidity: { usd: over.liq },
  ...over,
});

describe('pairsToSnapshots', () => {
  it('keeps the deepest pair per token and ignores unknown tokens', () => {
    const pairs = [
      pair({ address: 'aaa', liq: 100 }),
      pair({ address: 'aaa', liq: 5000, priceUsd: '1.30' }),
      pair({ address: 'bbb', liq: 10 }),
      pair({ address: 'zzz', liq: 99999 }),
    ];
    const out = pairsToSnapshots(pairs, new Set(['aaa', 'bbb']), 123);
    expect(out).toHaveLength(2);
    const a = out.find((s) => s.address === 'aaa')!;
    expect(a.liquidityUsd).toBe(5000);
    expect(a.priceUsd).toBe(1.3);
    expect(a.priceChange1hPct).toBe(2.5);
    expect(a.updatedAt).toBe(123);
  });

  it('drops pairs with no usable price', () => {
    const out = pairsToSnapshots([pair({ address: 'aaa', liq: 1, priceUsd: undefined })], new Set(['aaa']));
    expect(out).toHaveLength(0);
  });
});

describe('DexScreenerMarketSource', () => {
  it('batches addresses and keeps the last good snapshot on failure', async () => {
    const calls: string[] = [];
    const addresses = Array.from({ length: 35 }, (_, i) => 'addr' + String(i).padStart(40, '0'));
    let fail = false;
    const src = new DexScreenerMarketSource(addresses, 1000, async (url) => {
      calls.push(url);
      if (fail) throw new Error('boom');
      const listed = url.slice(url.lastIndexOf('/') + 1).split(',');
      return listed.map((a) => pair({ address: a, liq: 1000 }));
    });
    const first = await src.fetch();
    expect(calls).toHaveLength(2);
    expect(first).toHaveLength(35);
    fail = true;
    await expect(src.fetch()).rejects.toThrow('boom');
  });
});
