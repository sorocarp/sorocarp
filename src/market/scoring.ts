/**
 * Scoring: turn a token snapshot into a single number in [-1, 1].
 *
 * Positive = food. Negative = poison. The organism only ever sees this number
 * (split into attract and toxicity), so this file is the entire "strategy".
 * It is deliberately stateless and small so it is easy to argue with.
 *
 *   momentum   short-term price change, saturating
 *   trend      longer-term price change, saturating
 *   activity   24h volume relative to liquidity (turnover): is anyone here?
 *   depth      absolute liquidity on a log scale: can you get out?
 *   fragility  penalty for very thin liquidity (rug risk)
 */
import type { TokenSnapshot } from './types.js';

export interface ScoreBreakdown {
  momentum: number;
  trend: number;
  activity: number;
  depth: number;
  fragility: number;
  total: number;
}

export interface ScoreWeights {
  momentum: number;
  trend: number;
  activity: number;
  depth: number;
  fragility: number;
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  momentum: 0.4,
  trend: 0.2,
  activity: 0.25,
  depth: 0.15,
  fragility: 0.5,
};

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function scoreToken(t: TokenSnapshot, w: ScoreWeights = DEFAULT_WEIGHTS): ScoreBreakdown {
  const momentum = Math.tanh(t.priceChange1hPct / 4);
  const trend = Math.tanh(t.priceChange24hPct / 20);

  const liquidity = Math.max(t.liquidityUsd, 1);
  const turnover = t.volume24hUsd / liquidity;
  const activity = clamp(turnover / 2, 0, 1);

  // $10k liquidity -> 0, $10M liquidity -> 1
  const depth = clamp((Math.log10(liquidity) - 4) / 3, 0, 1);
  const fragility = depth < 0.2 ? (0.2 - depth) * 5 : 0;

  const raw =
    w.momentum * momentum +
    w.trend * trend +
    w.activity * activity +
    w.depth * depth -
    w.fragility * fragility;

  const total = clamp(raw, -1, 1);
  return { momentum, trend, activity, depth, fragility, total };
}

/** Split a score into what the organism tastes. */
export function scoreToFood(total: number): { attract: number; toxicity: number } {
  return {
    attract: total > 0 ? total : 0,
    toxicity: total < 0 ? -total : 0,
  };
}
