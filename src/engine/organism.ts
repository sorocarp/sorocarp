/**
 * Organism: binds the simulation to a market.
 *
 *   market.fetch()  ->  scoreToken()  ->  FoodNode.attract / toxicity
 *   sim.tick()      ->  visits per node ->  allocation shares  ->  portfolio
 *   shares          ->  rebalancer     ->  paper orders        ->  ledger
 *   state diffs     ->  voice (organism log), backrooms (colony chatter)
 *
 * This is the only file that knows about both prices and protoplasm.
 */
import type { Config } from '../config.js';
import { Rng } from '../core/rng.js';
import { scoreToFood, scoreToken, type ScoreBreakdown } from '../market/scoring.js';
import type { MarketSource, TokenSnapshot } from '../market/types.js';
import type { FoodNode } from '../sim/food.js';
import { RingLayout } from '../sim/layout.js';
import { Physarum, type StepStats } from '../sim/physarum.js';
import { Portfolio, type PortfolioPoint } from './portfolio.js';
import { Ledger, PaperExecutor, Rebalancer, type Executor, type Fill, type LedgerView, type Order } from '../execution/index.js';
import { OrganismVoice, type Note } from './voice.js';
import { Backrooms, type ChatContext, type ChatMessage } from './backrooms.js';
import type { Narration } from './narrator.js';

export interface TokenView {
  address: string;
  symbol: string;
  name: string;
  priceUsd: number;
  priceChange1hPct: number;
  priceChange24hPct: number;
  liquidityUsd: number;
  volume24hUsd: number;
  score: ScoreBreakdown;
  attract: number;
  toxicity: number;
  /** Smoothed fraction of the organism's body-time spent on this token. */
  share: number;
  /** Agents standing on the node right now. */
  occupancy: number;
  x: number;
  y: number;
  radius: number;
}

export interface OrganismState {
  step: number;
  alive: number;
  maxAgents: number;
  totalEnergy: number;
  birthsPerSec: number;
  deathsPerSec: number;
  marketSource: string;
  marketUpdatedAt: number;
  marketRefreshes: number;
  sim: { width: number; height: number };
  nucleus: { x: number; y: number; radius: number; share: number };
  tokens: TokenView[];
  cashShare: number;
  /** The organism log: the most recent notes, newest first. */
  notes: Note[];
  /** The narrator's latest line, if a narrator is running. */
  narration: Narration | null;
  /** The backrooms: the most recent colony messages, oldest first. */
  chat: ChatMessage[];
  /** Paper execution: recent orders (newest last) and the ledger. */
  orders: Order[];
  fills: Fill[];
  ledger: LedgerView;
  portfolio: {
    startingCapital: number;
    value: number;
    benchmark: number;
    returnPct: number;
    benchmarkReturnPct: number;
    history: PortfolioPoint[];
  };
}

const NUCLEUS_ID = 'nucleus';
const SHARE_SMOOTHING = 0.25;

export class Organism {
  readonly cfg: Config;
  readonly market: MarketSource;
  readonly sim: Physarum;
  readonly layout: RingLayout;
  readonly portfolio: Portfolio;

  private snapshots: TokenSnapshot[] = [];
  private scores = new Map<string, ScoreBreakdown>();
  private shares = new Map<string, number>();
  private nucleusShare = 0;
  private windowAgentSteps = 0;
  private lastStats: StepStats = { step: 0, alive: 0, births: 0, deaths: 0, reseeded: 0, blocked: 0 };
  private birthsEma = 0;
  private deathsEma = 0;
  private marketUpdatedAt = 0;
  private marketRefreshes = 0;

  readonly ledger: Ledger;
  readonly rebalancer: Rebalancer;
  executor: Executor;
  readonly orders: Order[] = [];
  readonly voice: OrganismVoice;
  readonly backrooms: Backrooms;
  narration: Narration | null = null;

  constructor(cfg: Config, market: MarketSource) {
    this.cfg = cfg;
    this.market = market;
    this.sim = new Physarum(cfg.sim, new Rng(cfg.market.seed));
    this.layout = new RingLayout(cfg.sim.width, cfg.sim.height);
    this.portfolio = new Portfolio(cfg.portfolio.startingCapitalUsd);
    this.ledger = new Ledger(cfg.portfolio.startingCapitalUsd);
    this.rebalancer = new Rebalancer(cfg.execution);
    this.executor = new PaperExecutor(cfg.execution.slippageBps);
    const talk = new Rng(cfg.market.seed + 7);
    this.voice = new OrganismVoice(() => talk.next());
    this.backrooms = new Backrooms(() => talk.next());
    this.sim.setFood([this.nucleusNode()]);
  }

  /** Pull fresh market data and re-lay the food. */
  async refreshMarket(now = Date.now()): Promise<void> {
    const snaps = await this.market.fetch();
    this.applySnapshots(snaps, now);
    if (this.cfg.execution.enabled) await this.settle(now);
  }

  /** Turn the body's weights into paper orders and fill them on the ledger. */
  async settle(now = Date.now()): Promise<Order[]> {
    const prices = this.prices();
    const targets = this.snapshots
      .map((s) => ({ address: s.address, symbol: s.symbol, weight: this.shares.get(s.address) ?? 0 }))
      .filter((t) => t.weight >= 0.01 || this.ledger.positions.has(t.address));
    const orders = this.rebalancer.plan(targets, this.ledger, prices, now);
    if (orders.length === 0) return orders;
    const fills = await this.executor.execute(orders, prices, now);
    for (const f of fills) this.ledger.apply(f);
    this.orders.push(...orders);
    if (this.orders.length > 200) this.orders.splice(0, this.orders.length - 200);
    return orders;
  }

  private prices(): Map<string, number> {
    return new Map(this.snapshots.map((s) => [s.address, s.priceUsd]));
  }

  /** Let the organism log look at the body. Returns the note if it said something. */
  observe(now = Date.now()): Note | null {
    return this.voice.observe(this.state(this.cfg.engine.stepsPerSecond, 0), now);
  }

  /** What the colonies and the narrator get to see. */
  digest(): ChatContext {
    const s = this.state(this.cfg.engine.stepsPerSecond, 0);
    const last = this.orders[this.orders.length - 1];
    return {
      alive: s.alive,
      reserve: Number(s.cashShare.toFixed(3)),
      holdings: s.tokens.filter((t) => t.share >= 0.01).slice(0, 6).map((t) => ({ s: t.symbol, share: Number(t.share.toFixed(3)) })),
      toxic: s.tokens.filter((t) => t.toxicity > 0).slice(0, 6).map((t) => t.symbol),
      lastOrder: last ? { side: last.side, symbol: last.symbol } : null,
    };
  }

  /** The next line of colony chatter. */
  chatter(now = Date.now()): ChatMessage {
    return this.backrooms.next(this.digest(), now);
  }

  /** Synchronous variant used by tests and by refreshMarket. */
  applySnapshots(snaps: TokenSnapshot[], now = Date.now()): void {
    // Close out the current allocation window before the node list changes.
    if (this.windowAgentSteps > 0) this.computeAllocation();

    this.snapshots = snaps;
    // Chemistry responds gradually: smooth each token's score across refreshes so
    // one noisy minute does not flip a branch between food and poison.
    const alpha = this.cfg.engine.scoreSmoothing;
    const next = new Map<string, ScoreBreakdown>();
    for (const s of snaps) {
      const fresh = scoreToken(s);
      const prev = this.scores.get(s.address);
      next.set(s.address, prev ? { ...fresh, total: prev.total + alpha * (fresh.total - prev.total) } : fresh);
    }
    this.scores = next;
    this.layout.sync(snaps.map((s) => s.address));

    const nodes: FoodNode[] = [this.nucleusNode()];
    for (const s of snaps) {
      if (!this.layout.has(s.address)) continue;
      const { attract, toxicity } = scoreToFood(this.scores.get(s.address)!.total);
      const pos = this.layout.position(s.address);
      nodes.push({
        id: s.address,
        label: s.symbol,
        kind: 'token',
        x: pos.x,
        y: pos.y,
        radius: this.cfg.sim.foodRadius,
        attract,
        toxicity,
      });
    }
    this.sim.setFood(nodes);
    this.windowAgentSteps = 0;

    const prices = new Map(snaps.map((s) => [s.address, s.priceUsd]));
    this.portfolio.markToMarket(prices, this.shares, now);
    this.marketUpdatedAt = now;
    this.marketRefreshes++;
  }

  tick(): StepStats {
    const stats = this.sim.tick();
    this.lastStats = stats;
    this.windowAgentSteps += stats.alive;
    this.birthsEma += 0.05 * (stats.births - this.birthsEma);
    this.deathsEma += 0.05 * (stats.deaths - this.deathsEma);
    if (stats.step % this.cfg.engine.allocationEverySteps === 0) this.computeAllocation();
    return stats;
  }

  /** Reset the dish and the paper portfolio. Market source resets too if it can. */
  reset(): void {
    this.sim.inoculate();
    this.portfolio.reset();
    this.shares.clear();
    this.nucleusShare = 0;
    this.windowAgentSteps = 0;
    this.birthsEma = 0;
    this.deathsEma = 0;
    this.marketRefreshes = 0;
    this.market.reset?.();
    this.sim.setFood([this.nucleusNode()]);
    this.snapshots = [];
    this.scores.clear();
    this.ledger.reset();
    this.rebalancer.reset();
    this.orders.length = 0;
    this.voice.reset();
    this.narration = null;
  }

  /** Body-time share per node over the last window, smoothed. */
  private computeAllocation(): void {
    const total = this.windowAgentSteps;
    if (total <= 0) return;
    const nodes = this.sim.food.nodes;
    const visits = this.sim.food.visits;
    for (let i = 0; i < nodes.length; i++) {
      const raw = visits[i] / total;
      const id = nodes[i].id;
      if (id === NUCLEUS_ID) {
        this.nucleusShare += SHARE_SMOOTHING * (raw - this.nucleusShare);
      } else {
        const prev = this.shares.get(id) ?? 0;
        this.shares.set(id, prev + SHARE_SMOOTHING * (raw - prev));
      }
    }
    // Forget tokens that left the dish.
    const live = new Set(nodes.map((n) => n.id));
    for (const id of [...this.shares.keys()]) if (!live.has(id)) this.shares.delete(id);
    this.sim.food.resetVisits();
    this.windowAgentSteps = 0;
  }

  private nucleusNode(): FoodNode {
    const c = this.layout.center();
    return {
      id: NUCLEUS_ID,
      label: 'CASH',
      kind: 'nucleus',
      x: c.x,
      y: c.y,
      radius: this.cfg.sim.nucleusRadius,
      attract: this.cfg.sim.nucleusAttract,
      toxicity: 0,
      reach: this.cfg.sim.nucleusRadius * this.cfg.sim.nucleusReach,
    };
  }

  /** Token shares as a plain map (address -> weight). Cash is the remainder. */
  allocation(): Map<string, number> {
    return new Map(this.shares);
  }

  state(stepsPerSecond: number, historyPoints = 240): OrganismState {
    const occupancy = this.sim.occupancy();
    const nodeIndex = new Map(this.sim.food.nodes.map((n, i) => [n.id, i]));
    const tokens: TokenView[] = [];
    let tokenShare = 0;
    for (const s of this.snapshots) {
      const idx = nodeIndex.get(s.address);
      if (idx === undefined) continue;
      const node = this.sim.food.nodes[idx];
      const share = this.shares.get(s.address) ?? 0;
      tokenShare += share;
      tokens.push({
        address: s.address,
        symbol: s.symbol,
        name: s.name,
        priceUsd: s.priceUsd,
        priceChange1hPct: s.priceChange1hPct,
        priceChange24hPct: s.priceChange24hPct,
        liquidityUsd: s.liquidityUsd,
        volume24hUsd: s.volume24hUsd,
        score: this.scores.get(s.address)!,
        attract: node.attract,
        toxicity: node.toxicity,
        share,
        occupancy: occupancy[idx],
        x: node.x,
        y: node.y,
        radius: node.radius,
      });
    }
    tokens.sort((a, b) => b.share - a.share);
    const c = this.layout.center();
    const p = this.portfolio;
    return {
      step: this.sim.step,
      alive: this.sim.agents.count,
      maxAgents: this.cfg.sim.maxAgents,
      totalEnergy: this.sim.agents.totalEnergy(),
      birthsPerSec: this.birthsEma * stepsPerSecond,
      deathsPerSec: this.deathsEma * stepsPerSecond,
      marketSource: this.market.name,
      marketUpdatedAt: this.marketUpdatedAt,
      marketRefreshes: this.marketRefreshes,
      sim: { width: this.cfg.sim.width, height: this.cfg.sim.height },
      nucleus: { x: c.x, y: c.y, radius: this.cfg.sim.nucleusRadius, share: this.nucleusShare },
      tokens,
      cashShare: Math.max(0, 1 - tokenShare),
      notes: this.voice.notes.slice(0, 8),
      narration: this.narration,
      chat: this.backrooms.log.slice(-12),
      orders: this.orders.slice(-10),
      fills: this.ledger.fills.slice(-10),
      ledger: this.ledger.view(this.prices()),
      portfolio: {
        startingCapital: p.startingCapital,
        value: p.value,
        benchmark: p.benchmark,
        returnPct: p.returnPct,
        benchmarkReturnPct: p.benchmarkReturnPct,
        history: p.history.slice(-historyPoints),
      },
    };
  }

  /** Quantised trail map for the wire. */
  frame(out: Uint8Array): void {
    this.sim.trail.toBytes(out);
  }

  /** Agent positions as uint16 (x, y) pairs for the debug overlay. */
  agentPositions(): Uint16Array {
    const a = this.sim.agents;
    const out = new Uint16Array(a.count * 2);
    for (let i = 0; i < a.count; i++) {
      out[i * 2] = a.x[i];
      out[i * 2 + 1] = a.y[i];
    }
    return out;
  }

  get stats(): StepStats {
    return this.lastStats;
  }
}
