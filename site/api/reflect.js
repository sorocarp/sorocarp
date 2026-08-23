/**
 * POST /api/reflect
 *
 * The narrator. Takes a small, validated digest of what the organism's body is
 * doing right now and returns one or two sentences describing it.
 *
 * The narrator only reads the dish. It has no way to influence the simulation:
 * the organism's decisions are made by the particle rules in src/sim.
 *
 * Needs ANTHROPIC_API_KEY in the environment. Without it the endpoint answers
 * 503 and the site carries on with its locally generated notes.
 */
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-5-5';
const MAX_PER_MINUTE = Number(process.env.REFLECT_MAX_PER_MINUTE || 4);
const CACHE_MS = 45_000;
const PER_IP_MS = 20_000;

const SYSTEM = `You are the narrator for Sorocarp, a live experiment in which a simulated slime mould (Physarum polycephalum) grows across a dish of crypto tokens. Each token is a food source whose strength is a market score between -1 and 1: positive is food, negative is poison. The organism has no brain and makes no decisions. Particles follow chemical gradients, feed, divide and starve, and the share of its body sitting on each token is its position in that token. Body not on any token is resting in the reserve.

You are given a snapshot of the dish and write a field note for visitors watching it live. They should come away understanding what the body is doing right now and why, in terms of the biology.

Write one or two sentences, at most 45 words in total. Present tense, third person ("the organism", "it", "the body"). Be concrete: name the tokens and use the figures you are given. Explain behaviour through food, scent, starvation, tubes and branches rather than through intention, because the organism does not want or think anything.

This is a description of a simulation, so do not give advice, do not predict prices, and do not mention profit, returns or money. Plain prose only: no lists, no markdown, no emojis, no hashtags, no quotation marks around the note.`;

const SYMBOL = /^[A-Z0-9]{1,10}$/;
const EVENT = /^(toxic|recovered|contact|grow|shrink|pruned|top|scent):[A-Z0-9]{1,10}$|^(body:up|body:down|reserve:high)$/;

const cache = new Map(); // signature -> { text, at }
const lastByIp = new Map(); // ip -> ms
let windowStart = 0;
let windowCount = 0;
let client = null;

const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);

/** Returns a clean digest or null. Nothing from the request reaches the prompt unvalidated. */
function parseDigest(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const body = num(raw.body, 0, 1_000_000);
  const reserve = num(raw.reserve, 0, 1);
  if (body === null || reserve === null) return null;
  if (!Array.isArray(raw.holdings) || raw.holdings.length > 6) return null;
  const holdings = [];
  for (const h of raw.holdings) {
    if (!h || typeof h.s !== 'string' || !SYMBOL.test(h.s)) return null;
    const share = num(h.share, 0, 1);
    const score = num(h.score, -1, 1);
    const d1h = num(h.d1h, -100, 1000);
    if (share === null || score === null || d1h === null) return null;
    holdings.push({ s: h.s, share, score, d1h });
  }
  const toxic = Array.isArray(raw.toxic) ? raw.toxic.filter((s) => typeof s === 'string' && SYMBOL.test(s)).slice(0, 6) : [];
  const events = Array.isArray(raw.events) ? raw.events.filter((e) => typeof e === 'string' && EVENT.test(e)).slice(-5) : [];
  return { body: Math.round(body), reserve, holdings, toxic, events };
}

function describe(d) {
  const lines = [`Body: ${d.body} particles. In the reserve or wandering: ${(d.reserve * 100).toFixed(0)}% of the body.`];
  if (d.holdings.length === 0) {
    lines.push('The body is not established on any token yet.');
  } else {
    lines.push('Body on tokens, largest first:');
    for (const h of d.holdings) {
      lines.push(`- ${h.s}: ${(h.share * 100).toFixed(1)}% of the body, food score ${h.score.toFixed(2)}, price over the last hour ${h.d1h >= 0 ? '+' : ''}${h.d1h.toFixed(1)}%`);
    }
  }
  lines.push(d.toxic.length ? `Currently toxic tokens: ${d.toxic.join(', ')}.` : 'No token is toxic right now.');
  if (d.events.length) lines.push(`Recent events, oldest first: ${d.events.join(', ')}.`);
  lines.push('Write the field note.');
  return lines.join('\n');
}

const signature = (d) => `${d.holdings.slice(0, 3).map((h) => `${h.s}${Math.round(h.share * 10)}`).join('|')}#${d.toxic.join(',')}#${d.events.slice(-1)[0] ?? ''}`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'narrator offline' });

  const digest = parseDigest(typeof req.body === 'string' ? safeJson(req.body) : req.body);
  if (!digest) return res.status(400).json({ error: 'invalid digest' });

  const now = Date.now();
  const sig = signature(digest);
  const hit = cache.get(sig);
  if (hit && now - hit.at < CACHE_MS) return res.status(200).json({ text: hit.text, cached: true });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (now - (lastByIp.get(ip) || 0) < PER_IP_MS) return res.status(429).json({ error: 'slow down' });
  if (now - windowStart > 60_000) {
    windowStart = now;
    windowCount = 0;
  }
  if (windowCount >= MAX_PER_MINUTE) return res.status(429).json({ error: 'narrator is busy' });
  windowCount++;
  lastByIp.set(ip, now);
  if (lastByIp.size > 5000) lastByIp.clear();

  try {
    client ??= new Anthropic();
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: SYSTEM,
      messages: [{ role: 'user', content: describe(digest) }],
    });
    if (response.stop_reason === 'refusal') return res.status(502).json({ error: 'narrator declined' });

    let text = '';
    for (const block of response.content) if (block.type === 'text') text += block.text;
    text = text.replace(/\s+/g, ' ').trim().slice(0, 360);
    if (!text) return res.status(502).json({ error: 'empty note' });

    cache.set(sig, { text, at: now });
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    return res.status(200).json({ text });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return res.status(503).json({ error: 'narrator offline' });
    if (error instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'narrator is busy' });
    if (error instanceof Anthropic.APIError) return res.status(502).json({ error: `upstream ${error.status ?? ''}`.trim() });
    return res.status(500).json({ error: 'narrator failed' });
  }
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
