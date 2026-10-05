/**
 * TrendingMarketSource: the plate discovers tokens on its own.
 *
 * Each refresh asks DexScreener which Solana tokens are currently most boosted,
 * keeps up to `max` of them, and fetches their pairs. A token that drops out of
 * the list stays on the plate for `stickMs` so the organism has time to
 * abandon it on its own terms instead of having the food yanked away.
 */
import { pairsToSnapshots, type DexPair, type Fetcher } from './dexscreener.js';
import type { MarketSource, TokenSnapshot } from './types.js';

export interface TrendingOptions {
  refreshMs: number;
  /** How many tokens the plate holds at once. */
  max: number;
  /** How long a token that left the trending list stays on the plate. */
  stickMs: number;
}

const BASE = 'https://api.dexscreener.com';
const BOOSTS = `${BASE}/token-boosts/top/v1`;
const TOKENS = `${BASE}/tokens/v1/solana/`;

const defaultFetcher: Fetcher = async (url) => {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`dexscreener ${res.status} ${res.statusText}`);
  return res.json();
};

interface Boost {
  chainId?: string;
  tokenAddress?: string;
}

export class TrendingMarketSource implements MarketSource {
  readonly name = 'trending';
  readonly refreshMs: number;
  readonly opts: TrendingOptions;
  private readonly fetcher: Fetcher;
  /** address -> last time it was seen trending */
  private seen = new Map<string, number>();
  private last: TokenSnapshot[] = [];

  constructor(opts: Partial<TrendingOptions> = {}, fetcher: Fetcher = defaultFetcher) {
    this.opts = { refreshMs: 20_000, max: 14, stickMs: 600_000, ...opts };
    this.refreshMs = this.opts.refreshMs;
    this.fetcher = fetcher;
  }

  reset(): void {
    this.seen.clear();
    this.last = [];
  }

  /** The addresses currently on the plate, trending first. Exposed for tests. */
  async roster(now = Date.now()): Promise<string[]> {
    let trending: string[] = [];
    try {
      const boosts = (await this.fetcher(BOOSTS)) as Boost[];
      trending = (Array.isArray(boosts) ? boosts : []).filter((b) => b.chainId === 'solana' && b.tokenAddress).map((b) => b.tokenAddress as string);
    } catch {
      /* keep what we have */
    }
    for (const a of [...new Set(trending)].slice(0, this.opts.max)) this.seen.set(a, now);
    for (const [a, t] of this.seen) if (now - t > this.opts.stickMs) this.seen.delete(a);
    return [...this.seen.entries()].sort((x, y) => y[1] - x[1]).slice(0, this.opts.max).map(([a]) => a);
  }

  async fetch(): Promise<TokenSnapshot[]> {
    const addresses = await this.roster();
    if (addresses.length === 0) return this.last;
    const pairs: DexPair[] = [];
    for (let i = 0; i < addresses.length; i += 30) {
      const body = await this.fetcher(TOKENS + addresses.slice(i, i + 30).join(','));
      if (Array.isArray(body)) pairs.push(...(body as DexPair[]));
    }
    const snaps = pairsToSnapshots(pairs, new Set(addresses));
    if (snaps.length > 0) this.last = snaps;
    return this.last;
  }
}
