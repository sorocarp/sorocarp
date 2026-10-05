/**
 * Rebalancer: from the body's weights to a short list of orders.
 *
 * It only acts on differences that matter (`minDelta`), never trades the same
 * token twice inside `cooldownMs`, and caps how many orders go out per cycle,
 * largest moves first. A token the organism has abandoned is sold down to
 * zero and tagged `pruned`.
 */
import type { Ledger } from './ledger.js';
import type { Order } from './types.js';

export interface RebalancerOptions {
  /** Ignore weight differences smaller than this, 0..1. */
  minDelta: number;
  /** Do not trade the same token again within this many ms. */
  cooldownMs: number;
  /** At most this many orders per cycle, largest first. */
  maxOrdersPerCycle: number;
  /** Keep at least this fraction of NAV in cash, 0..1. */
  minCash: number;
}

export const DEFAULT_REBALANCER: RebalancerOptions = { minDelta: 0.02, cooldownMs: 60_000, maxOrdersPerCycle: 4, minCash: 0.02 };

export interface Target {
  address: string;
  symbol: string;
  weight: number;
}

export class Rebalancer {
  readonly opts: RebalancerOptions;
  private lastTraded = new Map<string, number>();
  private nextId = 1;

  constructor(opts: Partial<RebalancerOptions> = {}) {
    this.opts = { ...DEFAULT_REBALANCER, ...opts };
  }

  reset(): void {
    this.lastTraded.clear();
  }

  plan(targets: Target[], ledger: Ledger, prices: Map<string, number>, at = Date.now()): Order[] {
    const nav = ledger.nav(prices);
    if (nav <= 0) return [];
    const byAddress = new Map(targets.map((t) => [t.address, t]));
    const candidates: Order[] = [];

    const addresses = new Set<string>([...byAddress.keys(), ...ledger.positions.keys()]);
    for (const address of addresses) {
      const price = prices.get(address);
      if (!price || price <= 0) continue;
      const target = byAddress.get(address);
      const symbol = target?.symbol ?? ledger.positions.get(address)?.symbol ?? address.slice(0, 6);
      const targetWeight = target?.weight ?? 0;
      const currentWeight = ledger.weight(address, prices);
      const delta = targetWeight - currentWeight;
      if (Math.abs(delta) < this.opts.minDelta) continue;
      if ((this.lastTraded.get(address) ?? -Infinity) + this.opts.cooldownMs > at) continue;
      const side = delta > 0 ? 'buy' : 'sell';
      let notional = Math.abs(delta) * nav;
      if (side === 'sell') notional = Math.min(notional, ledger.valueOf(address, prices));
      if (notional <= 0) continue;
      candidates.push({ id: 0, at, address, symbol, side, targetWeight, currentWeight, notionalUsd: notional, reason: targetWeight === 0 ? 'pruned' : delta > 0 ? 'grow' : 'shrink' });
    }

    candidates.sort((a, b) => b.notionalUsd - a.notionalUsd);
    const orders: Order[] = [];
    let cash = ledger.cashUsd;
    const floor = nav * this.opts.minCash;
    for (const c of candidates) {
      if (orders.length >= this.opts.maxOrdersPerCycle) break;
      if (c.side === 'buy') {
        const room = cash - floor;
        if (room <= 1) continue;
        c.notionalUsd = Math.min(c.notionalUsd, room);
        cash -= c.notionalUsd;
      } else {
        cash += c.notionalUsd;
      }
      c.id = this.nextId++;
      this.lastTraded.set(c.address, at);
      orders.push(c);
    }
    return orders;
  }
}
