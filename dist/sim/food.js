/**
 * FoodField: where the market touches the organism.
 *
 * Every token (and the nucleus) is a FoodNode. A node with positive `attract`
 * emits a static scent field with a Gaussian footprint, so agents far away still
 * feel a gradient. Agents sense trail + scent but only the trail is drawn, so what
 * you see on screen is body, not smell. A node with `toxicity` drains energy from
 * any agent standing on it. The organism never sees a price: it only tastes food.
 */
export class FoodField {
    width;
    height;
    nodes = [];
    /** Per-node visit counter, incremented once per agent-step inside the node. */
    visits = new Float64Array(0);
    /** Cell -> node index (or -1) inside the feeding radius. Rebuilt whenever nodes change. */
    owner;
    /** Cell -> node index (or -1) inside the wider catchment used for allocation. */
    catchment;
    catchmentReach;
    /** Summed chemoattractant from every attractive node. Rebuilt whenever nodes change. */
    scent;
    attractReach;
    scentPeak;
    constructor(width, height, attractReach, scentPeak, catchmentReach) {
        this.width = width;
        this.height = height;
        this.attractReach = attractReach;
        this.scentPeak = scentPeak;
        this.catchmentReach = catchmentReach;
        this.owner = new Int16Array(width * height).fill(-1);
        this.catchment = new Int16Array(width * height).fill(-1);
        this.scent = new Float32Array(width * height);
    }
    setNodes(nodes) {
        this.nodes = nodes;
        this.visits = new Float64Array(nodes.length);
        this.rebuildOwner(this.owner, 1);
        this.rebuildOwner(this.catchment, this.catchmentReach);
        this.rebuildScent();
    }
    resetVisits() {
        this.visits.fill(0);
    }
    /** Index of the node whose feeding radius covers (x, y), or -1. */
    ownerAt(x, y) {
        const ix = x | 0;
        const iy = y | 0;
        if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height)
            return -1;
        return this.owner[iy * this.width + ix];
    }
    /** Index of the node whose catchment covers (x, y), or -1. Body here counts toward that node. */
    catchmentAt(x, y) {
        const ix = x | 0;
        const iy = y | 0;
        if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height)
            return -1;
        return this.catchment[iy * this.width + ix];
    }
    /** Scent at a point, clamped to the grid. */
    scentAt(x, y) {
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
        return this.scent[iy * this.width + ix];
    }
    rebuildOwner(grid, scale) {
        const w = this.width;
        const h = this.height;
        grid.fill(-1);
        const best = new Float32Array(w * h).fill(Infinity);
        this.nodes.forEach((node, n) => {
            const r = node.radius * scale;
            const x0 = Math.max(0, Math.floor(node.x - r));
            const x1 = Math.min(w - 1, Math.ceil(node.x + r));
            const y0 = Math.max(0, Math.floor(node.y - r));
            const y1 = Math.min(h - 1, Math.ceil(node.y + r));
            for (let y = y0; y <= y1; y++) {
                for (let x = x0; x <= x1; x++) {
                    const dx = x + 0.5 - node.x;
                    const dy = y + 0.5 - node.y;
                    const d2 = dx * dx + dy * dy;
                    if (d2 > r * r)
                        continue;
                    const i = y * w + x;
                    if (d2 < best[i]) {
                        best[i] = d2;
                        grid[i] = n;
                    }
                }
            }
        });
    }
    rebuildScent() {
        const w = this.width;
        const h = this.height;
        this.scent.fill(0);
        for (const node of this.nodes) {
            if (node.attract <= 0)
                continue;
            const reach = node.reach ?? node.radius * this.attractReach;
            const sigma = reach / 2.5;
            const gain = node.attract * this.scentPeak;
            const x0 = Math.max(0, Math.floor(node.x - reach));
            const x1 = Math.min(w - 1, Math.ceil(node.x + reach));
            const y0 = Math.max(0, Math.floor(node.y - reach));
            const y1 = Math.min(h - 1, Math.ceil(node.y + reach));
            for (let y = y0; y <= y1; y++) {
                for (let x = x0; x <= x1; x++) {
                    const dx = x + 0.5 - node.x;
                    const dy = y + 0.5 - node.y;
                    const d2 = dx * dx + dy * dy;
                    if (d2 > reach * reach)
                        continue;
                    this.scent[y * w + x] += gain * Math.exp(-d2 / (2 * sigma * sigma));
                }
            }
        }
    }
}
