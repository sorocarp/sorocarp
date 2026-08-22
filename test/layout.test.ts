import { describe, expect, it } from 'vitest';
import { RingLayout } from '../src/sim/layout.js';

describe('RingLayout', () => {
  it('gives stable positions and recycles slots', () => {
    const l = new RingLayout(256, 256);
    l.sync(['a', 'b', 'c']);
    const a1 = l.position('a');
    l.sync(['c', 'a', 'b']);
    expect(l.position('a')).toEqual(a1);

    l.sync(['a', 'c']); // b leaves
    l.sync(['a', 'c', 'd']); // d should take b's old slot
    expect(l.has('d')).toBe(true);
    expect(l.position('d')).not.toEqual(a1);
  });

  it('keeps every node inside the dish', () => {
    const l = new RingLayout(256, 256);
    const ids = Array.from({ length: l.capacity }, (_, i) => 't' + i);
    l.sync(ids);
    for (const id of ids) {
      const p = l.position(id);
      expect(p.x).toBeGreaterThan(8);
      expect(p.x).toBeLessThan(248);
      expect(p.y).toBeGreaterThan(8);
      expect(p.y).toBeLessThan(248);
    }
  });

  it('refuses tokens beyond capacity rather than overlapping', () => {
    const l = new RingLayout(256, 256);
    const ids = Array.from({ length: l.capacity + 3 }, (_, i) => 't' + i);
    l.sync(ids);
    expect(l.has('t' + (l.capacity + 1))).toBe(false);
  });
});
