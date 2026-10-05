/**
 * Ledger: cash and positions, marked to market.
 */
import type { Fill } from './types.js';

export interface Position {
  address: string;
  symbol: string;
  quantity: number;
  /** Average entry price in USD. */
  avgPriceUsd: number;
}

export interface LedgerView {
  cashUsd: number;
  navUsd: number;
  startingCapitalUsd: number;
  returnPct: number;
  positions: { address: string; symbol: string; quantity: number; priceUsd: number; valueUsd: number; weight: number; avgPriceUsd: number; pnlUsd: number }[];
  fills: number;
}

export class Ledger {
  readonly startingCapitalUsd: number;
  cashUsd: number;
  readonly positions = new Map<string, Position>();
  readonly fills: Fill[] = [];
  readonly maxFills: number;

  constructor(startingCapitalUsd: number, maxFills = 500) {
    this.startingCapitalUsd = startingCapitalUsd;
    this.cashUsd = startingCapitalUsd;
    this.maxFills = maxFills;
  }

  reset(): void {
    this.cashUsd = this.startingCapitalUsd;
    this.positions.clear();
    this.fills.length = 0;
  }

  apply(fill: Fill): void {
    const p = this.positions.get(fill.address) ?? { address: fill.address, symbol: fill.symbol, quantity: 0, avgPriceUsd: 0 };
    if (fill.side === 'buy') {
      const cost = p.quantity * p.avgPriceUsd + fill.notionalUsd;
      p.quantity += fill.quantity;
      p.avgPriceUsd = p.quantity > 0 ? cost / p.quantity : 0;
      this.cashUsd -= fill.notionalUsd;
    } else {
      p.quantity = Math.max(0, p.quantity - fill.quantity);
      this.cashUsd += fill.notionalUsd;
    }
    if (p.quantity <= 1e-12) this.positions.delete(fill.address);
    else this.positions.set(fill.address, p);
    this.fills.push(fill);
    if (this.fills.length > this.maxFills) this.fills.shift();
  }

  valueOf(address: string, prices: Map<string, number>): number {
    const p = this.positions.get(address);
    if (!p) return 0;
    return p.quantity * (prices.get(address) ?? p.avgPriceUsd);
  }

  nav(prices: Map<string, number>): number {
    let v = this.cashUsd;
    for (const a of this.positions.keys()) v += this.valueOf(a, prices);
    return v;
  }

  weight(address: string, prices: Map<string, number>): number {
    const nav = this.nav(prices);
    return nav > 0 ? this.valueOf(address, prices) / nav : 0;
  }

  view(prices: Map<string, number>): LedgerView {
    const nav = this.nav(prices);
    const positions = [...this.positions.values()]
      .map((p) => {
        const priceUsd = prices.get(p.address) ?? p.avgPriceUsd;
        const valueUsd = p.quantity * priceUsd;
        return { address: p.address, symbol: p.symbol, quantity: p.quantity, priceUsd, valueUsd, weight: nav > 0 ? valueUsd / nav : 0, avgPriceUsd: p.avgPriceUsd, pnlUsd: (priceUsd - p.avgPriceUsd) * p.quantity };
      })
      .sort((a, b) => b.valueUsd - a.valueUsd);
    return { cashUsd: this.cashUsd, navUsd: nav, startingCapitalUsd: this.startingCapitalUsd, returnPct: (nav / this.startingCapitalUsd - 1) * 100, positions, fills: this.fills.length };
  }
}
