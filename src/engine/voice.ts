/**
 * Voice: the organism log.
 *
 * Compares the body now with the body a moment ago and says the most important
 * thing that changed, in the organism's own terms: first contact, a tube
 * thickening, a token turning bitter, a branch gone. No model is involved; it
 * is a diff with a vocabulary.
 */
import type { OrganismState } from './organism.js';

export interface Note {
  at: number;
  /** Machine-readable event, e.g. `contact:JTO`, `toxic:BONK`, `body:down`. */
  code: string;
  text: string;
}

interface Memory {
  share: Map<string, number>;
  toxic: Map<string, boolean>;
  met: Set<string>;
  top: string | null;
  alive: number;
}

interface Candidate {
  p: number;
  code: string;
  text: string;
}

const fmtInt = (n: number) => n.toLocaleString('en-US');

export class OrganismVoice {
  readonly notes: Note[] = [];
  readonly maxNotes: number;
  private memory: Memory | null = null;
  private lastAt = 0;
  private readonly rng: () => number;

  constructor(rng: () => number = Math.random, maxNotes = 50) {
    this.rng = rng;
    this.maxNotes = maxNotes;
  }

  private pick<T>(xs: T[]): T {
    return xs[Math.floor(this.rng() * xs.length)];
  }

  reset(): void {
    this.memory = null;
    this.notes.length = 0;
    this.lastAt = 0;
  }

  /** Event codes of the most recent notes, oldest first. */
  recentCodes(n = 5): string[] {
    return this.notes.slice(0, n).map((x) => x.code).reverse();
  }

  /**
   * Look at the state and maybe say something. Returns the note if one was
   * added. Quiet for at least `minGapMs` between notes so the log reads as a
   * log and not as a firehose.
   */
  observe(s: OrganismState, now = Date.now(), minGapMs = 2600): Note | null {
    const top = s.tokens.find((t) => t.share >= 0.03) ?? null;
    if (!this.memory) {
      this.memory = { share: new Map(), toxic: new Map(), met: new Set(), top: null, alive: s.alive };
      for (const t of s.tokens) {
        this.memory.share.set(t.address, t.share);
        this.memory.toxic.set(t.address, t.toxicity > 0);
      }
      return this.add('inoculated', 'Inoculated. Spreading out from the reserve, tasting for food.', now);
    }
    const m = this.memory;
    const found: Candidate[] = [];
    const met: string[] = [];
    const unmet: string[] = [];
    const pick = (xs: string[]) => this.pick(xs);

    for (const t of s.tokens) {
      const was = m.share.get(t.address) ?? 0;
      const wasToxic = m.toxic.get(t.address) ?? false;
      const isToxic = t.toxicity > 0;
      const pct = (t.share * 100).toFixed(t.share >= 0.1 ? 0 : 1);

      if (isToxic && !wasToxic) {
        found.push({ p: 9, code: `toxic:${t.symbol}`, text: pick([`${t.symbol} has turned bitter. Letting that branch starve.`, `${t.symbol} tastes wrong now. Nothing there is worth the energy.`, `Poison at ${t.symbol}. Whatever is standing on it will not last.`]) });
      } else if (!isToxic && wasToxic) {
        found.push({ p: 6, code: `recovered:${t.symbol}`, text: pick([`${t.symbol} smells like food again.`, `The bitterness at ${t.symbol} has cleared.`]) });
      }
      if (!m.met.has(t.address) && t.share >= 0.012) {
        met.push(t.address);
        found.push({ p: 8, code: `contact:${t.symbol}`, text: pick([`First contact with ${t.symbol}. Feeding.`, `Found ${t.symbol}. Sending more of myself that way.`, `A tendril reached ${t.symbol}. It is good.`]) });
      } else if (t.share - was >= 0.035) {
        found.push({ p: 5, code: `grow:${t.symbol}`, text: pick([`Thickening the tube to ${t.symbol}. ${pct}% of the body is there.`, `${t.symbol} keeps feeding me. ${pct}% and growing.`, `More mass toward ${t.symbol}: ${pct}%.`]) });
      } else if (was - t.share >= 0.035 && t.share >= 0.005) {
        found.push({ p: 5, code: `shrink:${t.symbol}`, text: pick([`Pulling mass back from ${t.symbol}. Down to ${pct}%.`, `${t.symbol} is thinning out. ${pct}% left there.`]) });
      } else if (was >= 0.02 && t.share < 0.004) {
        unmet.push(t.address);
        found.push({ p: 7, code: `pruned:${t.symbol}`, text: pick([`The branch to ${t.symbol} is gone.`, `Nothing left at ${t.symbol}. The trail has faded.`]) });
      }
    }
    if (top && top.address !== m.top) {
      found.push({ p: 7, code: `top:${top.symbol}`, text: pick([`${top.symbol} is now the largest part of me.`, `Most of the body has settled on ${top.symbol}.`]) });
    }
    if (s.alive > m.alive * 1.35 && s.alive > 2500) {
      found.push({ p: 4, code: 'body:up', text: pick([`Well fed. ${fmtInt(s.alive)} particles and dividing.`, `Growing. The body is ${fmtInt(s.alive)} strong.`]) });
    } else if (s.alive < m.alive * 0.7) {
      found.push({ p: 6, code: 'body:down', text: pick([`A lean stretch. Body down to ${fmtInt(s.alive)}.`, `Starving at the edges. ${fmtInt(s.alive)} particles remain.`]) });
    }

    const quiet = now - this.lastAt;
    if (found.length === 0 && quiet > 9000) {
      const best = [...s.tokens].sort((x, y) => y.attract - x.attract)[0];
      if (s.cashShare > 0.7) {
        found.push({ p: 1, code: 'reserve:high', text: pick(['Little worth eating. Most of me is resting in the reserve.', 'Waiting. The scent is weak everywhere.']) });
      } else if (best && best.attract > 0) {
        found.push({ p: 1, code: `scent:${best.symbol}`, text: pick([`Sampling the gradient. Strongest scent is ${best.symbol}.`, `Holding shape. ${best.symbol} smells richest.`, 'Circulating. Fed particles out, hungry ones back.']) });
      }
    }
    if (found.length === 0 || quiet < minGapMs) return null;

    found.sort((x, y) => y.p - x.p);
    const c = found.find((x) => x.text !== this.notes[0]?.text && x.text !== this.notes[1]?.text);
    if (!c) return null;

    // commit what the reader has now been told about
    for (const t of s.tokens) {
      m.share.set(t.address, t.share);
      m.toxic.set(t.address, t.toxicity > 0);
    }
    for (const a of met) m.met.add(a);
    for (const a of unmet) m.met.delete(a);
    m.top = top ? top.address : m.top;
    m.alive = s.alive;
    return this.add(c.code, c.text, now);
  }

  private add(code: string, text: string, at: number): Note {
    const note = { at, code, text };
    this.notes.unshift(note);
    if (this.notes.length > this.maxNotes) this.notes.pop();
    this.lastAt = at;
    return note;
  }
}
