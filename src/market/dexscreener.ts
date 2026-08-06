/**
 * DexScreenerMarketSource: real Solana token data, no API key required.
 *
 * Uses the public DexScreener token endpoint and collapses the pairs it returns
 * into one TokenSnapshot per mint (the deepest pool wins). Swap this file for a
 * Birdeye / Jupiter / Helius adapter and nothing else changes.
 *
 * Endpoint: GET https://api.dexscreener.com/tokens/v1/solana/{addr1,addr2,...}
 * Rate limit (public): about 300 requests per minute, max 30 addresses per call.
 */
import type { MarketSource, TokenSnapshot } from './types.js';

export interface DexPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd?: string;
  volume?: { h24?: number; h6?: number; h1?: number; m5?: number };
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number };
  liquidity?: { usd?: number; base?: number; quote?: number };
  fdv?: number;
  marketCap?: number;
}

export type Fetcher = (url: string) => Promise<unknown>;

const defaultFetcher: Fetcher = async (url) => {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`dexscreener ${res.status} ${res.statusText}`);
  return res.json();
};

const BASE = 'https://api.dexscreener.com/tokens/v1/solana/';
const BATCH = 30;

export function pairsToSnapshots(pairs: DexPair[], wanted: Set<string>, now = Date.now()): TokenSnapshot[] {
  const best = new Map<string, DexPair>();
  for (const p of pairs) {
    if (p.chainId !== 'solana') continue;
    const addr = p.baseToken?.address;
    if (!addr || !wanted.has(addr)) continue;
    const prev = best.get(addr);
    if (!prev || (p.liquidity?.usd ?? 0) > (prev.liquidity?.usd ?? 0)) best.set(addr, p);
  }
  const out: TokenSnapshot[] = [];
  for (const p of best.values()) {
    const price = Number(p.priceUsd);
    if (!Number.isFinite(price) || price <= 0) continue;
    out.push({
      address: p.baseToken.address,
      symbol: p.baseToken.symbol,
      name: p.baseToken.name,
      priceUsd: price,
      volume24hUsd: p.volume?.h24 ?? 0,
      liquidityUsd: p.liquidity?.usd ?? 0,
      priceChange1hPct: p.priceChange?.h1 ?? 0,
      priceChange24hPct: p.priceChange?.h24 ?? 0,
      marketCapUsd: p.marketCap ?? p.fdv,
      updatedAt: now,
    });
  }
  return out;
}

export class DexScreenerMarketSource implements MarketSource {
  readonly name = 'dexscreener';
  readonly refreshMs: number;
  private readonly addresses: string[];
  private readonly fetcher: Fetcher;
  private last: TokenSnapshot[] = [];

  constructor(addresses: string[], refreshMs = 15_000, fetcher: Fetcher = defaultFetcher) {
    if (addresses.length === 0) throw new Error('dexscreener source needs at least one token address');
    this.addresses = [...new Set(addresses)];
    this.refreshMs = refreshMs;
    this.fetcher = fetcher;
  }

  async fetch(): Promise<TokenSnapshot[]> {
    const wanted = new Set(this.addresses);
    const pairs: DexPair[] = [];
    for (let i = 0; i < this.addresses.length; i += BATCH) {
      const chunk = this.addresses.slice(i, i + BATCH);
      const body = await this.fetcher(BASE + chunk.join(','));
      if (Array.isArray(body)) pairs.push(...(body as DexPair[]));
    }
    const snaps = pairsToSnapshots(pairs, wanted);
    // If the API hiccups, keep feeding the organism the last good data rather than starving it.
    if (snaps.length > 0) this.last = snaps;
    return this.last;
  }
}
