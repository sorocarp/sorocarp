/**
 * Library entry point. Import from here if you embed the organism elsewhere.
 */
export { Physarum } from './sim/physarum.js';
export { TrailMap } from './sim/grid.js';
export { AgentPool } from './sim/agents.js';
export { FoodField } from './sim/food.js';
export { RingLayout } from './sim/layout.js';
export { Rng } from './core/rng.js';
export { Organism } from './engine/organism.js';
export { Portfolio } from './engine/portfolio.js';
export { Runner } from './engine/runner.js';
export { loadConfig, applyEnv, ConfigSchema } from './config.js';
export * from './market/index.js';
export { createServer } from './server/server.js';
export * from './server/protocol.js';
