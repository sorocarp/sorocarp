/**
 * Runner: the clock.
 *
 * Steps the organism at a fixed rate, refreshes the market on its own cadence,
 * and emits frames and state for anyone listening (the WebSocket server).
 */
import { EventEmitter } from 'node:events';
import { logger } from '../core/log.js';
const log = logger('runner');
export class Runner extends EventEmitter {
    organism;
    cfg;
    stepsPerSecond;
    paused = false;
    sendAgents = false;
    stepTimer = null;
    frameTimer = null;
    stateTimer = null;
    marketTimer = null;
    refreshing = false;
    frameBuf;
    tickBudgetMs;
    constructor(cfg, organism) {
        super();
        this.cfg = cfg;
        this.organism = organism;
        this.stepsPerSecond = cfg.engine.stepsPerSecond;
        this.frameBuf = new Uint8Array(cfg.sim.width * cfg.sim.height);
        this.tickBudgetMs = 1000 / this.stepsPerSecond;
    }
    async start() {
        await this.refreshMarket();
        this.scheduleSteps();
        this.frameTimer = setInterval(() => this.emitFrame(), 1000 / this.cfg.engine.frameRate);
        this.stateTimer = setInterval(() => this.emitState(), 500);
        this.marketTimer = setInterval(() => void this.refreshMarket(), this.organism.market.refreshMs);
        log.info('started', { stepsPerSecond: this.stepsPerSecond, market: this.organism.market.name });
    }
    stop() {
        for (const t of [this.stepTimer, this.frameTimer, this.stateTimer, this.marketTimer])
            if (t)
                clearInterval(t);
        this.stepTimer = this.frameTimer = this.stateTimer = this.marketTimer = null;
    }
    setSpeed(stepsPerSecond) {
        this.stepsPerSecond = Math.min(240, Math.max(1, stepsPerSecond));
        this.tickBudgetMs = 1000 / this.stepsPerSecond;
        this.scheduleSteps();
        this.emitState();
    }
    pause() {
        this.paused = true;
        this.emitState();
    }
    resume() {
        this.paused = false;
        this.emitState();
    }
    reset() {
        this.organism.reset();
        void this.refreshMarket();
        this.emitFrame();
    }
    state() {
        return { ...this.organism.state(this.stepsPerSecond), paused: this.paused, stepsPerSecond: this.stepsPerSecond };
    }
    scheduleSteps() {
        if (this.stepTimer)
            clearInterval(this.stepTimer);
        // Timers below ~4ms are unreliable; batch several ticks per timer fire instead.
        const intervalMs = Math.max(4, this.tickBudgetMs);
        const ticksPerFire = Math.max(1, Math.round(intervalMs / this.tickBudgetMs));
        this.stepTimer = setInterval(() => {
            if (this.paused)
                return;
            for (let i = 0; i < ticksPerFire; i++)
                this.organism.tick();
        }, intervalMs);
    }
    async refreshMarket() {
        if (this.refreshing)
            return;
        this.refreshing = true;
        try {
            await this.organism.refreshMarket();
            this.emitState();
        }
        catch (err) {
            log.warn('market refresh failed', { error: err.message });
        }
        finally {
            this.refreshing = false;
        }
    }
    emitFrame() {
        if (this.listenerCount('frame') === 0)
            return;
        this.organism.frame(this.frameBuf);
        this.emit('frame', this.frameBuf);
        if (this.sendAgents)
            this.emit('agents', this.organism.agentPositions());
    }
    emitState() {
        if (this.listenerCount('state') === 0)
            return;
        this.emit('state', this.state());
    }
}
