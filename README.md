<p align="center">
  <img src="https://cdn.prod.website-files.com/69082c5061a39922df8ed3b6/6abfcc5b6ded98a2773637e9_sorobanner.png" alt="Sorocarp. An organism for the market." width="100%" />
</p>

<h1 align="center">
  <img src="https://cdn.prod.website-files.com/69082c5061a39922df8ed3b6/6abfcc5a21ac9a146759ac69_sorofpp.png" alt="" width="28" height="28" align="absmiddle" />
  Sorocarp
</h1>

<p align="center"><strong>Slime Intelligence. We gave a brainless organism access to the market.</strong></p>

<p align="center">
  <a href="https://sorolabs.si">sorolabs.si</a> &nbsp;|&nbsp;
  <a href="https://x.com/sorocarp">@sorocarp</a> &nbsp;|&nbsp;
  <a href="docs/BIOLOGY.md">The biology</a> &nbsp;|&nbsp;
  <a href="docs/ARCHITECTURE.md">Architecture</a> &nbsp;|&nbsp;
  <a href="docs/MARKET-ADAPTERS.md">Market adapters</a>
</p>

---

Sorocarp is a slime mould, *Physarum polycephalum*, whose food is tokens.

Every token on the dish is a food source. Its strength is the token's market score.
The organism grows thick tubes toward strong opportunities, thin tubes toward weak
ones, and starves away from anything toxic. Its body is the portfolio: the share of
protoplasm sitting on each token is that token's weight.

There is no planner, no optimiser, and no model deciding anything. There are a few
thousand particles following seven local rules, every step, in real time, and a
market that keeps moving the food. We call it Slime Intelligence.

```
hunger  ->  sense trail  ->  turn toward it  ->  move  ->  lay trail  ->  eat or starve  ->  divide or die
```

## Contents

- [Why a slime mould](#why-a-slime-mould)
- [Slime Intelligence](#slime-intelligence)
- [What you are looking at](#what-you-are-looking-at)
- [Quick start](#quick-start)
- [The rules](#the-rules)
- [From market data to food](#from-market-data-to-food)
- [From body to portfolio](#from-body-to-portfolio)
- [Architecture](#architecture)
- [Project layout](#project-layout)
- [Command line](#command-line)
- [Configuration reference](#configuration-reference)
- [HTTP and WebSocket API](#http-and-websocket-api)
- [Market sources](#market-sources)
- [Testing and verification](#testing-and-verification)
- [Determinism and performance](#determinism-and-performance)
- [Extending Sorocarp](#extending-sorocarp)
- [Roadmap](#roadmap)
- [FAQ](#faq)
- [Disclaimer](#disclaimer)

## Why a slime mould

*Physarum polycephalum* is a single cell with no brain, no neurons and no central
anything. In a petri dish it solves mazes, finds shortest paths between food
sources, and once famously rebuilt the Tokyo rail network from oat flakes. It does
all of this with local rules: protoplasm flows toward chemical gradients, tubes that
carry flow thicken, tubes that carry nothing are reabsorbed.

That is a resource-allocation machine. It takes a set of options with different
payoffs, spends its body on them in proportion to how much they feed it, and
abandons the ones that stop paying. It has been doing this for a billion years
without ever reading a chart.

Sorocarp asks a simple question: if the oat flakes were tokens, where would it put
its body?

The point is not that slime is a good trader. The point is that a system with no
model of the market at all, driven only by growth toward food and starvation away
from poison, produces an allocation you can watch form, tube by tube, and compare
against a benchmark. Every branch on screen is an argument the organism is making
with its own mass.

## Slime Intelligence

Artificial Intelligence learns a model of the world from data and then predicts.
Slime Intelligence does neither. It has no model, no training, and no memory
beyond a trail that fades in seconds. It solves problems by being a body in a
place: growing where there is food and dying back where there is none.

| | Slime Intelligence | Artificial Intelligence |
|---|---|---|
| Brain | None. One cell. | Billions of parameters. |
| Learns from | Nothing. It does not learn. | Most of the internet. |
| Decides by | Growing toward food. | Predicting what comes next. |
| Rules | Seven, all readable. | Weights nobody can read. |
| Memory | A trail that fades in seconds. | A context window. |
| Explains itself | You watch it happen. | It tells you a story afterwards. |
| Runs on | A browser tab. | A data centre. |
| In production since | About a billion years ago. | About this decade. |

## What you are looking at

This is the engine's own viewer, the one you get from `npm start`. The dish on the left is the trail map. Yellow is protoplasm. Brighter is busier.

- **White ring**: a token with a positive score. Thicker ring, higher score.
- **Red ring with a cross**: a toxic token. Nothing grows there for long.
- **Dashed ring in the centre**: the nucleus. It is a weak permanent food source
  and counts as cash.
- **Percent under a token**: the share of body-time the organism spends there,
  which is also its paper-portfolio weight.

The panel on the right shows the live body count, births and deaths per second,
a paper portfolio marked to the organism's weights against an equal-weight
benchmark, the allocation table with each token's score, share and one-hour
move, and controls to pause, reset, change the step rate, or overlay the raw
particles.

## Quick start

Requires Node 20 or newer.

```bash
git clone https://github.com/<you>/sorocarp.git
cd sorocarp
npm install
npm start
```

Open `http://127.0.0.1:4242`. That runs against a built-in synthetic market so you
can watch the organism work with no network access and no keys.

To feed it live Solana data from the public DexScreener API:

```bash
npm start -- --source dexscreener
```

Other things you can do straight away:

```bash
npm run headless -- -n 6000 --every 2000   # no server; print the allocation table
npm run render -- 6000 frame.png           # no browser; render the dish to a PNG
npm run tokens -- --source dexscreener     # one market snapshot, scored
npm test                                   # vitest
npm run typecheck
npm run build                              # compile to dist/
```

Copy `.env.example` to `.env` to set the market source, port or token list
without touching config.

## The rules

The organism is a particle model in the style of Jones (2010), the standard way
to grow Physarum-like networks on a computer, extended with an energy budget so
that growth and pruning emerge from feeding rather than being scripted.

Each particle has a position, a heading and an energy level. Every step it:

1. **Checks its hunger.** Below `hungerThreshold` it is foraging: it can smell food
   and will settle on it. Above it, it is satiated: it ignores scent and follows
   only the trail laid by other particles. This is how it wanders, explores and
   travels along tubes to other nodes.
2. **Settles.** A hungry particle standing on food stays put this step with
   probability `stickiness * attract`.
3. **Senses.** Otherwise it reads the trail map at three points `sensorOffset`
   cells ahead: straight on, and `sensorAngle` to each side. A hungry particle adds
   the food scent at those points to each reading.
4. **Rotates.** If the front reading beats both sides it keeps going. If both sides
   beat the front it turns randomly left or right. Otherwise it turns toward the
   stronger side by `rotationAngle`, with a little `jitter`.
5. **Moves** one cell forward. The dish wall bounces it with a random heading. A
   cell already holding `maxPerCell` particles blocks the move and the particle
   turns away. Crowding is what makes the body spread instead of collapsing.
6. **Deposits** trail where it lands.
7. **Feeds or starves.** It pays `metabolism` every step. Inside a food node it
   gains `feedRate * attract`, shared with every other particle in the same cell,
   and loses `toxinRate * toxicity`. At `divideEnergy` it splits into a free
   neighbouring cell. At zero it dies.

Then the trail map blends each cell toward its 3x3 mean by `diffusion` and
multiplies everything by `1 - decay`.

Two fields overlay the dish. **Trail** is the body: particles write it, read it,
and it is the only thing drawn. **Scent** is the food: a static sum of Gaussian
bumps rebuilt on every market refresh, sensed only by hungry particles, never
drawn. Keeping them apart means what you see is protoplasm, not smell.

The full treatment, with why each rule produces the behaviour it does, is in
[docs/BIOLOGY.md](docs/BIOLOGY.md).

### What emerges

- **Strong opportunities grow thick branches.** Hungry particles home in on the
  strongest scent they can smell. On a strong node they fill up fast, divide, and
  leave satiated, laying trail outward. Their children get hungry and come back.
  More cycles means more trail, and more trail pulls more traffic. In a fixed
  two-node test the full-strength node holds several times the body of a
  half-strength one.
- **Weak opportunities grow thin branches.** Food in a cell is shared and a weak
  node refills particles slowly, so fewer cycle through it and its halo is small.
- **Bad opportunities prune.** A node whose score goes negative stops emitting
  scent and starts draining energy. Particles on it die, the trail toward it
  evaporates in a few dozen steps, and the branch is gone.
- **Nothing is remembered.** The only memory is the trail map, which fades at
  `decay` per step. The body is always a recent-past answer to "where is the food?"

## From market data to food

A market source returns a list of token snapshots:

```ts
interface TokenSnapshot {
  address: string;          // stable id; the mint address on Solana
  symbol: string;
  name: string;
  priceUsd: number;
  volume24hUsd: number;
  liquidityUsd: number;
  priceChange1hPct: number; // 4.2 means +4.2 percent
  priceChange24hPct: number;
  marketCapUsd?: number;
  updatedAt: number;
}
```

A small, stateless scorer in [src/market/scoring.ts](src/market/scoring.ts) turns
each snapshot into one number in `[-1, 1]`:

| Component | Formula | Weight | Question it answers |
|---|---|---|---|
| momentum | `tanh(priceChange1hPct / 4)` | 0.40 | is it moving now? |
| trend | `tanh(priceChange24hPct / 20)` | 0.20 | has it been moving? |
| activity | `clamp(volume24h / liquidity / 2, 0, 1)` | 0.25 | is anyone here? |
| depth | `clamp((log10(liquidity) - 4) / 3, 0, 1)` | 0.15 | can you get out? |
| fragility | `(0.2 - depth) * 5` when depth < 0.2 | -0.50 | is this a rug? |

The total is clamped to `[-1, 1]`. Positive becomes `attract`, negative becomes
`toxicity`. The engine smooths each token's score across refreshes with an
exponential moving average (`engine.scoreSmoothing`) so that one noisy minute
does not flip a branch between food and poison.

This table is the whole strategy. Change the weights, add a component, swap the
function. The organism will not notice; it only tastes the result.

Tokens are placed on two rings around the nucleus. A token keeps its slot for as
long as it is in the feed, and a token that leaves gives its slot back, so the
dish can discover and forget tokens over time.

## From body to portfolio

Every node has a feeding radius and a catchment three times wider. Each step,
every particle inside a catchment adds one visit to that node. Every ten steps
the visit counts become shares of total body-time, smoothed with an EMA. Those
shares are the portfolio weights. Whatever is not on a token, whether in the
nucleus or wandering, is cash.

On every market refresh the paper portfolio applies the price move since the
last refresh using the weights set at that refresh. An equal-weight buy-and-hold
across the same tokens is tracked alongside as a benchmark. Starting capital is
`portfolio.startingCapitalUsd`, which defaults to 10,000.

Paper only. No orders are sent anywhere.

## Architecture

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

Three layers, none of which know about the others' internals:

| Folder | Knows about | Does not know about |
|---|---|---|
| `src/sim/` | cells, particles, trail, scent, food nodes | prices, tokens, time of day |
| `src/market/` | tokens, prices, liquidity, scores | particles, the grid |
| `src/engine/` | both: binds scores to food and body to weights | HTTP, sockets |
| `src/server/` | the runner's events, the wire format | how the organism works |
| `public/` | the wire format | everything else |

Dependencies only point downward. `src/sim/` and `src/market/` never import
from each other. The organism is plain TypeScript with no Node dependencies, so it can
run in a browser or a worker unchanged.

One Node process runs the organism and serves the picture. The server streams the
trail map as 64 KB binary frames over a WebSocket at 20 fps plus JSON state twice
a second. The client is plain HTML, CSS and JavaScript with no build step: it
paints the trail bytes through a colour lookup table into a canvas, draws token
rings and labels on an overlay, and renders the sidebar from state.

More detail, including the clocks and the message flow, is in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Project layout

```
.
├── config/
│   └── default.json          every tunable, validated with zod on load
├── docs/
│   ├── ARCHITECTURE.md       modules, data flow, clocks, REST
│   ├── BIOLOGY.md            every rule and why it works
│   └── MARKET-ADAPTERS.md    the MarketSource contract and how to add one
├── public/
│   ├── index.html            the page
│   ├── styles.css
│   └── app.js                WebSocket client and canvas painter
├── scripts/
│   └── render-frame.ts       render the dish to PNG without a browser
├── src/
│   ├── cli.ts                run | headless | tokens
│   ├── config.ts             schema, loader, env overrides
│   ├── index.ts              library entry point
│   ├── core/
│   │   ├── rng.ts            seedable PRNG (mulberry32)
│   │   └── log.ts
│   ├── sim/
│   │   ├── grid.ts           TrailMap: deposit, sample, diffuse, decay, quantise
│   │   ├── agents.ts         AgentPool: structure-of-arrays particles
│   │   ├── food.ts           FoodField: nodes, scent field, owner and catchment grids
│   │   ├── layout.ts         RingLayout: stable token slots
│   │   └── physarum.ts       the step function
│   ├── market/
│   │   ├── types.ts          TokenSnapshot, MarketSource
│   │   ├── scoring.ts        scoreToken, scoreToFood
│   │   ├── mock.ts           regime-switching synthetic market
│   │   ├── dexscreener.ts    live Solana data
│   │   └── index.ts          createMarketSource
│   ├── engine/
│   │   ├── organism.ts       scores to food, visits to weights
│   │   ├── portfolio.ts      paper portfolio and benchmark
│   │   └── runner.ts         the clock and event emitter
│   └── server/
│       ├── protocol.ts       message types and binary encoders
│       └── server.ts         static files, REST, WebSocket
└── test/                     vitest
```

## Command line

The CLI is `src/cli.ts`, exposed as `sorocarp` after `npm run build`.

```
sorocarp run       [-p <port>] [-s mock|dexscreener] [-c <config>]
sorocarp headless  [-n <steps>] [--every <n>] [-s ...] [-c ...]
sorocarp tokens    [-s ...] [-c ...]
```

- **run** starts the organism, the market refresh loop and the server.
- **headless** runs the organism with no server and prints a table of score,
  attract, toxicity, share and occupancy per token, plus the paper portfolio.
  Useful for tuning, CI and sanity checks.
- **tokens** fetches one snapshot from the market source and prints it scored.

`npm run render -- <steps> <out.png>` runs the organism headless and writes the
trail map through the same colour ramp the web client uses, with rings for the
nodes. Good for READMEs, CI artefacts, and checking the organism on a machine with no
browser.

## Configuration reference

Everything lives in [config/default.json](config/default.json). It is validated
with zod on load, so a typo fails fast with a readable error. Point
`PHYSARUM_CONFIG` at another file to use it instead.

### `sim`

| Key | Default | Meaning |
|---|---|---|
| `width`, `height` | 256 | dish size in cells |
| `sensorAngle` | 0.7854 | radians between the front sensor and each side sensor |
| `rotationAngle` | 0.7854 | radians turned when a particle decides to rotate |
| `sensorOffset` | 9 | sensor distance ahead of the particle, in cells |
| `stepSize` | 1 | cells moved per step |
| `jitter` | 0.25 | random heading noise per step, peak to peak |
| `depositAmount` | 5 | trail laid per step |
| `decay` | 0.08 | fraction of trail that evaporates per step |
| `diffusion` | 0.8 | how much each cell blends toward its 3x3 mean per step |
| `initialAgents` | 3000 | particles in the inoculation blob |
| `maxAgents` | 20000 | population cap |
| `minAgents` | 500 | floor; below this, particles are re-seeded at the nucleus |
| `spawnRadius` | 22 | spread of seeded particles around the nucleus |
| `metabolism` | 0.0025 | energy burned per step; sets how far an explorer can go |
| `feedRate` | 0.05 | energy per step from a food cell at attract 1, shared per cell |
| `toxinRate` | 0.03 | energy lost per step on a node at toxicity 1 |
| `divideEnergy` | 2 | energy at which a particle splits |
| `maxEnergy` | 3 | energy cap |
| `hungerThreshold` | 0.8 | below this a particle smells food; above it, it wanders |
| `stickiness` | 0.5 | probability (times attract) a hungry particle on food stays put |
| `maxPerCell` | 3 | crowding limit; lower spreads the body, higher makes denser blobs |
| `scentPeak` | 40 | scent at the centre of a node with attract 1, in trail units |
| `foodRadius` | 9 | feeding radius of a token node, in cells |
| `attractReach` | 7 | scent reach as a multiple of `foodRadius` |
| `catchmentReach` | 3 | allocation radius as a multiple of `foodRadius` |
| `nucleusRadius` | 14 | feeding radius of the nucleus |
| `nucleusAttract` | 0.25 | the nucleus is weak, permanent food |
| `nucleusReach` | 2 | scent reach of the nucleus as a multiple of its radius |

### `market`

| Key | Default | Meaning |
|---|---|---|
| `source` | `mock` | `mock` or `dexscreener` |
| `refreshMs` | 1000 | how often the mock market advances one minute |
| `seed` | 1337 | seed for the organism and the mock market |
| `solana.refreshMs` | 15000 | how often DexScreener is polled |
| `solana.tokens` | eight mints | Solana mint addresses to put on the dish |

### `engine`

| Key | Default | Meaning |
|---|---|---|
| `stepsPerSecond` | 30 | step rate when serving; adjustable live |
| `frameRate` | 20 | trail frames broadcast per second |
| `allocationEverySteps` | 10 | how often visit counts become shares |
| `scoreSmoothing` | 0.2 | EMA factor on token scores per refresh; 1 means none |

### `portfolio` and `server`

| Key | Default |
|---|---|
| `portfolio.startingCapitalUsd` | 10000 |
| `server.host` | `127.0.0.1` |
| `server.port` | 4242 |

### Environment overrides

| Variable | Overrides |
|---|---|
| `PHYSARUM_MARKET_SOURCE` | `market.source` |
| `PORT`, `HOST` | `server.port`, `server.host` |
| `PHYSARUM_SOLANA_TOKENS` | `market.solana.tokens`, comma separated |
| `PHYSARUM_SEED` | `market.seed` |
| `PHYSARUM_CONFIG` | path to the config file |
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error` |

### Knobs worth turning first

- `feedRate` up or `metabolism` down grows a bigger body and longer tubes.
- `hungerThreshold` up keeps particles foraging longer and the halos tighter.
- `maxPerCell` 1 gives the classical Jones look with the risk of jamming; 3 is
  fluid; 8 makes dense blobs.
- `decay` down makes abandoned branches linger, which reads as more network.
- `scoreSmoothing` down makes the organism calmer under noisy data.

## HTTP and WebSocket API

Everything is on one port.

| Path | Returns |
|---|---|
| `GET /` | the page |
| `GET /health` | `{ ok, step }` |
| `GET /api/state` | everything the UI shows: body stats, nodes, tokens, allocation, portfolio |
| `GET /api/tokens` | tokens with scores, shares, occupancy and dish positions |
| `GET /api/allocation` | `{ cash, tokens: { SYMBOL: weight } }` |
| `GET /api/portfolio` | paper portfolio with up to 1200 history points |
| `GET /api/config` | organism and engine parameters in use |

The WebSocket is on the same port. On connect the server sends:

```json
{ "type": "hello", "width": 256, "height": 256, "state": { ... } }
```

then `{ "type": "state", "state": { ... } }` twice a second and on every market
refresh. Binary frames start with one tag byte:

| Tag | Payload |
|---|---|
| `0x01` | trail map, `width * height` bytes, row-major, 0 to 255, log-compressed |
| `0x02` | particle positions as little-endian uint16 `(x, y)` pairs; only sent to clients that asked |

Clients can send:

```json
{ "type": "pause" }
{ "type": "resume" }
{ "type": "reset" }
{ "type": "speed", "value": 60 }
{ "type": "agents", "on": true }
```

Types and encoders are in [src/server/protocol.ts](src/server/protocol.ts).

## Market sources

### `mock` (default)

Ten synthetic Solana-flavoured tokens following regime-switching random walks.
Regimes are bull, bear, chop, pump, dump and dead; each sets drift, volatility and
a volume multiplier, and the transitions are weighted so pumps tend to dump and
dumps tend to chop. Liquidity drifts and bleeds during dumps. One `fetch()` is one minute of market time, and the source
pre-rolls a day so 24-hour changes mean something from the first frame. Fully
deterministic from `market.seed`.

### `dexscreener`

Live Solana prices, volume, liquidity and price changes from the public
DexScreener token endpoint. No API key. Up to 30 mints per request, batched for
longer lists. Each token is collapsed to its deepest pool. If a request fails the
last good snapshot is reused so the organism is never starved by a flaky endpoint.

The live market moves far slower than the organism steps, so with real data the
organism's shape changes over minutes, not seconds. Set `engine.stepsPerSecond`
lower if you want the two clocks closer together.

### Writing your own

Implement `MarketSource`, map your API to `TokenSnapshot[]`, add a case to
`createMarketSource()`, and write a fixture test like the DexScreener one. The
contract and some ideas, including pool-level liquidity as food and trending-pair
discovery, are in [docs/MARKET-ADAPTERS.md](docs/MARKET-ADAPTERS.md).

## Testing and verification

```bash
npm test
```

The suite covers:

- **The organism.** Determinism from a seed; the population cap and floor; growth
  toward strong food, less toward weak food, none toward poison; and pruning of a
  branch when its food turns toxic.
- **The trail map.** Decay, smoothing, clamped sampling.
- **Scoring.** Bounds, momentum ordering, thin-liquidity penalty, turnover reward.
- **Markets.** Mock determinism and reset; DexScreener pair collapsing, batching
  and failure handling via an injected fetcher.
- **Portfolio.** Weighted returns against the benchmark, cash earning nothing,
  reset.
- **Layout.** Stable positions, slot recycling, capacity.

CI runs typecheck, tests, build and a short headless run on every push.

For a visual check without a browser, `npm run render -- 6000 frame.png` writes
the dish to a PNG. For a numeric one, `npm run headless -- -n 18000 --every 3000`
prints the allocation table along the way; the default configuration holds a
body of roughly three to six thousand particles across that run while the mock
market changes underneath it.

## Determinism and performance

The organism and the mock market each draw from a seeded PRNG. With the mock source,
the same seed produces the same run, step for step, which is what makes the
tests meaningful and tuning reproducible. The DexScreener source is live data
and is not reproducible.

A 256 by 256 dish with a 20,000 particle cap runs at 700 to 1000 steps per second
headless on a laptop. The server throttles to `stepsPerSecond`, 30 by default,
so there is a lot of headroom for a bigger dish, more particles or more tokens.
Trail frames are 64 KB each at 20 fps, about 1.3 MB per second per client.

## Extending Sorocarp

Some directions the structure already supports:

- **A different strategy.** Edit `scoreToken()`. It is thirty lines.
- **A different market.** Implement `MarketSource`. The engine never sees prices
  directly.
- **Pools instead of tokens.** Make each food node a liquidity pool. The scorer
  gets pool stats instead of token stats; nothing downstream changes.
- **Discovery.** Feed the dish a trending list. `RingLayout` recycles slots as
  tokens come and go.
- **A rebalancer.** Read `/api/allocation` and act on it, behind a flag, in a
  separate process. The organism itself should never hold a key.
- **A bigger or differently shaped dish.** `width` and `height` are config. Walls
  and obstacles would be a small addition to the trail map.
- **Replay.** Log snapshots from a live run and feed them back through a
  `MarketSource` to replay a day deterministically.

## Roadmap

- Richer Solana adapters: Birdeye, Jupiter, pool-level liquidity as food.
- Token discovery from trending pairs.
- Record and replay of live runs.
- A read-only rebalancer that reports what the organism would have done.
- Obstacles and walls on the dish.

## FAQ

**Is it actually trading?**
No. The portfolio is paper. The repository contains no wallet code, no signing,
and no exchange integration. `/api/allocation` exists so that something else
could act on it, and that something is deliberately not here.

**Is an LLM involved anywhere?**
No. The organism is a particle model driven by the rules above, and nothing in
that loop reads or generates text.

**Why is the body on a token whose score just went negative?**
Scores are smoothed across refreshes and trail takes a few dozen steps to fade.
Both delays are tunable: `engine.scoreSmoothing` and `sim.decay`.

**Why has the organism not found a token with a high score?**
Discovery is a random walk from the nucleus plus scent that reaches
`attractReach` food radii. A node on the far side of a crowded dish can take a
while. Raise `attractReach` or `minAgents` to explore harder.

**Is mass proportional to score?**
It is ordered by score, not linear in it. Strong beats weak by a wide margin and
poison gets nothing, but the exact ratio depends on geometry, crowding and how
long each node has been on the dish.

**Can it run in the browser only?**
The organism has no Node dependencies, so yes with a little wiring. The server exists
so that one organism can be watched by many people and fed by a server-side
market source.

## Disclaimer

Sorocarp is an experiment in letting a biological model allocate attention across
a market. It is not financial advice, it is not a trading system, and the
organism has never held a private key. Treat every number on the screen as the
output of a particle model with a paper portfolio, because that is what it is.

MIT licensed.

<p align="center">
  <a href="https://sorolabs.si">sorolabs.si</a> &nbsp;|&nbsp;
  <a href="https://x.com/sorocarp">@sorocarp</a>
</p>
