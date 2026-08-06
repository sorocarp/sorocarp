/**
 * Layout: where a token sits on the petri dish.
 *
 * Positions are stable for the life of a run: the first time a token id is seen
 * it takes the next free slot on a ring around the nucleus. Tokens that vanish
 * from the feed give their slot back so new ones can take it.
 */
export interface Point {
  x: number;
  y: number;
}

export class RingLayout {
  private slots = new Map<string, number>();
  private readonly cx: number;
  private readonly cy: number;
  private readonly rings: { radius: number; capacity: number }[];
  private readonly totalCapacity: number;

  constructor(width: number, height: number) {
    this.cx = width / 2;
    this.cy = height / 2;
    const m = Math.min(width, height);
    this.rings = [
      { radius: m * 0.34, capacity: 12 },
      { radius: m * 0.46, capacity: 18 },
    ];
    this.totalCapacity = this.rings.reduce((s, r) => s + r.capacity, 0);
  }

  get capacity(): number {
    return this.totalCapacity;
  }

  /** Assign/retain slots for the given ids. Ids not present release their slot. */
  sync(ids: string[]): void {
    const live = new Set(ids);
    for (const id of [...this.slots.keys()]) {
      if (!live.has(id)) this.slots.delete(id);
    }
    const used = new Set(this.slots.values());
    for (const id of ids) {
      if (this.slots.has(id)) continue;
      let slot = 0;
      while (used.has(slot) && slot < this.totalCapacity) slot++;
      if (slot >= this.totalCapacity) break; // dish is full; token waits for a slot
      used.add(slot);
      this.slots.set(id, slot);
    }
  }

  has(id: string): boolean {
    return this.slots.has(id);
  }

  position(id: string): Point {
    const slot = this.slots.get(id);
    if (slot === undefined) throw new Error(`no slot for ${id}`);
    let offset = 0;
    for (let r = 0; r < this.rings.length; r++) {
      const ring = this.rings[r];
      if (slot < offset + ring.capacity) {
        const k = slot - offset;
        // Stagger the outer ring half a step so nodes don't line up radially.
        const angle = ((k + (r % 2) * 0.5) / ring.capacity) * Math.PI * 2 - Math.PI / 2;
        return {
          x: this.cx + Math.cos(angle) * ring.radius,
          y: this.cy + Math.sin(angle) * ring.radius,
        };
      }
      offset += ring.capacity;
    }
    throw new Error(`slot ${slot} out of range`);
  }

  center(): Point {
    return { x: this.cx, y: this.cy };
  }
}
