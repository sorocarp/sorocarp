# Market adapters

The organism eats `TokenSnapshot` objects. Anything that can produce a list of them
is a market.

```ts
interface TokenSnapshot {
  address: string;          // stable id; the mint address on Solana
  symbol: string;
  name: string;
  priceUsd: number;
  volume24hUsd: number;
  liquidityUsd: number;
  priceChange1hPct: number; // 4.2 means +4.2 percent
  priceChange24hPct: number;
  marketCapUsd?: number;
  updatedAt: number;        // unix ms
}

interface MarketSource {
  readonly name: string;
  readonly refreshMs: number;   // how often the engine calls fetch()
  fetch(): Promise<TokenSnapshot[]>;
  reset?(): void;               // optional, called on dish reset
}
```

## Built in

### `mock` (default)

`src/market/mock.ts`. Ten synthetic Solana-flavoured tokens following
regime-switching random walks (bull, bear, chop, pump, dump, dead), with volume and
liquidity tied to regime. One `fetch()`
is one minute of market time. Deterministic from `market.seed`.

### `dexscreener`

`src/market/dexscreener.ts`. Live Solana prices, volume, liquidity and price changes
from the public DexScreener API. No API key.

```bash
npm start -- --source dexscreener
# or
PHYSARUM_MARKET_SOURCE=dexscreener npm start
```

Token mints come from `market.solana.tokens` in `config/default.json`, or from
`PHYSARUM_SOLANA_TOKENS` as a comma-separated list. Up to 30 mints per request;
longer lists are batched. If a request fails, the last good snapshot is reused so
the organism is never starved by a flaky endpoint.

Refresh defaults to 15 seconds. Each refresh re-scores the tokens and re-lays the
food. Note that the live market moves far slower than the simulation, so with real
data the organism's shape changes over minutes, not seconds.

## Writing your own

1. Create `src/market/yoursource.ts` exporting a class that implements
   `MarketSource`.
2. Map your API's response to `TokenSnapshot[]`. If a field is missing, use `0`;
   the scorer treats unknown liquidity as thin and unknown momentum as flat.
3. Add a case to `createMarketSource()` in `src/market/index.ts` and extend the
   `source` enum in `src/config.ts`.
4. Write a test that feeds a fixture through your mapper, like `test/market.test.ts`
   does for DexScreener.

Ideas that fit the interface cleanly:

* **Birdeye** or **Jupiter** price APIs for richer Solana data.
* **Raydium / Orca pool stats** so liquidity pools, not tokens, are the food.
* **A trending list** (new pairs, top gainers) so the dish discovers tokens itself.
  `RingLayout` recycles slots, so tokens can come and go between refreshes.
* **An on-chain program** that reads the organism's allocation and rebalances a
  vault. The allocation is already exposed at `/api/allocation`.

## Changing what counts as food

Scoring lives in `src/market/scoring.ts` and is deliberately small:

| Component | Formula | Weight |
|---|---|---|
| momentum | `tanh(priceChange1hPct / 4)` | 0.40 |
| trend | `tanh(priceChange24hPct / 20)` | 0.20 |
| activity | `clamp(volume24h / liquidity / 2, 0, 1)` | 0.25 |
| depth | `clamp((log10(liquidity) - 4) / 3, 0, 1)` | 0.15 |
| fragility | `(0.2 - depth) * 5` when depth < 0.2 | -0.50 |

The total is clamped to `[-1, 1]`. Positive becomes `attract`, negative becomes
`toxicity`. Change the weights, add a component, or swap the whole function. The
organism will not notice; it only tastes the result.
