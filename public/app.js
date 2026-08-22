/**
 * Physarum client.
 *
 * Receives binary trail frames and JSON state over a WebSocket and paints them.
 * No framework, no build step: this file is served as-is.
 */

const BIN_TRAIL = 0x01;
const BIN_AGENTS = 0x02;

const $ = (id) => document.getElementById(id);
const trailCanvas = $('trail');
const overlay = $('overlay');
const spark = $('spark');
const sparkTip = $('spark-tip');
const caption = $('caption');

const trailCtx = trailCanvas.getContext('2d');
const overlayCtx = overlay.getContext('2d');
const sparkCtx = spark.getContext('2d');

let width = 256;
let height = 256;
let imageData = trailCtx.createImageData(width, height);
let state = null;
let agents = null;
let showAgents = false;
let ws = null;

// Colour LUT: dark surface to slime yellow. Built once per page.
const LUT = buildLut();
function buildLut() {
  const stops = [
    [0, [9, 10, 13]],
    [40, [38, 36, 24]],
    [120, [120, 102, 40]],
    [200, [214, 184, 70]],
    [255, [250, 232, 150]],
  ];
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    let a = stops[0];
    let b = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s++) {
      if (i >= stops[s][0] && i <= stops[s + 1][0]) {
        a = stops[s];
        b = stops[s + 1];
        break;
      }
    }
    const t = a[0] === b[0] ? 0 : (i - a[0]) / (b[0] - a[0]);
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = a[1][c] + (b[1][c] - a[1][c]) * t;
  }
  return lut;
}

// ---------------------------------------------------------------- transport

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => {
    caption.textContent = 'live';
    if (showAgents) send({ type: 'agents', on: true });
  };
  ws.onclose = () => {
    caption.textContent = 'disconnected, retrying';
    setTimeout(connect, 1500);
  };
  ws.onmessage = (ev) => {
    if (typeof ev.data === 'string') {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'hello') {
        resize(msg.width, msg.height);
        applyState(msg.state);
      } else if (msg.type === 'state') {
        applyState(msg.state);
      }
      return;
    }
    const bytes = new Uint8Array(ev.data);
    if (bytes[0] === BIN_TRAIL) paintTrail(bytes.subarray(1));
    else if (bytes[0] === BIN_AGENTS) {
      agents = new Uint16Array(ev.data, 0, 0); // placeholder, replaced below
      const body = ev.data.slice(1);
      agents = new Uint16Array(body);
      paintOverlay();
    }
  };
}

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function resize(w, h) {
  width = w;
  height = h;
  trailCanvas.width = w;
  trailCanvas.height = h;
  imageData = trailCtx.createImageData(w, h);
}

// ---------------------------------------------------------------- painting

function paintTrail(trail) {
  const px = imageData.data;
  for (let i = 0, j = 0; i < trail.length; i++, j += 4) {
    const k = trail[i] * 3;
    px[j] = LUT[k];
    px[j + 1] = LUT[k + 1];
    px[j + 2] = LUT[k + 2];
    px[j + 3] = 255;
  }
  trailCtx.putImageData(imageData, 0, 0);
  if (!showAgents) paintOverlay();
}

function paintOverlay() {
  const W = overlay.width;
  const H = overlay.height;
  const sx = W / width;
  const sy = H / height;
  const ctx = overlayCtx;
  ctx.clearRect(0, 0, W, H);
  if (!state) return;

  if (showAgents && agents) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < agents.length; i += 2) {
      ctx.fillRect(agents[i] * sx, agents[i + 1] * sy, 1.5, 1.5);
    }
  }

  ctx.font = '500 12px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Nucleus
  const n = state.nucleus;
  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = 'rgba(230,232,235,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(n.x * sx, n.y * sy, n.radius * sx, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(163,168,179,0.9)';
  ctx.fillText('CASH', n.x * sx, (n.y + n.radius + 7) * sy);

  // Tokens
  for (const t of state.tokens) {
    const x = t.x * sx;
    const y = t.y * sy;
    const r = t.radius * sx;
    const toxic = t.toxicity > 0;
    const strength = toxic ? t.toxicity : t.attract;
    ctx.lineWidth = toxic ? 1 : 1 + strength * 1.5;
    ctx.strokeStyle = toxic
      ? `rgba(224,112,95,${0.35 + strength * 0.55})`
      : `rgba(230,232,235,${0.25 + strength * 0.6})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    if (toxic) {
      ctx.beginPath();
      ctx.moveTo(x - r * 0.5, y - r * 0.5);
      ctx.lineTo(x + r * 0.5, y + r * 0.5);
      ctx.moveTo(x + r * 0.5, y - r * 0.5);
      ctx.lineTo(x - r * 0.5, y + r * 0.5);
      ctx.stroke();
    }
    ctx.fillStyle = toxic ? 'rgba(224,112,95,0.9)' : 'rgba(230,232,235,0.92)';
    ctx.fillText(t.symbol, x, y - r - 9);
    ctx.fillStyle = 'rgba(163,168,179,0.85)';
    ctx.font = '400 11px Inter, system-ui, sans-serif';
    ctx.fillText(`${(t.share * 100).toFixed(1)}%`, x, y + r + 9);
    ctx.font = '500 12px Inter, system-ui, sans-serif';
  }
}

// ---------------------------------------------------------------- state

function applyState(s) {
  state = s;
  $('s-alive').textContent = fmtInt(s.alive);
  $('s-step').textContent = fmtInt(s.step);
  $('s-births').textContent = s.birthsPerSec.toFixed(0);
  $('s-deaths').textContent = s.deathsPerSec.toFixed(0);
  $('p-source').textContent = s.marketSource === 'mock' ? 'mock market' : `${s.marketSource} live`;

  const p = s.portfolio;
  $('p-value').textContent = fmtUsd(p.value);
  const ret = $('p-return');
  ret.textContent = fmtPct(p.returnPct);
  ret.className = 'hero-delta ' + (p.returnPct >= 0 ? 'up' : 'down');
  $('p-bench').textContent = fmtPct(p.benchmarkReturnPct);
  $('a-cash').textContent = `${(s.cashShare * 100).toFixed(1)}%`;

  renderAllocation(s.tokens);
  renderSpark(p.history, p.startingCapital);
  $('btn-pause').textContent = s.paused ? 'Resume' : 'Pause';
  $('sel-speed').value = String(s.stepsPerSecond);
  caption.textContent = s.paused ? 'paused' : 'live';
  paintOverlay();
}

function renderAllocation(tokens) {
  const body = $('alloc-body');
  const rows = tokens.map((t) => {
    const score = t.score.total;
    const w = Math.min(42, Math.abs(score) * 42);
    const bar = score >= 0 ? `<i class="score-bar pos" style="width:${w}px"></i>` : `<i class="score-bar neg" style="width:${w}px"></i>`;
    const pctClass = t.priceChange1hPct >= 0 ? 'up' : 'down';
    return `<tr class="${t.toxicity > 0 ? 'toxic' : ''}" title="${escapeHtml(t.name)} ${fmtPrice(t.priceUsd)}">
      <td class="sym">${escapeHtml(t.symbol)}</td>
      <td><div class="score" title="score ${score.toFixed(2)}">${bar}</div></td>
      <td class="num share">${(t.share * 100).toFixed(1)}%</td>
      <td class="num pct ${pctClass}">${fmtPct(t.priceChange1hPct)}</td>
    </tr>`;
  });
  body.innerHTML = rows.join('');
}

// ---------------------------------------------------------------- sparkline

let sparkPoints = [];
function renderSpark(history, base) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = spark.clientWidth || 320;
  const cssH = 72;
  if (spark.width !== cssW * dpr) {
    spark.width = cssW * dpr;
    spark.height = cssH * dpr;
  }
  const ctx = sparkCtx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  sparkPoints = history;
  if (history.length < 2) {
    ctx.strokeStyle = '#22262f';
    ctx.beginPath();
    ctx.moveTo(0, cssH / 2);
    ctx.lineTo(cssW, cssH / 2);
    ctx.stroke();
    return;
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const h of history) {
    lo = Math.min(lo, h.value, h.benchmark);
    hi = Math.max(hi, h.value, h.benchmark);
  }
  if (hi - lo < base * 0.002) {
    const mid = (hi + lo) / 2;
    lo = mid - base * 0.001;
    hi = mid + base * 0.001;
  }
  const pad = 4;
  const xAt = (i) => (i / (history.length - 1)) * (cssW - 1);
  const yAt = (v) => pad + (1 - (v - lo) / (hi - lo)) * (cssH - pad * 2);

  // Baseline at starting capital, if in range.
  if (base >= lo && base <= hi) {
    ctx.strokeStyle = '#22262f';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, yAt(base));
    ctx.lineTo(cssW, yAt(base));
    ctx.stroke();
  }

  const line = (key, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    history.forEach((h, i) => (i === 0 ? ctx.moveTo(xAt(i), yAt(h[key])) : ctx.lineTo(xAt(i), yAt(h[key]))));
    ctx.stroke();
  };
  line('benchmark', '#8f96a3');
  line('value', '#f2d35b');
}

spark.addEventListener('mousemove', (ev) => {
  if (sparkPoints.length < 2) return;
  const rect = spark.getBoundingClientRect();
  const i = Math.round(((ev.clientX - rect.left) / rect.width) * (sparkPoints.length - 1));
  const h = sparkPoints[Math.max(0, Math.min(sparkPoints.length - 1, i))];
  sparkTip.hidden = false;
  sparkTip.style.left = `${ev.clientX - rect.left}px`;
  sparkTip.textContent = `organism ${fmtUsd(h.value)}  equal weight ${fmtUsd(h.benchmark)}`;
});
spark.addEventListener('mouseleave', () => (sparkTip.hidden = true));

// ---------------------------------------------------------------- controls

$('btn-pause').addEventListener('click', () => send({ type: state && state.paused ? 'resume' : 'pause' }));
$('btn-reset').addEventListener('click', () => send({ type: 'reset' }));
$('sel-speed').addEventListener('change', (e) => send({ type: 'speed', value: Number(e.target.value) }));
$('chk-agents').addEventListener('change', (e) => {
  showAgents = e.target.checked;
  if (!showAgents) agents = null;
  send({ type: 'agents', on: showAgents });
  paintOverlay();
});

// ---------------------------------------------------------------- format

function fmtInt(n) {
  return n.toLocaleString('en-US');
}
function fmtUsd(v) {
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(v) {
  return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
}
function fmtPrice(v) {
  if (v >= 1) return '$' + v.toFixed(2);
  if (v >= 0.01) return '$' + v.toFixed(4);
  return '$' + v.toPrecision(3);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

connect();
