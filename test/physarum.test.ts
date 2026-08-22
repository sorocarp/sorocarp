import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.js';
import type { FoodNode } from '../src/sim/food.js';
import { TrailMap } from '../src/sim/grid.js';
import { Physarum, type SimParams } from '../src/sim/physarum.js';
import { ConfigSchema } from '../src/config.js';
import defaults from '../config/default.json';

const params: SimParams = ConfigSchema.parse(defaults).sim;

function dish(nodes: Omit<FoodNode, 'kind'>[], seed = 11): Physarum {
  const sim = new Physarum(params, new Rng(seed));
  const cx = params.width / 2;
  const cy = params.height / 2;
  sim.setFood([
    {
      id: 'nucleus',
      label: 'CASH',
      kind: 'nucleus',
      x: cx,
      y: cy,
      radius: params.nucleusRadius,
      attract: params.nucleusAttract,
      toxicity: 0,
      reach: params.nucleusRadius * params.nucleusReach,
    },
    ...nodes.map((n) => ({ ...n, kind: 'token' as const })),
  ]);
  return sim;
}

describe('TrailMap', () => {
  it('decays and smooths', () => {
    const t = new TrailMap(16, 16);
    t.deposit(8, 8, 100);
    const before = t.total();
    t.diffuseAndDecay(0.5, 0.1);
    expect(t.total()).toBeLessThan(before);
    expect(t.sample(8, 8)).toBeLessThan(100);
    expect(t.sample(7, 8)).toBeGreaterThan(0);
  });

  it('samples with clamping instead of wrapping', () => {
    const t = new TrailMap(8, 8);
    t.deposit(0, 0, 5);
    expect(t.sample(-3, -3)).toBe(5);
    expect(t.sample(7.9, 7.9)).toBe(0);
  });
});

describe('Physarum', () => {
  it('is deterministic for a seed', () => {
    const a = dish([], 3);
    const b = dish([], 3);
    for (let i = 0; i < 50; i++) {
      a.tick();
      b.tick();
    }
    expect(a.agents.count).toBe(b.agents.count);
    expect(a.trail.total()).toBeCloseTo(b.trail.total(), 3);
  });

  it('never exceeds the population cap and never drops below the floor', () => {
    const sim = dish([]);
    for (let i = 0; i < 300; i++) {
      const s = sim.tick();
      expect(s.alive).toBeLessThanOrEqual(params.maxAgents);
      expect(s.alive).toBeGreaterThanOrEqual(params.minAgents);
    }
  });

  it('grows toward strong food, less toward weak food, and not at all toward poison', () => {
    const cx = params.width / 2;
    const cy = params.height / 2;
    const r = params.width * 0.34;
    const sim = dish([
      { id: 'strong', label: 'S', x: cx, y: cy - r, radius: params.foodRadius, attract: 1, toxicity: 0 },
      { id: 'weak', label: 'W', x: cx + r, y: cy, radius: params.foodRadius, attract: 0.3, toxicity: 0 },
      { id: 'toxic', label: 'T', x: cx, y: cy + r, radius: params.foodRadius, attract: 0, toxicity: 0.6 },
    ]);
    for (let i = 0; i < 3000; i++) sim.tick();
    const occ = sim.occupancy();
    const [, strong, weak, toxic] = Array.from(occ);
    expect(strong).toBeGreaterThan(200);
    expect(strong).toBeGreaterThan(weak * 1.5);
    expect(weak).toBeGreaterThan(20);
    expect(toxic).toBeLessThan(5);
  }, 60_000);

  it('prunes a branch when its food turns toxic', () => {
    const cx = params.width / 2;
    const cy = params.height / 2;
    const r = params.width * 0.34;
    const node = { id: 'a', label: 'A', x: cx, y: cy - r, radius: params.foodRadius, attract: 1, toxicity: 0 };
    const sim = dish([node]);
    for (let i = 0; i < 2000; i++) sim.tick();
    const fed = sim.occupancy()[1];
    expect(fed).toBeGreaterThan(200);

    sim.setFood([sim.food.nodes[0], { ...node, kind: 'token', attract: 0, toxicity: 0.8 }]);
    for (let i = 0; i < 1500; i++) sim.tick();
    const starved = sim.occupancy()[1];
    expect(starved).toBeLessThan(fed * 0.1);
  }, 60_000);
});
