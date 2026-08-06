/**
 * Library entry point. Import from here if you embed the organism elsewhere.
 */
export { Physarum, type SimParams, type StepStats } from './sim/physarum.js';
export { TrailMap } from './sim/grid.js';
export { AgentPool } from './sim/agents.js';
export { FoodField, type FoodNode, type FoodKind } from './sim/food.js';
export { RingLayout, type Point } from './sim/layout.js';
export { Rng } from './core/rng.js';
export { Organism, type OrganismState, type TokenView } from './engine/organism.js';
export { Portfolio, type PortfolioPoint } from './engine/portfolio.js';
export { Runner } from './engine/runner.js';
export { loadConfig, applyEnv, ConfigSchema, type Config, type SimConfig, type MarketConfig } from './config.js';
export * from './market/index.js';
export { createServer } from './server/server.js';
export * from './server/protocol.js';
