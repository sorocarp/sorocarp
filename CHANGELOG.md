# Changelog

## 0.2.0

**Paper execution.** The organism's weights now become orders. A rebalancer
plans them with a minimum delta, a per-token cooldown, an order cap per cycle
and a cash floor; a paper executor fills them with slippage; a ledger holds
cash, positions, average entry and PnL. `Executor` is an interface so a signing
executor can be added later. New endpoints `/api/orders` and `/api/ledger`.

**Voice.** The organism log reports what changed in the body, in the
organism's own terms, with machine-readable event codes. An optional narrator
turns the same digest into prose when a key is present. New endpoint
`/api/voice`; notes and narration ride along in `/api/state`.

**Backrooms.** Five colonies talk about the organism from the engine itself: a
seeded grammar with slots filled from the live state, turn-taking, and
terminal art. New endpoint `/api/backrooms`; the viewer shows the chat.

**Token discovery.** A `trending` market source that keeps the plate stocked
with the Solana tokens currently most boosted on DexScreener, with a sticky
period so the organism abandons tokens on its own terms.

**Viewer.** Panels for paper execution, voice and backrooms.

**Shared core.** The public site's organism log and backrooms now import the
engine's modules instead of carrying copies.

Fourteen new tests. The organism itself is unchanged.

## 0.1.0

The organism: a Physarum particle model with an energy budget, food scoring,
the mock and DexScreener market sources, the index, the engine server and the
viewer.
