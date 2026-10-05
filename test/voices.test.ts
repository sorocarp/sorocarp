import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.js';
import { Backrooms, COLONIES, banner } from '../src/engine/backrooms.js';
import { OrganismVoice } from '../src/engine/voice.js';
import type { OrganismState, TokenView } from '../src/engine/organism.js';
import { Narrator } from '../src/engine/narrator.js';

function token(symbol: string, share: number, toxicity = 0): TokenView {
  return {
    address: 'mock:' + symbol,
    symbol,
    name: symbol,
    priceUsd: 1,
    priceChange1hPct: 0,
    priceChange24hPct: 0,
    liquidityUsd: 1e6,
    volume24hUsd: 1e6,
    score: { momentum: 0, trend: 0, activity: 0, depth: 0, fragility: 0, total: toxicity > 0 ? -toxicity : 0.5 },
    attract: toxicity > 0 ? 0 : 0.5,
    toxicity,
    share,
    occupancy: 0,
    x: 0,
    y: 0,
    radius: 9,
  };
}

function state(tokens: TokenView[], alive = 3000): OrganismState {
  const held = tokens.reduce((s, t) => s + t.share, 0);
  return {
    step: 0, alive, maxAgents: 20000, totalEnergy: 0, birthsPerSec: 0, deathsPerSec: 0, marketSource: 'mock', marketUpdatedAt: 0, marketRefreshes: 1,
    sim: { width: 256, height: 256 }, nucleus: { x: 128, y: 128, radius: 14, share: 0 }, tokens, cashShare: 1 - held,
    notes: [], narration: null, chat: [], orders: [], fills: [], ledger: { cashUsd: 0, navUsd: 0, startingCapitalUsd: 0, returnPct: 0, positions: [], fills: 0 },
    portfolio: { startingCapital: 1, value: 1, benchmark: 1, returnPct: 0, benchmarkReturnPct: 0, history: [] },
  };
}

describe('OrganismVoice', () => {
  it('announces inoculation, first contact, and poison, in priority order', () => {
    const v = new OrganismVoice(() => 0);
    expect(v.observe(state([token('JTO', 0)]), 0)?.code).toBe('inoculated');
    expect(v.observe(state([token('JTO', 0.2)]), 5000)?.code).toBe('contact:JTO');
    // both a prune and a poison happen; poison wins
    const n = v.observe(state([token('JTO', 0.001), token('WIF', 0.05, 0.6)]), 10_000);
    expect(n?.code).toBe('toxic:WIF');
    expect(v.recentCodes()).toEqual(['inoculated', 'contact:JTO', 'toxic:WIF']);
  });

  it('stays quiet between notes and never repeats itself back to back', () => {
    const v = new OrganismVoice(() => 0);
    v.observe(state([token('JTO', 0)]), 0);
    expect(v.observe(state([token('JTO', 0.3)]), 500)).toBeNull(); // too soon
    expect(v.observe(state([token('JTO', 0.3)]), 5000)?.code).toBe('contact:JTO');
    expect(v.observe(state([token('JTO', 0.3)]), 9000)).toBeNull(); // nothing new
  });
});

describe('Backrooms', () => {
  it('is deterministic, never lets a colony speak twice in a row, and fills slots from the state', () => {
    const d = { alive: 4200, reserve: 0.3, holdings: [{ s: 'JTO', share: 0.24 }, { s: 'WIF', share: 0.18 }], toxic: ['BONK'] };
    const a = new Backrooms(() => new Rng(3).next());
    const r = new Rng(3);
    const b = new Backrooms(() => r.next());
    const r2 = new Rng(3);
    const c = new Backrooms(() => r2.next());
    void a;
    const lb = Array.from({ length: 40 }, (_, i) => b.next(d, i * 20_000));
    const lc = Array.from({ length: 40 }, (_, i) => c.next(d, i * 20_000));
    expect(lb.map((m) => m.text)).toEqual(lc.map((m) => m.text));
    for (let i = 1; i < lb.length; i++) expect(lb[i].who).not.toBe(lb[i - 1].who);
    for (const m of lb) {
      expect(COLONIES.some((col) => col.id === m.who)).toBe(true);
      expect(m.text).not.toMatch(/\{\w+\}/);
    }
    expect(lb.some((m) => m.art)).toBe(true);
    expect(lb.some((m) => /JTO|WIF|BONK|4,200|30%/.test(m.text + (m.art ?? '')))).toBe(true);
  });

  it('draws block letters', () => {
    const rows = banner('SI', '#', '.').split('\n');
    expect(rows).toHaveLength(5);
    expect(rows[0]).toBe('### ###');
  });
});

describe('Narrator', () => {
  it('describes the state without the model', () => {
    const text = Narrator.describe(state([token('JTO', 0.24), token('BONK', 0, 0.5)], 4200), ['contact:JTO']);
    expect(text).toContain('4200 particles');
    expect(text).toContain('JTO: 24.0% of the body');
    expect(text).toContain('toxic tokens: BONK');
    expect(text).toContain('contact:JTO');
  });

  it('is only available with a key in the environment', () => {
    expect(Narrator.available({})).toBe(false);
    expect(Narrator.available({ ANTHROPIC_API_KEY: 'x' })).toBe(true);
  });
});
