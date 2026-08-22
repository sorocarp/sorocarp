# Architecture

One Node process runs the organism and serves the picture. The browser only paints.

```
                 market data                    protoplasm
  MarketSource ─────────────► Organism ◄──────────────── Physarum
  (mock | dexscreener)        │  scoreToken()            │  TrailMap
                              │  FoodNode[]              │  AgentPool
                              │  allocation shares       │  FoodField
                              │  Portfolio               │
                              ▼                          │
                           Runner  (timers: steps, frames, state, market)
                              │
                              ▼
                        createServer()  ── HTTP static + /api/*  ── WebSocket
                                                                      │
                                                               public/app.js
```

## Layers

| Folder | Knows about | Does not know about |
|---|---|---|
| `src/sim/` | cells, particles, trail, food nodes | prices, tokens, time of day |
| `src/market/` | tokens, prices, liquidity, scores | particles, the grid |
| `src/engine/` | both: binds scores to food and body to weights | HTTP, sockets |
| `src/server/` | the runner's events, the wire format | how the sim works |
| `public/` | the wire format | everything else |

Dependencies only point downward in that table. `src/sim/` and `src/market/` never
import from each other.

## Modules

### `src/sim/`

* `grid.ts` **TrailMap.** One `Float32Array` per cell. `deposit`, `sample`,
  `diffuseAndDecay`, `toBytes` (log-compressed to 0..255 for the wire).
* `agents.ts` **AgentPool.** Structure-of-arrays particle storage with swap-remove.
* `food.ts` **FoodField.** Food nodes, a static scent field (sum of Gaussian bumps,
  rebuilt when nodes change), an owner grid (cell to node index) for O(1) feeding
  lookups, a wider catchment grid for allocation, and a per-node visit counter.
* `layout.ts` **RingLayout.** Stable slot assignment on two rings around the nucleus.
* `physarum.ts` **Physarum.** The step function. Read `docs/BIOLOGY.md` for the rules.

### `src/market/`

* `types.ts` `TokenSnapshot` and the `MarketSource` interface.
* `scoring.ts` `scoreToken()` turns a snapshot into a number in `[-1, 1]`;
  `scoreToFood()` splits it into `attract` and `toxicity`. This is the whole strategy.
* `mock.ts` A regime-switching synthetic market. Deterministic from a seed.
* `dexscreener.ts` Real Solana data from the public DexScreener API.
* `index.ts` `createMarketSource(config)`.

### `src/engine/`

* `organism.ts` **Organism.** On each market refresh: score tokens, lay food, mark
  the portfolio. On each tick: step the sim, and every `allocationEverySteps` turn
  visit counts into smoothed body-time shares.
* `portfolio.ts` **Portfolio.** Paper value of the body-as-weights, and an
  equal-weight benchmark.
* `runner.ts` **Runner.** Timers and an event emitter: `frame`, `agents`, `state`.
  Handles pause, resume, reset and speed.

### `src/server/`

* `protocol.ts` Message types and binary encoders. Text frames are JSON; binary
  frames start with a tag byte (`0x01` trail, `0x02` agent positions).
* `server.ts` Static files from `public/`, REST under `/api/`, WebSocket on the
  same port.

### `public/`

* `index.html`, `styles.css`, `app.js`. No build step. The client paints the trail
  bytes through a colour lookup table into a 256x256 canvas scaled up by CSS, draws
  token rings and labels on an overlay canvas, and renders the sidebar from state.

## Data flow per second (defaults)

| Clock | Rate | What happens |
|---|---|---|
| step | 30/s | `Physarum.tick()` |
| allocation | every 10 steps | visits become shares (EMA) |
| frame | 20/s | trail bytes broadcast (64 KB each) |
| state | 2/s | JSON state broadcast |
| market | 1/s mock, 15/s dexscreener | fetch, score, re-lay food, mark portfolio |

## REST

| Path | Returns |
|---|---|
| `/health` | `{ ok, step }` |
| `/api/state` | full `LiveState` |
| `/api/tokens` | token views with scores and shares |
| `/api/allocation` | `{ cash, tokens: { SYMBOL: share } }` |
| `/api/portfolio` | portfolio with up to 1200 history points |
| `/api/config` | sim and engine parameters in use |

## Determinism

The sim and the mock market each draw from a seeded `Rng`. With the mock source,
the same seed produces the same run step for step. The DexScreener source is live
data and is not reproducible.

## Performance

A 256x256 dish with 24k particle capacity runs at roughly 1000 steps per second
on a laptop in headless mode. The server throttles to `stepsPerSecond` (30 by
default) so there is a lot of headroom for a bigger dish or more particles.
