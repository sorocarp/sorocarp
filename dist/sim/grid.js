/**
 * TrailMap: the chemoattractant field the organism lives in.
 *
 * Agents deposit trail where they walk, food nodes deposit trail where they sit,
 * and every step the field diffuses (3x3 mean blend) and decays. This is the
 * shared memory of the organism: there is no central controller, only this map.
 */
export class TrailMap {
    width;
    height;
    data;
    scratch;
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.data = new Float32Array(width * height);
        this.scratch = new Float32Array(width * height);
    }
    clear() {
        this.data.fill(0);
    }
    /** Nearest-cell sample, clamped to the grid (walls, not wrap-around). */
    sample(x, y) {
        let ix = x | 0;
        let iy = y | 0;
        if (ix < 0)
            ix = 0;
        else if (ix >= this.width)
            ix = this.width - 1;
        if (iy < 0)
            iy = 0;
        else if (iy >= this.height)
            iy = this.height - 1;
        return this.data[iy * this.width + ix];
    }
    deposit(x, y, amount) {
        const ix = x | 0;
        const iy = y | 0;
        if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height)
            return;
        this.data[iy * this.width + ix] += amount;
    }
    /**
     * One relaxation step.
     * @param diffusion 0..1 how much each cell blends toward its 3x3 neighbourhood mean
     * @param decay     0..1 fraction of trail that evaporates each step
     */
    diffuseAndDecay(diffusion, decay) {
        const w = this.width;
        const h = this.height;
        const src = this.data;
        const dst = this.scratch;
        const keep = 1 - decay;
        const own = 1 - diffusion;
        const share = diffusion / 9;
        for (let y = 0; y < h; y++) {
            const y0 = y === 0 ? 0 : y - 1;
            const y1 = y === h - 1 ? h - 1 : y + 1;
            const r0 = y0 * w;
            const r1 = y * w;
            const r2 = y1 * w;
            for (let x = 0; x < w; x++) {
                const x0 = x === 0 ? 0 : x - 1;
                const x1 = x === w - 1 ? w - 1 : x + 1;
                const sum = src[r0 + x0] + src[r0 + x] + src[r0 + x1] +
                    src[r1 + x0] + src[r1 + x] + src[r1 + x1] +
                    src[r2 + x0] + src[r2 + x] + src[r2 + x1];
                dst[r1 + x] = (own * src[r1 + x] + share * sum) * keep;
            }
        }
        this.data = dst;
        this.scratch = src;
    }
    total() {
        let s = 0;
        for (let i = 0; i < this.data.length; i++)
            s += this.data[i];
        return s;
    }
    /**
     * Quantise to bytes for the wire. Log-style compression so faint exploratory
     * trails stay visible next to thick tubes.
     */
    toBytes(out, scale = 20) {
        const d = this.data;
        for (let i = 0; i < d.length; i++) {
            out[i] = (255 * (1 - Math.exp(-d[i] / scale))) | 0;
        }
    }
}
