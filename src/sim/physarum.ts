/**
 * Physarum: the organism.
 *
 * This is a particle-based slime mould model in the style of Jones (2010),
 * extended with an energy budget so growth and pruning emerge from feeding:
 *
 *   hunger  below hungerThreshold an agent is hungry: it smells food and settles to eat;
 *           above it, it ignores scent and follows only trail, so it wanders and explores
 *   settle  a hungry agent standing on food stays put with probability stickiness * attract
 *   sense   each agent reads trail (+ food scent when hungry) at three sensors
 *   rotate  turn toward the strongest reading; random turn if both sides beat front
 *   move    step forward; bounce off the dish wall with a random heading
 *   deposit lay trail where you landed
 *   feed    standing on attractive food gains energy, shared with everyone else
 *           in the same cell (finite nutrient flux); toxic food drains it
 *   divide  energy above a threshold splits the agent into a free neighbouring cell
 *   die     energy at zero removes the agent
 *
 * Then the trail map diffuses and decays. There is no planner anywhere.
 * Tubes toward good food thicken because agents there multiply and lay more trail;
 * tubes toward bad food vanish because agents there starve and the trail evaporates.
 */
import { Rng } from '../core/rng.js';
import { AgentPool } from './agents.js';
import { FoodField, type FoodNode } from './food.js';
import { TrailMap } from './grid.js';

export interface SimParams {
  width: number;
  height: number;
  /** Radians between the front sensor and each side sensor. */
  sensorAngle: number;
  /** Radians an agent turns when it decides to rotate. */
  rotationAngle: number;
  /** Distance of sensors from the agent, in cells. */
  sensorOffset: number;
  stepSize: number;
  /** Random heading noise per step (radians, peak-to-peak). */
  jitter: number;
  depositAmount: number;
  decay: number;
  diffusion: number;
  initialAgents: number;
  maxAgents: number;
  /** Population floor: below this, agents are re-seeded at the nucleus. */
  minAgents: number;
  spawnRadius: number;
  /** Energy spent per step just existing. */
  metabolism: number;
  /** Energy gained per step on food with attract = 1. */
  feedRate: number;
  /** Energy lost per step on food with toxicity = 1. */
  toxinRate: number;
  divideEnergy: number;
  maxEnergy: number;
  /** Scent at the centre of a food node with attract = 1, in trail units. */
  scentPeak: number;
  /** Feeding radius of a token node, in cells. */
  foodRadius: number;
  /** Chemoattractant reach as a multiple of foodRadius. */
  attractReach: number;
  /** Catchment radius for allocation as a multiple of foodRadius. */
  catchmentReach: number;
  nucleusRadius: number;
  nucleusAttract: number;
  /** Chemoattractant reach of the nucleus as a multiple of nucleusRadius. */
  nucleusReach: number;
  /** Max agents per cell. A blocked agent stays put and picks a new heading. */
  maxPerCell: number;
  /** Probability (times attract) that a hungry agent on food does not move this step. */
  stickiness: number;
  /** Energy below which an agent follows scent and settles on food. */
  hungerThreshold: number;
}

export interface StepStats {
  step: number;
  alive: number;
  births: number;
  deaths: number;
  reseeded: number;
  blocked: number;
}

const TWO_PI = Math.PI * 2;

export class Physarum {
  readonly params: SimParams;
  readonly rng: Rng;
  readonly trail: TrailMap;
  readonly agents: AgentPool;
  readonly food: FoodField;
  /** Agents per cell, kept exact across moves, births and deaths. */
  readonly cellCount: Uint8Array;
  step = 0;

  constructor(params: SimParams, rng: Rng) {
    this.params = params;
    this.rng = rng;
    this.trail = new TrailMap(params.width, params.height);
    this.agents = new AgentPool(params.maxAgents);
    this.food = new FoodField(params.width, params.height, params.attractReach, params.scentPeak, params.catchmentReach);
    this.cellCount = new Uint8Array(params.width * params.height);
    this.inoculate();
  }

  /** Drop a fresh blob of protoplasm in the middle of the dish. */
  inoculate(): void {
    const p = this.params;
    this.agents.clear();
    this.trail.clear();
    this.cellCount.fill(0);
    this.step = 0;
    const cx = p.width / 2;
    const cy = p.height / 2;
    for (let i = 0; i < p.initialAgents; i++) this.seed(cx, cy);
  }

  /** Spawn one agent near (cx, cy) in a free cell, with a random heading and full energy. */
  private seed(cx: number, cy: number): boolean {
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
      if (this.cellCount[cell] >= p.maxPerCell) continue;
      if (this.agents.spawn(x, y, this.rng.next() * TWO_PI, 1) < 0) return false;
      this.cellCount[cell]++;
      return true;
    }
    return false;
  }

  setFood(nodes: FoodNode[]): void {
    this.food.setNodes(nodes);
  }

  tick(): StepStats {
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

    for (let i = 0; i < a.count; ) {
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
        } else if (f < fl && f < fr) {
          nh += rng.next() < 0.5 ? -RA : RA;
        } else if (fl < fr) {
          nh += RA;
        } else if (fr < fl) {
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
          } else {
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
      if (basin >= 0) food.visits[basin] += 1;

      if (e <= 0) {
        occ[here]--;
        a.remove(i);
        deaths++;
        continue; // index i now holds the swapped-in agent; process it next
      }
      if (e > p.maxEnergy) e = p.maxEnergy;
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
    while (a.count < p.minAgents && this.seed(w / 2, h / 2)) reseeded++;

    trail.diffuseAndDecay(p.diffusion, p.decay);
    this.step++;

    return { step: this.step, alive: a.count, births, deaths, reseeded, blocked };
  }

  /** Count agents in each food node's catchment right now. */
  occupancy(): Float64Array {
    const out = new Float64Array(this.food.nodes.length);
    const a = this.agents;
    for (let i = 0; i < a.count; i++) {
      const basin = this.food.catchmentAt(a.x[i], a.y[i]);
      if (basin >= 0) out[basin] += 1;
    }
    return out;
  }
}
