/**
 * Runner: the clock.
 *
 * Steps the organism at a fixed rate, refreshes the market on its own cadence,
 * and emits frames and state for anyone listening (the WebSocket server).
 */
import { EventEmitter } from 'node:events';
import type { Config } from '../config.js';
import { logger } from '../core/log.js';
import type { OrganismState } from './organism.js';
import { Organism } from './organism.js';
import { Narrator } from './narrator.js';

const log = logger('runner');

export interface RunnerEvents {
  frame: (trail: Uint8Array) => void;
  agents: (positions: Uint16Array) => void;
  state: (state: OrganismState) => void;
}

export class Runner extends EventEmitter {
  readonly organism: Organism;
  readonly cfg: Config;
  stepsPerSecond: number;
  paused = false;
  sendAgents = false;

  private stepTimer: NodeJS.Timeout | null = null;
  private frameTimer: NodeJS.Timeout | null = null;
  private stateTimer: NodeJS.Timeout | null = null;
  private marketTimer: NodeJS.Timeout | null = null;
  private voiceTimer: NodeJS.Timeout | null = null;
  private chatTimer: NodeJS.Timeout | null = null;
  private narratorTimer: NodeJS.Timeout | null = null;
  narrator: Narrator | null = null;
  private refreshing = false;
  private frameBuf: Uint8Array;
  private tickBudgetMs: number;

  constructor(cfg: Config, organism: Organism) {
    super();
    this.cfg = cfg;
    this.organism = organism;
    this.stepsPerSecond = cfg.engine.stepsPerSecond;
    this.frameBuf = new Uint8Array(cfg.sim.width * cfg.sim.height);
    this.tickBudgetMs = 1000 / this.stepsPerSecond;
  }

  async start(): Promise<void> {
    await this.refreshMarket();
    this.scheduleSteps();
    this.frameTimer = setInterval(() => this.emitFrame(), 1000 / this.cfg.engine.frameRate);
    this.stateTimer = setInterval(() => this.emitState(), 500);
    this.marketTimer = setInterval(() => void this.refreshMarket(), this.organism.market.refreshMs);
    this.voiceTimer = setInterval(() => {
      if (!this.paused && this.organism.observe()) this.emitState();
    }, this.cfg.voice.observeEveryMs);
    this.chatTimer = setInterval(() => {
      if (this.paused) return;
      this.organism.chatter();
      this.emitState();
    }, this.cfg.backrooms.everyMs);
    if (this.cfg.voice.narrator && Narrator.available()) {
      this.narrator = new Narrator({ model: this.cfg.voice.model, minIntervalMs: this.cfg.voice.narratorEveryMs });
      this.narratorTimer = setInterval(() => void this.narrate(), this.cfg.voice.narratorEveryMs);
      log.info('narrator on', { model: this.cfg.voice.model });
    }
    log.info('started', { stepsPerSecond: this.stepsPerSecond, market: this.organism.market.name });
  }

  stop(): void {
    for (const t of [this.stepTimer, this.frameTimer, this.stateTimer, this.marketTimer, this.voiceTimer, this.chatTimer, this.narratorTimer]) if (t) clearInterval(t);
    this.stepTimer = this.frameTimer = this.stateTimer = this.marketTimer = this.voiceTimer = this.chatTimer = this.narratorTimer = null;
  }

  setSpeed(stepsPerSecond: number): void {
    this.stepsPerSecond = Math.min(240, Math.max(1, stepsPerSecond));
    this.tickBudgetMs = 1000 / this.stepsPerSecond;
    this.scheduleSteps();
    this.emitState();
  }

  pause(): void {
    this.paused = true;
    this.emitState();
  }

  resume(): void {
    this.paused = false;
    this.emitState();
  }

  reset(): void {
    this.organism.reset();
    void this.refreshMarket();
    this.emitFrame();
  }

  state(): OrganismState & { paused: boolean; stepsPerSecond: number } {
    return { ...this.organism.state(this.stepsPerSecond), paused: this.paused, stepsPerSecond: this.stepsPerSecond };
  }

  private scheduleSteps(): void {
    if (this.stepTimer) clearInterval(this.stepTimer);
    // Timers below ~4ms are unreliable; batch several ticks per timer fire instead.
    const intervalMs = Math.max(4, this.tickBudgetMs);
    const ticksPerFire = Math.max(1, Math.round(intervalMs / this.tickBudgetMs));
    this.stepTimer = setInterval(() => {
      if (this.paused) return;
      for (let i = 0; i < ticksPerFire; i++) this.organism.tick();
    }, intervalMs);
  }

  private async narrate(): Promise<void> {
    if (!this.narrator || this.paused) return;
    try {
      const n = await this.narrator.reflect(this.organism.state(this.stepsPerSecond, 0), this.organism.voice.recentCodes());
      if (n) {
        this.organism.narration = n;
        this.emitState();
      }
    } catch (err) {
      log.warn('narrator failed', { error: (err as Error).message });
    }
  }

  private async refreshMarket(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      await this.organism.refreshMarket();
      this.emitState();
    } catch (err) {
      log.warn('market refresh failed', { error: (err as Error).message });
    } finally {
      this.refreshing = false;
    }
  }

  private emitFrame(): void {
    if (this.listenerCount('frame') === 0) return;
    this.organism.frame(this.frameBuf);
    this.emit('frame', this.frameBuf);
    if (this.sendAgents) this.emit('agents', this.organism.agentPositions());
  }

  private emitState(): void {
    if (this.listenerCount('state') === 0) return;
    this.emit('state', this.state());
  }
}
