/**
 * PaperExecutor: fills every order instantly at the last price, minus a
 * configurable slippage, so the book moves without anything being sent.
 */
import type { Executor, Fill, Order } from './types.js';

export class PaperExecutor implements Executor {
  readonly name = 'paper';
  readonly slippageBps: number;

  constructor(slippageBps = 10) {
    this.slippageBps = slippageBps;
  }

  async execute(orders: Order[], prices: Map<string, number>, at: number): Promise<Fill[]> {
    const fills: Fill[] = [];
    for (const o of orders) {
      const mid = prices.get(o.address);
      if (!mid || mid <= 0) continue;
      const slip = this.slippageBps / 10_000;
      const priceUsd = o.side === 'buy' ? mid * (1 + slip) : mid * (1 - slip);
      fills.push({ orderId: o.id, at, address: o.address, symbol: o.symbol, side: o.side, priceUsd, quantity: o.notionalUsd / priceUsd, notionalUsd: o.notionalUsd });
    }
    return fills;
  }
}
