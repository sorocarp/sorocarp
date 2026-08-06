/**
 * The contract between the market and the organism.
 *
 * Anything that can produce a list of TokenSnapshot objects can feed the slime.
 * The mock source, the DexScreener source and any future on-chain source all
 * implement MarketSource and nothing downstream knows the difference.
 */
export interface TokenSnapshot {
  /** Stable id. For Solana this is the mint address. */
  address: string;
  symbol: string;
  name: string;
  priceUsd: number;
  volume24hUsd: number;
  liquidityUsd: number;
  /** Percent, e.g. 4.2 means +4.2 percent over the last hour. */
  priceChange1hPct: number;
  priceChange24hPct: number;
  marketCapUsd?: number;
  /** Unix ms. */
  updatedAt: number;
}

export interface MarketSource {
  readonly name: string;
  /** How often the engine should call fetch(), in ms. */
  readonly refreshMs: number;
  fetch(): Promise<TokenSnapshot[]>;
  /** Optional: put the source back to its initial state (used by reset). */
  reset?(): void;
}
