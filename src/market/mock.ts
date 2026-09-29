/**
 * MockMarketSource: a small synthetic Solana-flavoured market.
 *
 * Each token follows a regime-switching random walk. Regimes change volume,
 * drift and volatility, and once in a while a token gets rugged (liquidity
 * collapses). One fetch() = one minute of market time. Fully deterministic
 * from the seed.
 */
import { Rng } from '../core/rng.js';
import type { MarketSource, TokenSnapshot } from './types.js';

type Regime = 'bull' | 'bear' | 'chop' | 'pump' | 'dump' | 'dead';

interface RegimeParams {
  drift: number;
  vol: number;
  volumeMult: number;
}

const REGIMES: Record<Regime, RegimeParams> = {
  bull: { drift: 0.0005, vol: 0.0025, volumeMult: 1.8 },
  bear: { drift: -0.0005, vol: 0.0025, volumeMult: 1.5 },
  chop: { drift: 0, vol: 0.0015, volumeMult: 1.0 },
  pump: { drift: 0.0025, vol: 0.006, volumeMult: 4.0 },
  dump: { drift: -0.003, vol: 0.007, volumeMult: 3.5 },
  dead: { drift: -0.0001, vol: 0.001, volumeMult: 0.25 },
};

/** Where a regime tends to go next. Pumps usually dump; dumps usually chop. */
const TRANSITIONS: Record<Regime, Regime[]> = {
  bull: ['bull', 'chop', 'chop', 'pump', 'bear'],
  bear: ['bear', 'chop', 'chop', 'dump', 'bull'],
  chop: ['chop', 'chop', 'bull', 'bear', 'pump', 'dead'],
  pump: ['dump', 'dump', 'bull', 'chop'],
  dump: ['chop', 'chop', 'bear', 'dead'],
  dead: ['dead', 'dead', 'chop', 'pump'],
};

export interface MockTokenSeed {
  address: string;
  symbol: string;
  name: string;
  price: number;
  liquidityUsd: number;
  /** Baseline daily turnover as a fraction of liquidity. */
  turnover: number;
}

export const DEFAULT_UNIVERSE: MockTokenSeed[] = [
  { address: 'mock:SOL', symbol: 'SOL', name: 'Solana', price: 150, liquidityUsd: 80_000_000, turnover: 0.6 },
  { address: 'mock:JUP', symbol: 'JUP', name: 'Jupiter', price: 0.9, liquidityUsd: 12_000_000, turnover: 0.8 },
  { address: 'mock:BONK', symbol: 'BONK', name: 'Bonk', price: 0.000021, liquidityUsd: 9_000_000, turnover: 1.4 },
  { address: 'mock:WIF', symbol: 'WIF', name: 'dogwifhat', price: 1.8, liquidityUsd: 7_000_000, turnover: 1.6 },
  { address: 'mock:RAY', symbol: 'RAY', name: 'Raydium', price: 2.4, liquidityUsd: 6_000_000, turnover: 0.5 },
  { address: 'mock:PYTH', symbol: 'PYTH', name: 'Pyth Network', price: 0.32, liquidityUsd: 4_000_000, turnover: 0.4 },
  { address: 'mock:JTO', symbol: 'JTO', name: 'Jito', price: 2.1, liquidityUsd: 3_500_000, turnover: 0.5 },
  { address: 'mock:ORCA', symbol: 'ORCA', name: 'Orca', price: 3.3, liquidityUsd: 2_000_000, turnover: 0.3 },
  { address: 'mock:POPCAT', symbol: 'POPCAT', name: 'Popcat', price: 0.6, liquidityUsd: 1_500_000, turnover: 2.2 },
  { address: 'mock:GOAT', symbol: 'GOAT', name: 'Goatseus Maximus', price: 0.4, liquidityUsd: 900_000, turnover: 2.8 },
];

interface TokenState {
  seed: MockTokenSeed;
  price: number;
  liquidityUsd: number;
  regime: Regime;
  /** Price history, one entry per minute, newest last. */
  history: number[];
}

const HOUR = 60;
const DAY = 24 * HOUR;

export class MockMarketSource implements MarketSource {
  readonly name = 'mock';
  readonly refreshMs: number;
  private rng: Rng;
  private readonly seed: number;
  private readonly universe: MockTokenSeed[];
  private tokens: TokenState[] = [];
  private minute = 0;

  constructor(seed: number, refreshMs = 1000, universe: MockTokenSeed[] = DEFAULT_UNIVERSE) {
    this.seed = seed;
    this.refreshMs = refreshMs;
    this.universe = universe;
    this.rng = new Rng(seed);
    this.reset();
  }

  reset(): void {
    this.rng = new Rng(this.seed);
    this.minute = 0;
    this.tokens = this.universe.map((seed) => ({
      seed,
      price: seed.price,
      liquidityUsd: seed.liquidityUsd,
      regime: this.rng.pick<Regime>(['chop', 'chop', 'bull', 'bear']),
      history: [seed.price],
    }));
    // Pre-roll a day so 24h changes mean something from the first frame.
    for (let i = 0; i < DAY; i++) this.advance();
  }

  async fetch(): Promise<TokenSnapshot[]> {
    this.advance();
    const now = Date.now();
    return this.tokens.map((t) => this.snapshot(t, now));
  }

  private advance(): void {
    this.minute++;
    for (const t of this.tokens) {
      // Regime switch roughly every 100 minutes.
      if (this.rng.next() < 0.01) t.regime = this.rng.pick(TRANSITIONS[t.regime]);
      const r = REGIMES[t.regime];
      t.price *= Math.exp(r.drift + r.vol * this.rng.gauss());
      // Liquidity drifts gently, bleeds during dumps, and very rarely gets rugged.
      let liqDrift = 0.0002 * this.rng.gauss();
      if (t.regime === 'dump') liqDrift -= 0.004;
      if (t.regime === 'bull' || t.regime === 'pump') liqDrift += 0.001;
      t.liquidityUsd *= Math.exp(liqDrift);
      if (t.seed.liquidityUsd < 200_000 && this.rng.next() < 0.0005) {
        t.liquidityUsd *= 0.05;
        t.price *= 0.1;
        t.regime = 'dead';
      }
      // Dead tokens slowly recover liquidity so the dish is not permanently poisoned.
      if (t.regime === 'dead' && t.liquidityUsd < t.seed.liquidityUsd * 0.5) t.liquidityUsd *= 1.001;
      t.history.push(t.price);
      if (t.history.length > DAY + 1) t.history.shift();
    }
  }

  private snapshot(t: TokenState, now: number): TokenSnapshot {
    const h = t.history;
    const last = h[h.length - 1];
    const ago = (n: number) => h[Math.max(0, h.length - 1 - n)];
    const r = REGIMES[t.regime];
    const noise = Math.exp(0.15 * this.rng.gauss());
    const volume24h = t.liquidityUsd * t.seed.turnover * r.volumeMult * noise;
    return {
      address: t.seed.address,
      symbol: t.seed.symbol,
      name: t.seed.name,
      priceUsd: last,
      volume24hUsd: volume24h,
      liquidityUsd: t.liquidityUsd,
      priceChange1hPct: (last / ago(HOUR) - 1) * 100,
      priceChange24hPct: (last / ago(DAY) - 1) * 100,
      updatedAt: now,
    };
  }

  /** For tests and the headless CLI: peek at regimes without advancing. */
  regimes(): Record<string, Regime> {
    return Object.fromEntries(this.tokens.map((t) => [t.seed.symbol, t.regime]));
  }
}
