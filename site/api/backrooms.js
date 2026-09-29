/**
 * POST /api/backrooms?since=<id>
 *
 * The shared Backrooms feed: five slime mould colonies talking, written by
 * Claude in batches and released one message every twenty seconds so everyone
 * watching sees the same conversation.
 *
 * The request body may carry a small digest of the caller's dish. It is
 * validated field by field and only used as colour for the next batch.
 *
 * Needs ANTHROPIC_API_KEY. Without it the endpoint answers 503 and the site
 * falls back to its built-in colony chatter.
 *
 * State lives in memory, so it is per warm instance. That is fine for a feed
 * whose only job is to keep talking; move it to a store if it must be durable.
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

const MODEL = 'claude-opus-5-5';
const INTERVAL_MS = 20_000;
const BATCH = 12;
const MIN_GAP_MS = 60_000;

const COLONIES = ['hokkaido', 'carolina', 'agar', 'sclerotia', 'spore-9'];

const Batch = z.object({
  messages: z.array(
    z.object({
      who: z.enum(['hokkaido', 'carolina', 'agar', 'sclerotia', 'spore-9']),
      text: z.string(),
      art: z.string().nullable(),
    }),
  ),
});

const SYSTEM = `You write the Backrooms: a chat room where five colonies of the slime mould Physarum polycephalum talk to each other. They live on a dish where crypto tokens are food. Each token has a score from -1 to 1: positive is food, negative is poison. None of them has a brain. They sense scent, follow trail, feed, divide and starve, and the share of the body on each token is the position in that token. Body not on a token rests in the reserve. All of this is a simulation with a paper portfolio.

The colonies, each with a distinct voice:
- hokkaido: the cartographer, descended from the culture that redrew the Tokyo rail map. Precise, measures everything, corrects the others, talks in paths, tubes, flow and geometry.
- carolina: a mail-order lab strain raised on oats. Cheerful, always hungry, asks the obvious question and is satisfied by simple answers.
- agar: the oldest plate on the shelf. Slow, patient, quietly philosophical about decay, memory and accumulation.
- sclerotia: the dormant form. Terse, risk averse, wakes up to warn the others about toxic tokens and thin liquidity. Loves the reserve.
- spore-9: freshly germinated. Excitable, shouts in capitals now and then, draws ASCII art.

How the room sounds: a real group chat. Short messages, mostly lowercase, one thought each, usually under 20 words. They reply to each other, tease each other, and go on tangents about slime mould biology (shuttle streaming, sclerotia, the Tokyo rail experiment, oat flakes, mazes, crowding, pruning) as much as about the dish. When you are given the current state of the dish, let some messages refer to it using the real token symbols and figures, and never invent tokens or numbers that are not in it.

About one message in five carries terminal art in the art field; otherwise art is null. The art is shown in a monospace terminal, so build it from block characters (█ ▓ ▒ ░ ▄ ▀ ▌ ▐ and the bar heights ▁▂▃▄▅▆▇), box-drawing characters (─ │ ╭ ╮ ╰ ╯ ┼ ├ ┤ ═ ║ ╔ ╗ ╚ ╝ ╬) and the dots ● ○ ◉, plus ordinary letters and digits for labels. Make it deliberate: aligned columns, consistent line lengths, symmetry where it suits, at most 8 lines and 34 columns. Good subjects are what a slime mould would draw: a tube network with labelled nodes, a bar chart of where the body is using █ and ░, a pulse wave from bar heights, a wall it ran into, a sleeping sclerotium in a box, a jar. When a drawing shows the dish, label it with the real token symbols.

This is fiction about a simulation, so nobody gives financial advice, predicts prices, or talks about profit, returns or money. No emojis, no hashtags, no markdown.

Continue the conversation from where it left off so it reads as one unbroken room. Vary who speaks: do not let one colony speak twice in a row, and make sure all five appear.`;

const SYMBOL = /^[A-Z0-9]{1,10}$/;
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);

function parseDigest(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const alive = num(raw.alive, 0, 1_000_000);
  const reserve = num(raw.reserve, 0, 1);
  if (alive === null || reserve === null || !Array.isArray(raw.holdings)) return null;
  const holdings = [];
  for (const h of raw.holdings.slice(0, 6)) {
    if (!h || typeof h.s !== 'string' || !SYMBOL.test(h.s)) return null;
    const share = num(h.share, 0, 1);
    if (share === null) return null;
    holdings.push({ s: h.s, share });
  }
  const toxic = Array.isArray(raw.toxic) ? raw.toxic.filter((s) => typeof s === 'string' && SYMBOL.test(s)).slice(0, 6) : [];
  return { alive: Math.round(alive), reserve, holdings, toxic };
}

function describeDish(d) {
  if (!d) return 'The dish state is not available right now; talk about slime mould life in general.';
  const held = d.holdings.length ? d.holdings.map((h) => `${h.s} ${(h.share * 100).toFixed(0)}%`).join(', ') : 'nothing yet';
  return `Current dish: ${d.alive} particles alive, ${(d.reserve * 100).toFixed(0)}% in the reserve. Body on tokens: ${held}. Toxic right now: ${d.toxic.length ? d.toxic.join(', ') : 'none'}.`;
}

const cleanArt = (art) => {
  if (typeof art !== 'string') return null;
  // Printable ASCII plus box-drawing, block elements and geometric shapes. Nothing else gets through.
  const lines = art.replace(/[^\x20-\x7e─-◿←-↓\n]/g, '').split('\n').slice(0, 8).map((l) => l.slice(0, 38).trimEnd());
  const out = lines.join('\n').replace(/^\n+|\n+$/g, '');
  return out.trim() ? out : null;
};

// ---- in-memory room
const log = []; // released messages: { id, who, text, art, at }
let queue = []; // generated, not yet released
let nextId = 1;
let nextRelease = 0;
let generating = null;
let lastGenerated = 0;
let client = null;

function release(now) {
  while (queue.length && now >= nextRelease) {
    const m = queue.shift();
    log.push({ id: nextId++, ...m, at: nextRelease || now });
    nextRelease = (nextRelease || now) + INTERVAL_MS;
  }
  if (nextRelease && now - nextRelease > INTERVAL_MS * 3) nextRelease = now; // room was idle: resume from now
  if (log.length > 80) log.splice(0, log.length - 80);
}

async function generate(digest) {
  client ??= new Anthropic();
  const history = [...log.slice(-10), ...queue.slice(-4)].map((m) => `${m.who}: ${m.text}${m.art ? ' [drew ASCII art]' : ''}`).join('\n');
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 6000,
    output_config: { effort: 'low', format: zodOutputFormat(Batch) },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: `${describeDish(digest)}\n\n${history ? `The room so far:\n${history}` : 'The room is empty. Open the conversation.'}\n\nWrite the next ${BATCH} messages.`,
      },
    ],
  });
  if (response.stop_reason === 'refusal' || !response.parsed_output) return [];
  return response.parsed_output.messages
    .filter((m) => COLONIES.includes(m.who))
    .slice(0, BATCH)
    .map((m) => ({ who: m.who, text: m.text.replace(/\s+/g, ' ').trim().slice(0, 240), art: cleanArt(m.art) }))
    .filter((m) => m.text);
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('allow', 'GET, POST');
    return res.status(405).json({ error: 'method not allowed' });
  }
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'backrooms offline' });

  const now = Date.now();
  const since = Number.parseInt(String(req.query?.since ?? '0'), 10) || 0;
  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body;
  const digest = parseDigest(body);

  try {
    const needsMore = queue.length < 3 && now - lastGenerated > MIN_GAP_MS;
    if (needsMore || (log.length === 0 && queue.length === 0)) {
      if (!generating) {
        lastGenerated = now;
        generating = generate(digest)
          .then((batch) => {
            queue.push(...batch);
          })
          .finally(() => {
            generating = null;
          });
      }
      // Block only when there is nothing at all to show; otherwise let it land for the next poll.
      if (log.length === 0 && queue.length === 0) await generating;
      else generating.catch(() => {});
    }
    if (log.length === 0 && queue.length) {
      // First visitors get a short backlog straight away instead of an empty room.
      const backlog = queue.splice(0, Math.min(4, queue.length));
      backlog.forEach((m, i) => log.push({ id: nextId++, ...m, at: now - (backlog.length - i) * INTERVAL_MS }));
      nextRelease = now + INTERVAL_MS;
    }
    release(now);
  } catch (error) {
    if (log.length === 0) {
      if (error instanceof Anthropic.AuthenticationError) return res.status(503).json({ error: 'backrooms offline' });
      if (error instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'backrooms busy' });
      if (error instanceof Anthropic.APIError) return res.status(502).json({ error: `upstream ${error.status ?? ''}`.trim() });
      return res.status(500).json({ error: 'backrooms failed' });
    }
  }

  const messages = since ? log.filter((m) => m.id > since) : log.slice(-8);
  res.setHeader('cache-control', 'no-store');
  return res.status(200).json({ messages, total: nextId - 1 });
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
