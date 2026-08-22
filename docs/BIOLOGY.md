# The biology

Physarum polycephalum is a single-celled slime mould with no nervous system. In a
petri dish it solves mazes, finds shortest paths and builds transport networks that
look like rail maps. It does this with local rules only: protoplasm flows toward
chemical gradients, tubes that carry flow thicken, tubes that do not carry flow
are reabsorbed.

This project runs a particle model of that organism and lets the market be the
chemistry. There is no planner, no optimiser and no language model in the loop.
Everything you see on screen is the sum of the rules below applied to thousands
of particles, every step.

## The particle model

The core is the Jones (2010) agent-based model, which is the standard way to grow
Physarum-like networks on a computer, plus an energy budget so growth and pruning
emerge from feeding.

Each particle has a position, a heading and an energy level. Every step it:

1. **Checks its hunger.** Below `hungerThreshold` it is foraging: it can smell food
   and will settle on it. Above it, it is satiated: it ignores scent and follows
   only the trail laid by other particles, which is how it wanders, explores and
   travels along tubes to other nodes.
2. **Settles.** A hungry particle standing on food stays put this step with
   probability `stickiness * attract`.
3. **Senses.** Otherwise it reads the trail map at three points `sensorOffset`
   cells ahead: straight on, and `sensorAngle` to each side. A hungry particle
   adds the food scent at those points to each reading.
4. **Rotates.** If the front reading beats both sides, it keeps going. If both sides
   beat the front, it turns randomly left or right. Otherwise it turns toward the
   stronger side by `rotationAngle`. A little `jitter` is added so paths are not
   perfectly straight.
5. **Moves** one `stepSize` forward. Hitting the dish wall bounces it with a random
   heading. Moving into a cell that already holds `maxPerCell` particles is blocked,
   and the particle turns away. This crowding rule is what makes the body spread
   instead of collapsing into a dot.
6. **Deposits** `depositAmount` of trail where it lands.
7. **Feeds or starves.** It pays `metabolism` every step. If the cell is inside a
   food node's feeding radius it gains `feedRate * attract` divided by the number
   of particles in that cell, and loses `toxinRate * toxicity`.
8. **Divides** if its energy reaches `divideEnergy` and a neighbouring cell has room.
   Energy is split between parent and child.
9. **Dies** if its energy hits zero.

After every particle has moved, the trail map blends each cell toward its 3x3 mean
by `diffusion` and multiplies everything by `1 - decay`.

## Two fields

The organism lives in two overlaid fields.

* **Trail** is the body. Particles write it and read it. It diffuses and decays.
  This is the only field drawn on screen.
* **Scent** is the food. It is rebuilt whenever the market refreshes: every node
  with positive `attract` adds a Gaussian bump of height `scentPeak * attract`
  reaching `attractReach * foodRadius` cells. It is static between refreshes and
  only hungry particles can smell it. It is never drawn.

Keeping them apart means what you see is protoplasm, not smell.

## Food

Every token on the dish is a food node. A node has a feeding radius, an `attract`
value and a `toxicity` value, both in `[0, 1]`, derived from the token's score.

* An attractive node emits scent and feeds particles inside its radius.
* A toxic node emits nothing. It only drains energy from particles standing on it.
* The nucleus in the middle is a weak permanent food node labelled CASH with a short
  scent reach. It keeps a small core alive and is where new particles are seeded if
  the population ever drops below `minAgents`.

Each node also has a catchment three times its feeding radius. Body-time inside
the catchment is what counts as "on" that token for allocation, so the halo of
satiated wanderers around a node counts, not just the saturated core.

## Why the network does what it does

**Strong opportunities grow thick branches.** Hungry particles home in on the
strongest scent they can smell. On a strong node they fill up fast, divide, and
leave satiated, laying trail outward. The children get hungry, come back, and the
cycle repeats. More cycles means more trail, and more trail pulls more traffic.
In a fixed two-node test the full-strength node holds several times the body of
a half-strength node.

**Weak opportunities grow thin branches.** Food in a cell is shared and a weak node
refills particles slowly, so fewer particles cycle through it and its halo is
small. Below roughly `metabolism / feedRate` attract a node cannot sustain a full
cell at all.

**Bad opportunities prune.** When a node's score goes negative it stops emitting
scent and starts draining energy. Particles on it die, the trail toward it
evaporates in a few dozen steps, and the branch disappears.

**Nothing is remembered.** When the market changes, the only memory the organism
has is the trail map itself, which fades at `decay` per step. The body is always
a recent-past answer to "where is the food?".

## Reading the dish

* Bright yellow: thick, busy trail. Many particles pass here.
* Dim ochre: faint or fading trail. Explorers or an abandoned branch.
* White ring: an attractive token. Thicker ring means higher score.
* Red ring with a cross: a toxic token.
* Dashed ring: the nucleus (cash).
* Percent under a token: share of body-time the organism spends in that token's
  catchment, which is also its paper-portfolio weight.

## Reference

Jones, J. (2010). Characteristics of pattern formation and evolution in
approximations of Physarum transport networks. Artificial Life 16(2), 127-153.
