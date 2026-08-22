/**
 * Small, fast, seedable PRNG (mulberry32).
 * Every stochastic part of the organism draws from one of these so a run can be
 * replayed exactly from its seed.
 */
export class Rng {
    state;
    constructor(seed) {
        this.state = seed >>> 0;
    }
    /** Uniform float in [0, 1). */
    next() {
        let t = (this.state += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    /** Uniform float in [min, max). */
    range(min, max) {
        return min + (max - min) * this.next();
    }
    /** Integer in [0, n). */
    int(n) {
        return Math.floor(this.next() * n);
    }
    /** Standard normal via Box-Muller. */
    gauss() {
        let u = 0;
        let v = 0;
        while (u === 0)
            u = this.next();
        while (v === 0)
            v = this.next();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    pick(items) {
        return items[this.int(items.length)];
    }
}
