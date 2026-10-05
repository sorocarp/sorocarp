import { describe, expect, it } from 'vitest';
import { Ledger, PaperExecutor, Rebalancer } from '../src/execution/index.js';

const prices = new Map([
  ['a', 10],
  ['b', 2],
  ['c', 0.5],
]);

describe('Rebalancer', () => {
  it('buys what the body grew onto and ignores small differences', () => {
    const ledger = new Ledger(10_000);
    const rb = new Rebalancer({ minDelta: 0.02, cooldownMs: 0, maxOrdersPerCycle: 4, minCash: 0 });
    const orders = rb.plan([{ address: 'a', symbol: 'A', weight: 0.3 }, { address: 'b', symbol: 'B', weight: 0.01 }], ledger, prices, 1000);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ symbol: 'A', side: 'buy', reason: 'grow' });
    expect(orders[0].notionalUsd).toBeCloseTo(3000);
  });

  it('sells down a pruned token and respects the cooldown', async () => {
    const ledger = new Ledger(10_000);
    const rb = new Rebalancer({ minDelta: 0.02, cooldownMs: 60_000, maxOrdersPerCycle: 4, minCash: 0 });
    const exec = new PaperExecutor(0);
    const first = rb.plan([{ address: 'a', symbol: 'A', weight: 0.4 }], ledger, prices, 1000);
    for (const f of await exec.execute(first, prices, 1000)) ledger.apply(f);
    expect(ledger.weight('a', prices)).toBeCloseTo(0.4);

    // too soon: nothing happens even though the target changed
    expect(rb.plan([], ledger, prices, 2000)).toHaveLength(0);

    const later = rb.plan([], ledger, prices, 70_000);
    expect(later).toHaveLength(1);
    expect(later[0]).toMatchObject({ symbol: 'A', side: 'sell', reason: 'pruned' });
    for (const f of await exec.execute(later, prices, 70_000)) ledger.apply(f);
    expect(ledger.positions.has('a')).toBe(false);
    expect(ledger.cashUsd).toBeCloseTo(10_000);
  });

  it('caps orders per cycle, largest first, and keeps the cash floor', () => {
    const ledger = new Ledger(1000);
    const rb = new Rebalancer({ minDelta: 0.01, cooldownMs: 0, maxOrdersPerCycle: 2, minCash: 0.5 });
    const orders = rb.plan(
      [
        { address: 'a', symbol: 'A', weight: 0.1 },
        { address: 'b', symbol: 'B', weight: 0.3 },
        { address: 'c', symbol: 'C', weight: 0.2 },
      ],
      ledger,
      prices,
      1,
    );
    expect(orders.map((o) => o.symbol)).toEqual(['B', 'C']);
    expect(orders.reduce((s, o) => s + o.notionalUsd, 0)).toBeLessThanOrEqual(500 + 1e-6);
  });
});

describe('Ledger', () => {
  it('marks to market and tracks average entry', async () => {
    const ledger = new Ledger(1000);
    const exec = new PaperExecutor(0);
    const fills = await exec.execute([{ id: 1, at: 1, address: 'a', symbol: 'A', side: 'buy', targetWeight: 0.5, currentWeight: 0, notionalUsd: 500, reason: 'grow' }], prices, 1);
    for (const f of fills) ledger.apply(f);
    expect(ledger.nav(prices)).toBeCloseTo(1000);
    const up = new Map(prices);
    up.set('a', 20);
    const v = ledger.view(up);
    expect(v.navUsd).toBeCloseTo(1500);
    expect(v.returnPct).toBeCloseTo(50);
    expect(v.positions[0]).toMatchObject({ symbol: 'A', avgPriceUsd: 10, pnlUsd: 500 });
  });

  it('applies slippage on paper fills', async () => {
    const exec = new PaperExecutor(100); // 1 percent
    const [buy] = await exec.execute([{ id: 1, at: 1, address: 'a', symbol: 'A', side: 'buy', targetWeight: 0, currentWeight: 0, notionalUsd: 100, reason: 'grow' }], prices, 1);
    expect(buy.priceUsd).toBeCloseTo(10.1);
    expect(buy.quantity * buy.priceUsd).toBeCloseTo(100);
  });
});
