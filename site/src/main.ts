/**
 * Sorocarp site.
 *
 * The real organism (src/sim, src/market, src/engine) runs in the page, out of
 * sight. Everything the visitor sees is read from it:
 *   - the specimen readouts in the hero
 *   - the book (positions, index)
 *   - the organism log and narrator
 *   - what the colonies talk about in the backrooms
 */
import defaults from '../../config/default.json';
import type { Config } from '../../src/config.js';
import { Organism, type OrganismState } from '../../src/engine/organism.js';
import { MockMarketSource } from '../../src/market/mock.js';
import { startBackrooms } from './backrooms.js';

// ------------------------------------------------------------------ organism

const cfg: Config = JSON.parse(JSON.stringify(defaults));
cfg.market.seed = (Date.now() % 100000) | 0;

const STEPS_PER_FRAME = 2;
const MARKET_EVERY_STEPS = 30;
const INK = '22,48,128';

const organism = new Organism(cfg, new MockMarketSource(cfg.market.seed, 1000));
let state: OrganismState | null = null;
let stepsSinceMarket = 0;
let refreshing = false;

async function refreshMarket(): Promise<void> {
  if (refreshing) return;
  refreshing = true;
  try {
    await organism.refreshMarket();
  } finally {
    refreshing = false;
  }
}

function loop(): void {
  requestAnimationFrame(loop);
  for (let i = 0; i < STEPS_PER_FRAME; i++) {
    organism.tick();
    if (++stepsSinceMarket >= MARKET_EVERY_STEPS) {
      stepsSinceMarket = 0;
      void refreshMarket();
    }
  }
  if (organism.sim.step % 12 === 0 || !state) {
    state = organism.state(STEPS_PER_FRAME * 60);
    renderBook();
  }
}

// ------------------------------------------------------------------ helpers

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};
const setText = (id: string, v: string) => {
  const el = document.getElementById(id);
  if (el && el.textContent !== v) el.textContent = v;
};
const fmtInt = (n: number) => n.toLocaleString('en-US');
const fmtPct = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// ------------------------------------------------------------------ chain read

// A live read of Solana mainnet. Polled every few seconds; between reads the
// slot is advanced at the measured rate so the counter ticks like the chain does.
const chain = { slot: 0, at: 0, rate: 2.5, height: 0, ok: false };

async function readChain(): Promise<void> {
  try {
    const res = await fetch('/api/chain', { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const c = (await res.json()) as { slot: number; blockHeight: number | null; epoch: number | null };
    const now = performance.now();
    if (chain.slot && c.slot > chain.slot) {
      const r = (c.slot - chain.slot) / ((now - chain.at) / 1000);
      if (r > 0.5 && r < 6) chain.rate = chain.rate * 0.6 + r * 0.4;
    }
    chain.slot = Math.max(chain.slot, c.slot);
    chain.at = now;
    chain.height = c.blockHeight ?? chain.height;
    chain.ok = true;
    if (c.epoch !== null) setText('sp-epoch', fmtInt(c.epoch));
  } catch {
    chain.ok = chain.slot > 0 && performance.now() - chain.at < 30000;
  }
  document.getElementById('sp-dot')?.classList.toggle('off', !chain.ok);
}

function tickChain(): void {
  setText('sp-time', `${new Date().toISOString().slice(11, 19)} UTC`);
  if (!chain.slot) {
    if (performance.now() > 9000) {
      setText('sp-slot', 'unreachable');
      setText('ex-slot', 'unreachable');
    }
    return;
  }
  const drift = Math.floor(Math.min(8, (performance.now() - chain.at) / 1000) * chain.rate);
  setText('sp-slot', fmtInt(chain.slot + drift));
  setText('ex-slot', fmtInt(chain.slot + drift));
  if (chain.height) setText('ex-height', fmtInt(chain.height + drift));
}
void readChain();
setInterval(() => void readChain(), 5000);
setInterval(tickChain, 200);

// ------------------------------------------------------------------ the book

function renderBook(): void {
  if (!state) return;
  const held = state.tokens.filter((t) => t.share >= 0.01);
  const index = (state.portfolio.value / state.portfolio.startingCapital) * 100;
  const bench = (state.portfolio.benchmark / state.portfolio.startingCapital) * 100;

  setText('sp-body', fmtInt(state.alive));
  setText('sp-positions', String(held.length));
  setText('st-body', fmtInt(state.alive));
  setText('st-positions', String(held.length));
  setText('st-reserve', `${(state.cashShare * 100).toFixed(0)}%`);
  setText('st-index', index.toFixed(2));

  setText('ix-value', index.toFixed(2));
  const d = $('ix-delta');
  d.textContent = fmtPct(index - 100);
  d.className = 'ix-delta ' + (index >= 100 ? 'up' : 'down');
  setText('ix-bench', bench.toFixed(2));

  $('book-body').innerHTML = state.tokens
    .map((t) => {
      const s = t.score.total;
      const sw = Math.min(36, Math.abs(s) * 36);
      const bar = s >= 0 ? `<i class="score-bar pos" style="width:${sw}px"></i>` : `<i class="score-bar neg" style="width:${sw}px"></i>`;
      const ww = Math.round(Math.min(1, t.share / 0.4) * 100);
      const tag = t.toxicity > 0 ? '<em class="tag tox">toxic</em>' : t.share >= 0.01 ? '<em class="tag held">held</em>' : '';
      return `<tr class="${t.toxicity > 0 ? 'toxic' : ''}${t.share < 0.005 ? ' flat' : ''}">
        <td class="sym"><span>${esc(t.symbol)}${tag}</span><small>${esc(t.name)}</small></td>
        <td class="weight"><span class="wbar"><i style="width:${ww}%"></i></span><b>${(t.share * 100).toFixed(1)}%</b></td>
        <td><div class="score">${bar}</div></td>
        <td class="num ${t.priceChange1hPct >= 0 ? 'up' : 'down'}">${fmtPct(t.priceChange1hPct)}</td>
      </tr>`;
    })
    .join('');
  setText('book-reserve', `${(state.cashShare * 100).toFixed(1)}%`);

  renderChart(state.portfolio.history, state.portfolio.startingCapital);
}

// ------------------------------------------------------------------ index chart

const chart = $<HTMLCanvasElement>('chart');
const chartCtx = chart.getContext('2d')!;
const chartTip = $('chart-tip');
let chartPoints: { t: number; value: number; benchmark: number }[] = [];
let chartBase = 1;

function renderChart(history: { t: number; value: number; benchmark: number }[], base: number): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = chart.clientWidth || 320;
  const cssH = 132;
  if (chart.width !== Math.round(cssW * dpr)) {
    chart.width = Math.round(cssW * dpr);
    chart.height = Math.round(cssH * dpr);
  }
  const c = chartCtx;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, cssW, cssH);
  chartPoints = history;
  chartBase = base;
  if (history.length < 2) return;
  let lo = base;
  let hi = base;
  for (const h of history) {
    lo = Math.min(lo, h.value, h.benchmark);
    hi = Math.max(hi, h.value, h.benchmark);
  }
  if (hi - lo < base * 0.004) {
    const mid = (hi + lo) / 2;
    lo = mid - base * 0.002;
    hi = mid + base * 0.002;
  }
  const pad = 8;
  const xAt = (i: number) => (i / (history.length - 1)) * (cssW - 1);
  const yAt = (v: number) => pad + (1 - (v - lo) / (hi - lo)) * (cssH - pad * 2);

  c.strokeStyle = `rgba(${INK},0.2)`;
  c.lineWidth = 1;
  c.setLineDash([2, 4]);
  c.beginPath();
  c.moveTo(0, yAt(base));
  c.lineTo(cssW, yAt(base));
  c.stroke();
  c.setLineDash([]);

  c.beginPath();
  history.forEach((h, i) => (i === 0 ? c.moveTo(xAt(i), yAt(h.value)) : c.lineTo(xAt(i), yAt(h.value))));
  c.lineTo(cssW, cssH);
  c.lineTo(0, cssH);
  c.closePath();
  c.fillStyle = `rgba(${INK},0.06)`;
  c.fill();

  const line = (key: 'value' | 'benchmark', color: string, width: number) => {
    c.strokeStyle = color;
    c.lineWidth = width;
    c.lineJoin = 'round';
    c.beginPath();
    history.forEach((h, i) => (i === 0 ? c.moveTo(xAt(i), yAt(h[key])) : c.lineTo(xAt(i), yAt(h[key]))));
    c.stroke();
  };
  line('benchmark', 'rgba(110,117,137,0.75)', 1.5);
  line('value', `rgb(${INK})`, 2);
}

chart.addEventListener('mousemove', (ev) => {
  if (chartPoints.length < 2) return;
  const rect = chart.getBoundingClientRect();
  const i = Math.round(((ev.clientX - rect.left) / rect.width) * (chartPoints.length - 1));
  const h = chartPoints[Math.max(0, Math.min(chartPoints.length - 1, i))];
  chartTip.hidden = false;
  chartTip.style.left = `${ev.clientX - rect.left}px`;
  chartTip.textContent = `organism ${((h.value / chartBase) * 100).toFixed(2)}  /  equal weight ${((h.benchmark / chartBase) * 100).toFixed(2)}`;
});
chart.addEventListener('mouseleave', () => (chartTip.hidden = true));

// ------------------------------------------------------------------ organism log

const logEl = $('notes');
const MAX_LOG = 6;
const log: { text: string; at: Date }[] = [];
const eventCodes: string[] = [];
let lastLogAt = 0;

function addLog(text: string): void {
  log.unshift({ text, at: new Date() });
  if (log.length > MAX_LOG) log.pop();
  lastLogAt = performance.now();
  logEl.innerHTML = log
    .map((n, i) => `<li class="${i === 0 ? 'fresh' : ''}" style="--age:${i}"><time>${n.at.toTimeString().slice(0, 8)}</time><p>${esc(n.text)}</p></li>`)
    .join('');
}

interface Memory {
  share: Map<string, number>;
  toxic: Map<string, boolean>;
  met: Set<string>;
  top: string | null;
  alive: number;
}
let memory: Memory | null = null;
const pick = <T>(xs: T[]): T => xs[(Math.random() * xs.length) | 0];

/** Compare the body against the last time we looked and say the most important thing that changed. */
function observe(): void {
  if (!state) return;
  const s = state;
  const top = s.tokens.find((t) => t.share >= 0.03) ?? null;
  if (!memory) {
    memory = { share: new Map(), toxic: new Map(), met: new Set(), top: null, alive: s.alive };
    for (const t of s.tokens) {
      memory.share.set(t.address, t.share);
      memory.toxic.set(t.address, t.toxicity > 0);
    }
    addLog('Inoculated. Spreading out from the reserve, tasting for food.');
    return;
  }
  const m = memory;
  const found: { p: number; text: string; code: string }[] = [];

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
      m.met.add(t.address);
      found.push({ p: 8, code: `contact:${t.symbol}`, text: pick([`First contact with ${t.symbol}. Feeding.`, `Found ${t.symbol}. Sending more of myself that way.`, `A tendril reached ${t.symbol}. It is good.`]) });
    } else if (t.share - was >= 0.035) {
      found.push({ p: 5, code: `grow:${t.symbol}`, text: pick([`Thickening the tube to ${t.symbol}. ${pct}% of the body is there.`, `${t.symbol} keeps feeding me. ${pct}% and growing.`, `More mass toward ${t.symbol}: ${pct}%.`]) });
    } else if (was - t.share >= 0.035 && t.share >= 0.005) {
      found.push({ p: 5, code: `shrink:${t.symbol}`, text: pick([`Pulling mass back from ${t.symbol}. Down to ${pct}%.`, `${t.symbol} is thinning out. ${pct}% left there.`]) });
    } else if (was >= 0.02 && t.share < 0.004) {
      m.met.delete(t.address);
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

  const quiet = performance.now() - lastLogAt;
  if (found.length === 0 && quiet > 9000) {
    const best = [...s.tokens].sort((x, y) => y.attract - x.attract)[0];
    if (s.cashShare > 0.7) {
      found.push({ p: 1, code: 'reserve:high', text: pick(['Little worth eating. Most of me is resting in the reserve.', 'Waiting. The scent is weak everywhere.']) });
    } else if (best && best.attract > 0) {
      found.push({ p: 1, code: `scent:${best.symbol}`, text: pick([`Sampling the gradient. Strongest scent is ${best.symbol}.`, `Holding shape. ${best.symbol} smells richest.`, 'Circulating. Fed particles out, hungry ones back.']) });
    }
  }
  if (found.length === 0 || quiet < 2600) return;

  found.sort((x, y) => y.p - x.p);
  const c = found.find((x) => x.text !== log[0]?.text && x.text !== log[1]?.text);
  if (!c) return;
  addLog(c.text);
  eventCodes.push(c.code);
  if (eventCodes.length > 6) eventCodes.shift();

  for (const t of s.tokens) {
    m.share.set(t.address, t.share);
    m.toxic.set(t.address, t.toxicity > 0);
  }
  m.top = top ? top.address : m.top;
  m.alive = s.alive;
}
setInterval(observe, 900);

// The narrator: a language model that reads the organism's state and describes it.
// It never touches the organism. If the endpoint is offline the log carries on without it.
let narratorCalls = 0;
let typing: number | null = null;

function showNarration(text: string): void {
  const el = $('narrator');
  if (typing !== null) clearInterval(typing);
  let shown = 0;
  el.classList.add('live');
  typing = window.setInterval(() => {
    shown = Math.min(text.length, shown + 2);
    el.textContent = text.slice(0, shown);
    if (shown >= text.length && typing !== null) {
      clearInterval(typing);
      typing = null;
      el.classList.remove('live');
    }
  }, 16);
  setText('narrator-time', new Date().toTimeString().slice(0, 8));
}

async function reflect(): Promise<void> {
  if (!state || document.hidden || narratorCalls >= 12) return;
  narratorCalls++;
  const s = state;
  const body = {
    body: s.alive,
    reserve: Number(s.cashShare.toFixed(3)),
    holdings: s.tokens
      .filter((t) => t.share >= 0.01)
      .slice(0, 6)
      .map((t) => ({ s: t.symbol, share: Number(t.share.toFixed(3)), score: Number(t.score.total.toFixed(2)), d1h: Number(t.priceChange1hPct.toFixed(2)) })),
    toxic: s.tokens.filter((t) => t.toxicity > 0).slice(0, 6).map((t) => t.symbol),
    events: eventCodes.slice(-5),
  };
  try {
    const res = await fetch('/api/reflect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) return;
    const data = (await res.json()) as { text?: string };
    if (data.text) showNarration(data.text);
  } catch {
    /* narrator offline */
  }
}
setTimeout(() => {
  void reflect();
  setInterval(() => void reflect(), 45000);
}, 12000);

// ------------------------------------------------------------------ page chrome

const nav = $('nav');
const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 24);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

const menuBtn = $('menu-btn');
menuBtn.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menuBtn.setAttribute('aria-expanded', String(open));
});
nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => nav.classList.remove('open')));

const reveal = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        reveal.unobserve(e.target);
      }
    }
  },
  { threshold: 0.08 },
);
document.querySelectorAll('.reveal').forEach((el) => reveal.observe(el));

setText('year', String(new Date().getFullYear()));

// ------------------------------------------------------------------ backrooms

startBackrooms(() => {
  if (!state) return null;
  return {
    alive: state.alive,
    reserve: Number(state.cashShare.toFixed(3)),
    holdings: state.tokens.filter((t) => t.share >= 0.01).slice(0, 6).map((t) => ({ s: t.symbol, share: Number(t.share.toFixed(3)) })),
    toxic: state.tokens.filter((t) => t.toxicity > 0).slice(0, 6).map((t) => t.symbol),
  };
});

// ------------------------------------------------------------------ go

void refreshMarket().then(() => requestAnimationFrame(loop));
