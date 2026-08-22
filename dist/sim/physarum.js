import { AgentPool } from './agents.js';
import { FoodField } from './food.js';
import { TrailMap } from './grid.js';
const TWO_PI = Math.PI * 2;
export class Physarum {
    params;
    rng;
    trail;
    agents;
    food;
    /** Agents per cell, kept exact across moves, births and deaths. */
    cellCount;
    step = 0;
    constructor(params, rng) {
        this.params = params;
        this.rng = rng;
        this.trail = new TrailMap(params.width, params.height);
        this.agents = new AgentPool(params.maxAgents);
        this.food = new FoodField(params.width, params.height, params.attractReach, params.scentPeak, params.catchmentReach);
        this.cellCount = new Uint8Array(params.width * params.height);
        this.inoculate();
    }
    /** Drop a fresh blob of protoplasm in the middle of the dish. */
    inoculate() {
        const p = this.params;
        this.agents.clear();
        this.trail.clear();
        this.cellCount.fill(0);
        this.step = 0;
        const cx = p.width / 2;
        const cy = p.height / 2;
        for (let i = 0; i < p.initialAgents; i++)
            this.seed(cx, cy);
    }
    /** Spawn one agent near (cx, cy) in a free cell, with a random heading and full energy. */
    seed(cx, cy) {
        const p = this.params;
        const w = p.width;
        const h = p.height;
        // Widen the search each attempt so a crowded nucleus still finds room.
        for (let attempt = 0; attempt < 16; attempt++) {
            const spread = p.spawnRadius * (1 + attempt * 0.5);
            let x = cx + this.rng.gauss() * spread;
            let y = cy + this.rng.gauss() * spread;
            x = x < 1 ? 1 : x >= w - 1 ? w - 1.001 : x;
            y = y < 1 ? 1 : y >= h - 1 ? h - 1.001 : y;
            const cell = (y | 0) * w + (x | 0);
            if (this.cellCount[cell] >= p.maxPerCell)
                continue;
            if (this.agents.spawn(x, y, this.rng.next() * TWO_PI, 1) < 0)
                return false;
            this.cellCount[cell]++;
            return true;
        }
        return false;
    }
    setFood(nodes) {
        this.food.setNodes(nodes);
    }
    tick() {
        const p = this.params;
        const trail = this.trail;
        const a = this.agents;
        const food = this.food;
        const rng = this.rng;
        const w = p.width;
        const h = p.height;
        const SA = p.sensorAngle;
        const RA = p.rotationAngle;
        const SO = p.sensorOffset;
        const occ = this.cellCount;
        const maxPerCell = p.maxPerCell;
        let births = 0;
        let deaths = 0;
        let blocked = 0;
        for (let i = 0; i < a.count;) {
            const x = a.x[i];
            const y = a.y[i];
            const heading = a.heading[i];
            let nx = x;
            let ny = y;
            let nh = heading;
            // Hunger decides whether this particle is foraging or wandering.
            const hungry = a.energy[i] < p.hungerThreshold;
            // Settle: hungry protoplasm on food tends to stay and eat rather than keep exploring.
            const ownerHere = hungry ? food.ownerAt(x, y) : -1;
            const settled = ownerHere >= 0 && rng.next() < p.stickiness * food.nodes[ownerHere].attract;
            if (!settled) {
                // Sense: three readings of trail (the body) plus scent (the food).
                const fx = x + Math.cos(heading) * SO;
                const fy = y + Math.sin(heading) * SO;
                const lx = x + Math.cos(heading - SA) * SO;
                const ly = y + Math.sin(heading - SA) * SO;
                const rx = x + Math.cos(heading + SA) * SO;
                const ry = y + Math.sin(heading + SA) * SO;
                let f = trail.sample(fx, fy);
                let fl = trail.sample(lx, ly);
                let fr = trail.sample(rx, ry);
                if (hungry) {
                    f += food.scentAt(fx, fy);
                    fl += food.scentAt(lx, ly);
                    fr += food.scentAt(rx, ry);
                }
                // Rotate: the whole decision procedure of a slime mould particle.
                if (f > fl && f > fr) {
                    // keep going
                }
                else if (f < fl && f < fr) {
                    nh += rng.next() < 0.5 ? -RA : RA;
                }
                else if (fl < fr) {
                    nh += RA;
                }
                else if (fr < fl) {
                    nh -= RA;
                }
                nh += (rng.next() - 0.5) * p.jitter;
                // Move, bouncing off the dish wall.
                nx = x + Math.cos(nh) * p.stepSize;
                ny = y + Math.sin(nh) * p.stepSize;
                if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) {
                    nx = nx < 1 ? 1 : nx >= w - 1 ? w - 1.001 : nx;
                    ny = ny < 1 ? 1 : ny >= h - 1 ? h - 1.001 : ny;
                    nh = rng.next() * TWO_PI;
                }
                // Crowding: a full cell blocks the move and the agent turns away.
                const from = (y | 0) * w + (x | 0);
                const to = (ny | 0) * w + (nx | 0);
                if (to !== from) {
                    if (occ[to] >= maxPerCell) {
                        nx = x;
                        ny = y;
                        nh = rng.next() * TWO_PI;
                        blocked++;
                    }
                    else {
                        occ[from]--;
                        occ[to]++;
                    }
                }
            }
            trail.deposit(nx, ny, p.depositAmount);
            const here = (ny | 0) * w + (nx | 0);
            a.x[i] = nx;
            a.y[i] = ny;
            a.heading[i] = nh;
            // Feed / starve. A food cell leaks a fixed nutrient flux per step, split
            // between every agent standing in it, so a node can only carry so much body.
            let e = a.energy[i] - p.metabolism;
            const owner = food.ownerAt(nx, ny);
            if (owner >= 0) {
                const node = food.nodes[owner];
                const crowd = occ[here] > 1 ? occ[here] : 1;
                e += (p.feedRate * node.attract) / crowd - p.toxinRate * node.toxicity;
            }
            // Body anywhere in a node's catchment counts toward that node's allocation.
            const basin = food.catchmentAt(nx, ny);
            if (basin >= 0)
                food.visits[basin] += 1;
            if (e <= 0) {
                occ[here]--;
                a.remove(i);
                deaths++;
                continue; // index i now holds the swapped-in agent; process it next
            }
            if (e > p.maxEnergy)
                e = p.maxEnergy;
            if (e >= p.divideEnergy && a.count < p.maxAgents) {
                // Divide into a free neighbouring cell; stay whole if boxed in.
                const bx = nx + (rng.int(3) - 1);
                const by = ny + (rng.int(3) - 1);
                if (bx >= 1 && by >= 1 && bx < w - 1 && by < h - 1) {
                    const bcell = (by | 0) * w + (bx | 0);
                    if (occ[bcell] < maxPerCell) {
                        e *= 0.5;
                        a.spawn(bx, by, nh + (rng.next() - 0.5) * Math.PI, e);
                        occ[bcell]++;
                        births++;
                    }
                }
            }
            a.energy[i] = e;
            i++;
        }
        // Population floor: the nucleus never fully dies, it re-seeds.
        let reseeded = 0;
        while (a.count < p.minAgents && this.seed(w / 2, h / 2))
            reseeded++;
        trail.diffuseAndDecay(p.diffusion, p.decay);
        this.step++;
        return { step: this.step, alive: a.count, births, deaths, reseeded, blocked };
    }
    /** Count agents in each food node's catchment right now. */
    occupancy() {
        const out = new Float64Array(this.food.nodes.length);
        const a = this.agents;
        for (let i = 0; i < a.count; i++) {
            const basin = this.food.catchmentAt(a.x[i], a.y[i]);
            if (basin >= 0)
                out[basin] += 1;
        }
        return out;
    }
}
