import { describe, expect, it } from 'vitest';
import { TrendingMarketSource } from '../src/market/trending.js';

const pair = (address: string, liq: number) => ({
  chainId: 'solana',
  dexId: 'raydium',
  pairAddress: 'p' + address,
  baseToken: { address, name: address, symbol: address.slice(0, 4).toUpperCase() },
  quoteToken: { address: 'So11111111111111111111111111111111111111112', name: 'SOL', symbol: 'SOL' },
  priceUsd: '1.5',
  volume: { h24: 100 },
  priceChange: { h1: 1, h24: 2 },
  liquidity: { usd: liq },
});

function source(lists: string[][]) {
  let call = 0;
  const urls: string[] = [];
  const src = new TrendingMarketSource({ refreshMs: 1000, max: 3, stickMs: 50_000 }, async (url) => {
    urls.push(url);
    if (url.includes('token-boosts')) {
      const list = lists[Math.min(call++, lists.length - 1)];
      return list.map((a) => ({ chainId: 'solana', tokenAddress: a }));
    }
    const addrs = url.slice(url.lastIndexOf('/') + 1).split(',');
    return addrs.map((a) => pair(a, 1000));
  });
  return { src, urls };
}

describe('TrendingMarketSource', () => {
  it('keeps the plate at max tokens, trending first', async () => {
    const { src } = source([['aaaa1', 'bbbb2', 'cccc3', 'dddd4']]);
    const snaps = await src.fetch();
    expect(snaps.map((s) => s.address)).toEqual(['aaaa1', 'bbbb2', 'cccc3']);
    expect(snaps[0].priceUsd).toBe(1.5);
  });

  it('lets a token that stopped trending linger, then drops it', async () => {
    const { src } = source([['aaaa1', 'bbbb2'], ['cccc3'], ['cccc3']]);
    expect(await src.roster(0)).toEqual(['aaaa1', 'bbbb2']);
    // c arrives; a and b are still within stickMs so they stay, newest first
    expect(await src.roster(10_000)).toEqual(['cccc3', 'aaaa1', 'bbbb2']);
    // after stickMs the old ones are gone
    expect(await src.roster(70_000)).toEqual(['cccc3']);
  });

  it('ignores other chains and survives a failed boosts call', async () => {
    let fail = true;
    const src = new TrendingMarketSource({ max: 5 }, async (url) => {
      if (url.includes('token-boosts')) {
        if (fail) throw new Error('down');
        return [{ chainId: 'ethereum', tokenAddress: '0xno' }, { chainId: 'solana', tokenAddress: 'okok1' }];
      }
      return [pair('okok1', 10)];
    });
    expect(await src.fetch()).toEqual([]);
    fail = false;
    expect((await src.fetch()).map((s) => s.address)).toEqual(['okok1']);
  });
});
