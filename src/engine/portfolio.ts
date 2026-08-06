/**
 * Portfolio: what would have happened if the organism's body were money.
 *
 * The share of protoplasm sitting on each token is treated as a portfolio
 * weight; the rest is cash. Every market refresh we mark the previous weights
 * to the new prices. An equal-weight buy-and-hold across the same tokens is
 * tracked alongside as a benchmark. Paper only. No orders are ever sent.
 */
export interface PortfolioPoint {
  t: number;
  value: number;
  benchmark: number;
}

export interface MarkResult {
  organismReturn: number;
  benchmarkReturn: number;
}

export class Portfolio {
  readonly startingCapital: number;
  value: number;
  benchmark: number;
  history: PortfolioPoint[] = [];
  readonly maxHistory: number;
  private prevPrices = new Map<string, number>();
  private weights = new Map<string, number>();

  constructor(startingCapital: number, maxHistory = 1200) {
    this.startingCapital = startingCapital;
    this.maxHistory = maxHistory;
    this.value = startingCapital;
    this.benchmark = startingCapital;
  }

  reset(): void {
    this.value = this.startingCapital;
    this.benchmark = this.startingCapital;
    this.history = [];
    this.prevPrices.clear();
    this.weights.clear();
  }

  /**
   * Apply the price move since the last mark using the weights set at that mark,
   * then store the new weights for the next one.
   */
  markToMarket(prices: Map<string, number>, weights: Map<string, number>, t = Date.now()): MarkResult {
    let organismReturn = 0;
    let benchmarkReturn = 0;
    let n = 0;
    for (const [id, price] of prices) {
      const prev = this.prevPrices.get(id);
      if (prev === undefined || prev <= 0 || !Number.isFinite(price)) continue;
      const r = price / prev - 1;
      organismReturn += (this.weights.get(id) ?? 0) * r;
      benchmarkReturn += r;
      n++;
    }
    if (n > 0) benchmarkReturn /= n;

    this.value *= 1 + organismReturn;
    this.benchmark *= 1 + benchmarkReturn;

    this.prevPrices = new Map(prices);
    this.weights = new Map(weights);

    this.history.push({ t, value: this.value, benchmark: this.benchmark });
    if (this.history.length > this.maxHistory) this.history.shift();

    return { organismReturn, benchmarkReturn };
  }

  get returnPct(): number {
    return (this.value / this.startingCapital - 1) * 100;
  }

  get benchmarkReturnPct(): number {
    return (this.benchmark / this.startingCapital - 1) * 100;
  }
}
