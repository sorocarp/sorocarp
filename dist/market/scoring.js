export const DEFAULT_WEIGHTS = {
    momentum: 0.4,
    trend: 0.2,
    activity: 0.25,
    depth: 0.15,
    fragility: 0.5,
};
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export function scoreToken(t, w = DEFAULT_WEIGHTS) {
    const momentum = Math.tanh(t.priceChange1hPct / 4);
    const trend = Math.tanh(t.priceChange24hPct / 20);
    const liquidity = Math.max(t.liquidityUsd, 1);
    const turnover = t.volume24hUsd / liquidity;
    const activity = clamp(turnover / 2, 0, 1);
    // $10k liquidity -> 0, $10M liquidity -> 1
    const depth = clamp((Math.log10(liquidity) - 4) / 3, 0, 1);
    const fragility = depth < 0.2 ? (0.2 - depth) * 5 : 0;
    const raw = w.momentum * momentum +
        w.trend * trend +
        w.activity * activity +
        w.depth * depth -
        w.fragility * fragility;
    const total = clamp(raw, -1, 1);
    return { momentum, trend, activity, depth, fragility, total };
}
/** Split a score into what the organism tastes. */
export function scoreToFood(total) {
    return {
        attract: total > 0 ? total : 0,
        toxicity: total < 0 ? -total : 0,
    };
}
