import type { MarketConfig } from '../config.js';
import { DexScreenerMarketSource } from './dexscreener.js';
import { MockMarketSource } from './mock.js';
import { TrendingMarketSource } from './trending.js';
import type { MarketSource } from './types.js';

export * from './types.js';
export * from './scoring.js';
export { MockMarketSource, DEFAULT_UNIVERSE } from './mock.js';
export { DexScreenerMarketSource, pairsToSnapshots } from './dexscreener.js';
export { TrendingMarketSource, type TrendingOptions } from './trending.js';

/** Build the market source named in config. Add new adapters here. */
export function createMarketSource(cfg: MarketConfig): MarketSource {
  switch (cfg.source) {
    case 'mock':
      return new MockMarketSource(cfg.seed, cfg.refreshMs);
    case 'dexscreener':
      return new DexScreenerMarketSource(cfg.solana.tokens, cfg.solana.refreshMs);
    case 'trending':
      return new TrendingMarketSource(cfg.trending);
    default: {
      const never: never = cfg.source;
      throw new Error(`unknown market source ${String(never)}`);
    }
  }
}
