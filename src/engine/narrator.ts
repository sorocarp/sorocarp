/**
 * Narrator: a language model that reads the organism and describes it.
 *
 * It is given a small digest (body, reserve, holdings with scores, toxic
 * tokens, recent events) and returns one or two sentences. It has no way to
 * touch the organism; it only talks. Optional: without an API key in the
 * environment the narrator is simply not created.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { OrganismState } from './organism.js';

export interface NarratorOptions {
  model: string;
  /** Do not call the model more often than this. */
  minIntervalMs: number;
}

const SYSTEM = `You are the narrator for Sorocarp, a slime mould (Physarum polycephalum) that grows across a plate of crypto tokens. Each token is a food source whose strength is a market score between -1 and 1: positive is food, negative is poison. The organism has no brain and makes no decisions. Particles follow chemical gradients, feed, divide and starve, and the share of its body sitting on each token is its position in that token. Body not on any token is resting in the reserve. The book is paper.

You are given a snapshot and write a field note for people watching. They should come away understanding what the body is doing right now and why, in terms of the biology.

Write one or two sentences, at most 45 words in total. Present tense, third person ("the organism", "it", "the body"). Be concrete: name the tokens and use the figures you are given. Explain behaviour through food, scent, starvation, tubes and branches rather than intention, because the organism does not want or think anything.

Do not give advice, predict prices, or mention profit, returns or money. Plain prose only: no lists, no markdown, no emojis, no quotation marks.`;

export interface Narration {
  text: string;
  at: number;
}

export class Narrator {
  readonly opts: NarratorOptions;
  private client: Anthropic;
  private lastAt = 0;
  private inflight = false;

  constructor(opts: Partial<NarratorOptions> = {}, client = new Anthropic()) {
    this.opts = { model: 'claude-opus-5-5', minIntervalMs: 45_000, ...opts };
    this.client = client;
  }

  /** True when a key is available to the SDK. */
  static available(env: NodeJS.ProcessEnv = process.env): boolean {
    return Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
  }

  static describe(s: OrganismState, events: string[]): string {
    const held = s.tokens.filter((t) => t.share >= 0.01).slice(0, 6);
    const lines = [`Body: ${s.alive} particles. In the reserve or wandering: ${(s.cashShare * 100).toFixed(0)}% of the body.`];
    if (held.length === 0) lines.push('The body is not established on any token yet.');
    else {
      lines.push('Body on tokens, largest first:');
      for (const t of held) lines.push(`- ${t.symbol}: ${(t.share * 100).toFixed(1)}% of the body, food score ${t.score.total.toFixed(2)}, price over the last hour ${t.priceChange1hPct >= 0 ? '+' : ''}${t.priceChange1hPct.toFixed(1)}%`);
    }
    const toxic = s.tokens.filter((t) => t.toxicity > 0).map((t) => t.symbol);
    lines.push(toxic.length ? `Currently toxic tokens: ${toxic.join(', ')}.` : 'No token is toxic right now.');
    if (events.length) lines.push(`Recent events, oldest first: ${events.join(', ')}.`);
    lines.push('Write the field note.');
    return lines.join('\n');
  }

  /** Returns a narration, or null if it is too soon, already running, or the model declined. */
  async reflect(s: OrganismState, events: string[], now = Date.now()): Promise<Narration | null> {
    if (this.inflight || now - this.lastAt < this.opts.minIntervalMs) return null;
    this.inflight = true;
    this.lastAt = now;
    try {
      const response = await this.client.beta.messages.create({
        model: this.opts.model,
        max_tokens: 2000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low' },
        system: SYSTEM,
        messages: [{ role: 'user', content: Narrator.describe(s, events) }],
      });
      if (response.stop_reason === 'refusal') return null;
      let text = '';
      for (const block of response.content) if (block.type === 'text') text += block.text;
      text = text.replace(/\s+/g, ' ').trim().slice(0, 360);
      return text ? { text, at: now } : null;
    } finally {
      this.inflight = false;
    }
  }
}
