/**
 * Config: one JSON file, validated with zod, with a few env overrides.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const SimSchema = z.object({
  width: z.number().int().min(64).max(1024),
  height: z.number().int().min(64).max(1024),
  sensorAngle: z.number().positive(),
  rotationAngle: z.number().positive(),
  sensorOffset: z.number().positive(),
  stepSize: z.number().positive(),
  jitter: z.number().min(0),
  depositAmount: z.number().positive(),
  decay: z.number().min(0).max(1),
  diffusion: z.number().min(0).max(1),
  initialAgents: z.number().int().positive(),
  maxAgents: z.number().int().positive(),
  minAgents: z.number().int().min(0),
  spawnRadius: z.number().positive(),
  metabolism: z.number().min(0),
  feedRate: z.number().min(0),
  toxinRate: z.number().min(0),
  divideEnergy: z.number().positive(),
  maxEnergy: z.number().positive(),
  scentPeak: z.number().min(0),
  foodRadius: z.number().positive(),
  attractReach: z.number().min(1),
  catchmentReach: z.number().min(1),
  nucleusRadius: z.number().positive(),
  nucleusAttract: z.number().min(0).max(1),
  nucleusReach: z.number().min(1),
  maxPerCell: z.number().int().min(1).max(255),
  stickiness: z.number().min(0).max(1),
  hungerThreshold: z.number().positive(),
});

const MarketSchema = z.object({
  source: z.enum(['mock', 'dexscreener', 'trending']),
  refreshMs: z.number().int().positive(),
  seed: z.number().int(),
  solana: z.object({
    refreshMs: z.number().int().positive(),
    tokens: z.array(z.string().min(32)),
  }),
  trending: z.object({
    refreshMs: z.number().int().positive(),
    max: z.number().int().min(1).max(30),
    stickMs: z.number().int().min(0),
  }),
});

const ExecutionSchema = z.object({
  /** Turn body weights into paper orders on every market refresh. */
  enabled: z.boolean(),
  minDelta: z.number().min(0).max(1),
  cooldownMs: z.number().int().min(0),
  maxOrdersPerCycle: z.number().int().min(1).max(50),
  minCash: z.number().min(0).max(1),
  slippageBps: z.number().min(0).max(1000),
});

const VoiceSchema = z.object({
  /** How often the organism log looks for something to say. */
  observeEveryMs: z.number().int().positive(),
  /** Use a language model narrator when a key is in the environment. */
  narrator: z.boolean(),
  narratorEveryMs: z.number().int().positive(),
  model: z.string().min(1),
});

const BackroomsSchema = z.object({
  everyMs: z.number().int().positive(),
});

const EngineSchema = z.object({
  stepsPerSecond: z.number().positive().max(240),
  frameRate: z.number().positive().max(60),
  allocationEverySteps: z.number().int().positive(),
  /** 0..1 EMA factor applied to token scores per market refresh. 1 = no smoothing. */
  scoreSmoothing: z.number().min(0.01).max(1),
});

const PortfolioSchema = z.object({
  startingCapitalUsd: z.number().positive(),
});

const ServerSchema = z.object({
  host: z.string(),
  port: z.number().int().min(1).max(65535),
});

export const ConfigSchema = z.object({
  sim: SimSchema,
  market: MarketSchema,
  engine: EngineSchema,
  portfolio: PortfolioSchema,
  execution: ExecutionSchema,
  voice: VoiceSchema,
  backrooms: BackroomsSchema,
  server: ServerSchema,
});

export type Config = z.infer<typeof ConfigSchema>;
export type SimConfig = z.infer<typeof SimSchema>;
export type MarketConfig = z.infer<typeof MarketSchema>;

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CONFIG_PATH = path.resolve(here, '..', 'config', 'default.json');

export function loadConfig(file?: string): Config {
  const configPath = file ?? process.env.PHYSARUM_CONFIG ?? DEFAULT_CONFIG_PATH;
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const cfg = ConfigSchema.parse(raw);
  return applyEnv(cfg);
}

export function applyEnv(cfg: Config, env: NodeJS.ProcessEnv = process.env): Config {
  const out: Config = structuredClone(cfg);
  const source = env.PHYSARUM_MARKET_SOURCE;
  if (source === 'mock' || source === 'dexscreener' || source === 'trending') out.market.source = source;
  if (env.PORT) {
    const port = Number(env.PORT);
    if (Number.isInteger(port) && port > 0) out.server.port = port;
  }
  if (env.HOST) out.server.host = env.HOST;
  if (env.PHYSARUM_SOLANA_TOKENS) {
    out.market.solana.tokens = env.PHYSARUM_SOLANA_TOKENS.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (env.PHYSARUM_SEED) {
    const seed = Number(env.PHYSARUM_SEED);
    if (Number.isInteger(seed)) out.market.seed = seed;
  }
  return out;
}
