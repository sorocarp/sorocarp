import { DexScreenerMarketSource } from './dexscreener.js';
import { MockMarketSource } from './mock.js';
export * from './types.js';
export * from './scoring.js';
export { MockMarketSource, DEFAULT_UNIVERSE } from './mock.js';
export { DexScreenerMarketSource, pairsToSnapshots } from './dexscreener.js';
/** Build the market source named in config. Add new adapters here. */
export function createMarketSource(cfg) {
    switch (cfg.source) {
        case 'mock':
            return new MockMarketSource(cfg.seed, cfg.refreshMs);
        case 'dexscreener':
            return new DexScreenerMarketSource(cfg.solana.tokens, cfg.solana.refreshMs);
        default: {
            const never = cfg.source;
            throw new Error(`unknown market source ${String(never)}`);
        }
    }
}
