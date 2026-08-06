/**
 * AgentPool: structure-of-arrays storage for the organism's particles.
 *
 * Each "agent" is a packet of protoplasm with a position, a heading and an
 * energy budget. Removal is swap-with-last so the arrays stay dense.
 */
export class AgentPool {
  readonly capacity: number;
  count = 0;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly heading: Float32Array;
  readonly energy: Float32Array;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.heading = new Float32Array(capacity);
    this.energy = new Float32Array(capacity);
  }

  clear(): void {
    this.count = 0;
  }

  /** Returns the new agent's index, or -1 if the pool is full. */
  spawn(x: number, y: number, heading: number, energy: number): number {
    if (this.count >= this.capacity) return -1;
    const i = this.count++;
    this.x[i] = x;
    this.y[i] = y;
    this.heading[i] = heading;
    this.energy[i] = energy;
    return i;
  }

  /** Swap-remove. The caller must re-process index i afterwards. */
  remove(i: number): void {
    const last = --this.count;
    if (i !== last) {
      this.x[i] = this.x[last];
      this.y[i] = this.y[last];
      this.heading[i] = this.heading[last];
      this.energy[i] = this.energy[last];
    }
  }

  totalEnergy(): number {
    let s = 0;
    for (let i = 0; i < this.count; i++) s += this.energy[i];
    return s;
  }
}
