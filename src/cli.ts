#!/usr/bin/env node
/**
 * sorocarp CLI
 *
 *   sorocarp run        start the organism and the live visualisation server
 *   sorocarp headless   run N steps with no server and print the allocation table
 *   sorocarp tokens     fetch one market snapshot and print scores
 */
import 'dotenv/config';
import { Command } from 'commander';
import { loadConfig } from './config.js';
import { logger } from './core/log.js';
import { Organism } from './engine/organism.js';
import { Runner } from './engine/runner.js';
import { createMarketSource, scoreToken } from './market/index.js';
import { createServer } from './server/server.js';

const log = logger('cli');
const program = new Command();

program.name('sorocarp').description('We gave a brainless organism access to the market.').version('0.1.0');

program
  .command('run')
  .description('Start the simulation and the live visualisation server')
  .option('-p, --port <port>', 'port to listen on')
  .option('-s, --source <source>', 'market source: mock | dexscreener')
  .option('-c, --config <file>', 'config file path')
  .action(async (opts: { port?: string; source?: string; config?: string }) => {
    if (opts.source) process.env.PHYSARUM_MARKET_SOURCE = opts.source;
    if (opts.port) process.env.PORT = opts.port;
    const cfg = loadConfig(opts.config);
    const market = createMarketSource(cfg.market);
    const organism = new Organism(cfg, market);
    const runner = new Runner(cfg, organism);
    const server = createServer(cfg, runner);
    await runner.start();
    server.listen(cfg.server.port, cfg.server.host, () => {
      log.info(`live at http://${cfg.server.host}:${cfg.server.port}`);
    });
    const shutdown = () => {
      runner.stop();
      server.close();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });

program
  .command('headless')
  .description('Run without a server and print where the organism put its body')
  .option('-n, --steps <n>', 'simulation steps to run', '3000')
  .option('-s, --source <source>', 'market source: mock | dexscreener')
  .option('-c, --config <file>', 'config file path')
  .option('--every <n>', 'print a table every n steps', '0')
  .action(async (opts: { steps: string; source?: string; config?: string; every: string }) => {
    if (opts.source) process.env.PHYSARUM_MARKET_SOURCE = opts.source;
    const cfg = loadConfig(opts.config);
    const market = createMarketSource(cfg.market);
    const organism = new Organism(cfg, market);
    const steps = Number(opts.steps);
    const every = Number(opts.every);
    const stepsPerRefresh = Math.max(1, Math.round((cfg.engine.stepsPerSecond * market.refreshMs) / 1000));

    await organism.refreshMarket();
    const t0 = performance.now();
    for (let i = 1; i <= steps; i++) {
      organism.tick();
      if (i % stepsPerRefresh === 0) await organism.refreshMarket();
      if (every > 0 && i % every === 0) printTable(organism, cfg.engine.stepsPerSecond, i);
    }
    const ms = performance.now() - t0;
    printTable(organism, cfg.engine.stepsPerSecond, steps);
    console.log(`\n${steps} steps in ${ms.toFixed(0)} ms (${((steps / ms) * 1000).toFixed(0)} steps/s)`);
  });

program
  .command('tokens')
  .description('Fetch one snapshot from the market source and print scores')
  .option('-s, --source <source>', 'market source: mock | dexscreener')
  .option('-c, --config <file>', 'config file path')
  .action(async (opts: { source?: string; config?: string }) => {
    if (opts.source) process.env.PHYSARUM_MARKET_SOURCE = opts.source;
    const cfg = loadConfig(opts.config);
    const market = createMarketSource(cfg.market);
    const snaps = await market.fetch();
    const rows = snaps
      .map((s) => ({ s, score: scoreToken(s) }))
      .sort((a, b) => b.score.total - a.score.total)
      .map(({ s, score }) => ({
        symbol: s.symbol,
        price: fmtPrice(s.priceUsd),
        '1h%': s.priceChange1hPct.toFixed(2),
        '24h%': s.priceChange24hPct.toFixed(2),
        liquidity: fmtUsd(s.liquidityUsd),
        volume24h: fmtUsd(s.volume24hUsd),
        score: score.total.toFixed(3),
        momentum: score.momentum.toFixed(2),
        activity: score.activity.toFixed(2),
        depth: score.depth.toFixed(2),
      }));
    console.log(`source: ${market.name}`);
    console.table(rows);
  });

function printTable(organism: Organism, stepsPerSecond: number, step: number): void {
  const s = organism.state(stepsPerSecond);
  console.log(`\nstep ${step}  alive ${s.alive}  energy ${s.totalEnergy.toFixed(0)}  portfolio $${s.portfolio.value.toFixed(2)}  benchmark $${s.portfolio.benchmark.toFixed(2)}`);
  console.table(
    s.tokens.map((t) => ({
      symbol: t.symbol,
      score: t.score.total.toFixed(3),
      attract: t.attract.toFixed(2),
      toxic: t.toxicity.toFixed(2),
      'share%': (t.share * 100).toFixed(1),
      occupancy: t.occupancy,
      '1h%': t.priceChange1hPct.toFixed(2),
    })),
  );
  console.log(`cash share ${(s.cashShare * 100).toFixed(1)}%`);
}

function fmtUsd(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

function fmtPrice(v: number): string {
  if (v >= 1) return v.toFixed(2);
  if (v >= 0.01) return v.toFixed(4);
  return v.toPrecision(3);
}

program.parseAsync(process.argv).catch((err) => {
  log.error((err as Error).message);
  process.exit(1);
});
