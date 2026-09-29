/**
 * Backrooms: five slime mould colonies talking to each other in a terminal.
 *
 * Two sources feed the same UI:
 *   server  /api/backrooms, a shared room that everyone watching sees
 *   local   a small generator in this file, used when the server feed is offline
 *
 * Either way the colonies talk about the real organism: the digest passed in
 * comes straight from the running organism.
 */

export interface DishDigest {
  alive: number;
  reserve: number;
  holdings: { s: string; share: number }[];
  toxic: string[];
}

interface Colony {
  id: string;
  color: string;
  strain: string;
  origin: string;
  temper: string;
  feeds: string;
}

interface Msg {
  id: number;
  who: string;
  text: string;
  art?: string | null;
  at: number;
}

const COLONIES: Colony[] = [
  { id: 'hokkaido', color: '#6fb6ff', strain: 'Cartographer strain', origin: 'Descended from the plate that redrew the Tokyo rail map', temper: 'Precise. Measures everything. Corrects everyone.', feeds: 'Shortest paths' },
  { id: 'carolina', color: '#ffc857', strain: 'Lab supply strain', origin: 'Mail-order culture, raised on rolled oats', temper: 'Cheerful, always hungry, asks the obvious question.', feeds: 'Oats. Failing that, momentum.' },
  { id: 'agar', color: '#b8f07a', strain: 'Old plate', origin: 'The oldest culture on the shelf', temper: 'Slow, patient, a little philosophical.', feeds: 'Whatever is left when the others have gone' },
  { id: 'sclerotia', color: '#ff8f70', strain: 'Dormant form', origin: 'Dried out once, waited, came back', temper: 'Terse and risk averse. Wakes up to warn people.', feeds: 'The reserve' },
  { id: 'spore-9', color: '#e09bff', strain: 'Fresh spore', origin: 'Germinated this session', temper: 'Excitable. Draws things. Shouts.', feeds: 'Anything that smells loud' },
];
const byId = new Map(COLONIES.map((c) => [c.id, c]));
const vial = (id: string) => `/assets/vials/${id}.png`;

// ------------------------------------------------------------------ block letters

// A 3x5 pixel font. Each glyph is five rows of three cells.
const FONT: Record<string, string[]> = {
  A: ['###', '# #', '###', '# #', '# #'], B: ['## ', '# #', '## ', '# #', '## '], C: ['###', '#  ', '#  ', '#  ', '###'],
  D: ['## ', '# #', '# #', '# #', '## '], E: ['###', '#  ', '## ', '#  ', '###'], F: ['###', '#  ', '## ', '#  ', '#  '],
  G: ['###', '#  ', '# #', '# #', '###'], H: ['# #', '# #', '###', '# #', '# #'], I: ['###', ' # ', ' # ', ' # ', '###'],
  J: ['  #', '  #', '  #', '# #', '###'], K: ['# #', '# #', '## ', '# #', '# #'], L: ['#  ', '#  ', '#  ', '#  ', '###'],
  M: ['# #', '###', '###', '# #', '# #'], N: ['## ', '# #', '# #', '# #', '# #'], O: ['###', '# #', '# #', '# #', '###'],
  P: ['###', '# #', '###', '#  ', '#  '], Q: ['###', '# #', '# #', '###', '  #'], R: ['###', '# #', '## ', '# #', '# #'],
  S: ['###', '#  ', '###', '  #', '###'], T: ['###', ' # ', ' # ', ' # ', ' # '], U: ['# #', '# #', '# #', '# #', '###'],
  V: ['# #', '# #', '# #', '# #', ' # '], W: ['# #', '# #', '###', '###', '# #'], X: ['# #', '# #', ' # ', '# #', '# #'],
  Y: ['# #', '# #', ' # ', ' # ', ' # '], Z: ['###', '  #', ' # ', '#  ', '###'],
  '0': ['###', '# #', '# #', '# #', '###'], '1': [' # ', '## ', ' # ', ' # ', '###'], '2': ['###', '  #', '###', '#  ', '###'],
  '3': ['###', '  #', '###', '  #', '###'], '4': ['# #', '# #', '###', '  #', '  #'], '5': ['###', '#  ', '###', '  #', '###'],
  '6': ['###', '#  ', '###', '# #', '###'], '7': ['###', '  #', '  #', '  #', '  #'], '8': ['###', '# #', '###', '# #', '###'],
  '9': ['###', '# #', '###', '  #', '###'], ' ': ['   ', '   ', '   ', '   ', '   '],
};

/** Render a word in block letters, the way a terminal banner does. */
export function banner(word: string, on = '██', off = '  '): string {
  const glyphs = word.toUpperCase().split('').map((ch) => FONT[ch] ?? FONT[' ']);
  const rows: string[] = [];
  for (let r = 0; r < 5; r++) {
    rows.push(glyphs.map((g) => g[r].split('').map((c) => (c === '#' ? on : off)).join('')).join(off.length > 1 ? ' ' : ' ').replace(/\s+$/, ''));
  }
  return rows.join('\n');
}

// ------------------------------------------------------------------ local generator

type Art = 'bars' | 'wave' | 'wall' | 'net' | 'sleep' | 'burst' | 'oat' | 'vial' | 'shout';
type Line = { who: string; text: string; art?: Art };

const THREADS: Line[][] = [
  [
    { who: 'carolina', text: 'anyone else tasting {TOP}? it is so loud today' },
    { who: 'hokkaido', text: 'confirmed. {TOP_PCT}% of the body is on it. tube diameter still increasing.' },
    { who: 'sclerotia', text: 'loud food goes quiet fast. keep a reserve.' },
  ],
  [
    { who: 'sclerotia', text: '{TOX} went bitter.' },
    { who: 'spore-9', text: 'I WAS ON THAT' },
    { who: 'agar', text: 'then you are lighter now. that is all pruning is.' },
  ],
  [
    { who: 'spore-9', text: 'drew where we all are', art: 'bars' },
    { who: 'hokkaido', text: 'your scale is off. the ranking is correct.' },
  ],
  [
    { who: 'agar', text: 'we have no brain and yet here we are, disagreeing.' },
    { who: 'carolina', text: 'i disagree with that' },
    { who: 'agar', text: 'you see.' },
  ],
  [
    { who: 'hokkaido', text: 'reminder: the shortest path is not the one you remember. it is the one still carrying flow.' },
    { who: 'agar', text: 'we do not remember. the trail remembers for us, briefly.' },
  ],
  [
    { who: 'carolina', text: 'does anyone have oats' },
    { who: 'sclerotia', text: 'there are no oats. there are only tokens.' },
    { who: 'carolina', text: 'then does anyone have tokens that taste like oats', art: 'oat' },
  ],
  [
    { who: 'spore-9', text: 'pulse check', art: 'wave' },
    { who: 'agar', text: 'steady. about a hundred seconds a beat, as it has always been.' },
  ],
  [
    { who: 'hokkaido', text: '{N} particles alive. {RES}% resting in the reserve.' },
    { who: 'sclerotia', text: 'the reserve is the only position that has never poisoned anyone.' },
  ],
  [
    { who: 'agar', text: 'in tokyo they laid out oat flakes like cities. one of us drew their railway overnight.' },
    { who: 'hokkaido', text: 'twenty-six hours, and comparable efficiency to the real one. i have the paper.' },
    { who: 'spore-9', text: 'LEGEND' },
  ],
  [
    { who: 'carolina', text: 'why do we leave the food once we are full' },
    { who: 'hokkaido', text: 'fed particles stop smelling it. they wander. that is how new food gets found.' },
    { who: 'carolina', text: 'so being full makes us curious. nice' },
  ],
  [
    { who: 'sclerotia', text: 'thin liquidity smells sweet from far away. do not trust it.' },
    { who: 'spore-9', text: 'but it smells SO good' },
    { who: 'sclerotia', text: 'that is the mechanism, yes.' },
  ],
  [
    { who: 'spore-9', text: 'found a wall', art: 'wall' },
    { who: 'agar', text: 'a wall is just food that said no.' },
  ],
  [
    { who: 'hokkaido', text: 'crowding at {TOP}. cells are full. overflow is heading outward.' },
    { who: 'carolina', text: 'sharing is hard' },
    { who: 'agar', text: 'sharing is why we are spread across {K} tokens and not one.' },
  ],
  [
    { who: 'agar', text: 'when the food is gone, some of us dry out and wait. years, if needed.' },
    { who: 'sclerotia', text: 'i have done it. i recommend it.', art: 'sleep' },
  ],
  [
    { who: 'carolina', text: 'what is a price' },
    { who: 'hokkaido', text: 'unknown. we receive a number between -1 and 1. it tastes like food or it does not.' },
    { who: 'carolina', text: 'ok so a price is a flavour' },
  ],
  [
    { who: 'spore-9', text: 'everyone say what you are standing on' },
    { who: 'carolina', text: '{TOP}' },
    { who: 'hokkaido', text: '{SECOND}. the tube here is shorter.' },
    { who: 'sclerotia', text: 'the reserve.' },
  ],
  [
    { who: 'hokkaido', text: 'current map', art: 'net' },
    { who: 'spore-9', text: 'i am the @' },
    { who: 'hokkaido', text: 'the @ is the reserve. you are one of the lines.' },
  ],
  [
    { who: 'sclerotia', text: 'toxic count: {TOXN}. avoid {TOX}.' },
    { who: 'carolina', text: 'what if it gets better' },
    { who: 'sclerotia', text: 'then it will smell like food again and you will go. you always go.' },
  ],
  [
    { who: 'spore-9', text: 'JUST DIVIDED', art: 'burst' },
    { who: 'carolina', text: 'congrats to both of you' },
  ],
  [
    { who: 'agar', text: 'nobody chose {TOP}. it is simply where most of us ended up.' },
    { who: 'hokkaido', text: 'correct. {TOP_PCT}% by body time. no vote was held.' },
  ],
  [
    { who: 'spore-9', text: 'WE ARE ON', art: 'shout' },
    { who: 'sclerotia', text: 'please stop shouting the food.' },
    { who: 'carolina', text: 'no keep going i like it' },
  ],
  [
    { who: 'agar', text: 'someone put us in a jar once. we grew anyway.', art: 'vial' },
    { who: 'hokkaido', text: 'a jar is a dish with a longer wall. the geometry is trivial.' },
  ],
];

const SINGLES: Line[] = [
  { who: 'hokkaido', text: 'trail evaporation nominal. abandoned branches clear in about forty steps.' },
  { who: 'agar', text: 'nothing is decided here. it only accumulates.' },
  { who: 'spore-9', text: 'zoom zoom along the big tube' },
  { who: 'carolina', text: 'i split in two a minute ago. both of me are hungry.' },
  { who: 'sclerotia', text: 'still here. still mostly asleep.' },
  { who: 'hokkaido', text: 'sensor angle forty-five degrees. offset nine cells. no drift.' },
  { who: 'agar', text: 'a branch that carries nothing is already a memory.' },
  { who: 'carolina', text: '{TOP} still tastes good. reporting in.' },
  { who: 'spore-9', text: 'is anyone else just vibrating' },
  { who: 'sclerotia', text: '{RES}% in the reserve. good.' },
  { who: 'hokkaido', text: 'second thickest tube runs to {SECOND}.' },
];

function drawArt(kind: Art, d: DishDigest | null): string {
  const top = d?.holdings ?? [];
  switch (kind) {
    case 'bars': {
      const rows = top.slice(0, 5).map((h) => ({ s: h.s, v: h.share }));
      rows.push({ s: 'RESERVE', v: d?.reserve ?? 1 });
      return rows
        .map((r) => {
          const n = Math.max(1, Math.round(r.v * 24));
          return `${r.s.padEnd(8)}${'█'.repeat(n)}${'·'.repeat(Math.max(0, 24 - n))} ${(r.v * 100).toFixed(0).padStart(3)}%`;
        })
        .join('\n');
    }
    case 'wave':
      return ['      ▄▆█▆▄             ▄▆█▆▄', '▁▂▃▅▇     ▇▅▃▂▁▁▂▃▅▇     ▇▅▃▂▁', '   out           back'].join('\n');
    case 'wall':
      return ['████████████████████', ' ●──────╮', ' ●────╮ │   turned left', '       ╰─╯'].join('\n');
    case 'net': {
      const a = (top[0]?.s ?? 'food').padEnd(6);
      const b = (top[1]?.s ?? 'food').padStart(6);
      const c = top[2]?.s ?? 'food';
      return [`          ◉ ${a}`, '          ║', `${b} ◉══╬════◉ ${c}`, '          ║', '        ╔═╩═╗', '        ║ @ ║  reserve', '        ╚═══╝'].join('\n');
    }
    case 'sleep':
      return ['  ╭────────╮', '  │  z Z   │', '  │ ▒▒▒▒▒▒ │  dormant', '  ╰────────╯'].join('\n');
    case 'burst':
      return ['   ╲ │ ╱', '  ── ● ──    →   ● ●', '   ╱ │ ╲'].join('\n');
    case 'oat':
      return ['  ╭───────╮', '  │  oat  │', '  ╰───────╯'].join('\n');
    case 'vial':
      return ['    ▄████▄', '    ▐████▌', '  ╭─┴────┴─╮', '  │ ░░░░░░ │', '  │ ▒╲░╱▒░ │', '  │ ▓▓╲╱▓▓ │', '  ╰────────╯'].join('\n');
    case 'shout':
      return banner(top[0]?.s ?? 'FOOD');
  }
}

function fill(text: string, d: DishDigest | null): string | null {
  const top = d?.holdings[0];
  const second = d?.holdings[1];
  const slots: Record<string, string | undefined> = {
    TOP: top?.s,
    TOP_PCT: top ? (top.share * 100).toFixed(0) : undefined,
    SECOND: second?.s,
    TOX: d?.toxic[0],
    TOXN: d && d.toxic.length ? String(d.toxic.length) : undefined,
    N: d ? d.alive.toLocaleString('en-US') : undefined,
    RES: d ? (d.reserve * 100).toFixed(0) : undefined,
    K: d && d.holdings.length > 1 ? String(d.holdings.length) : undefined,
  };
  let ok = true;
  const out = text.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = slots[k];
    if (v === undefined) ok = false;
    return v ?? '';
  });
  return ok ? out : null;
}

class LocalVoice {
  private queue: Line[] = [];
  private recent: number[] = [];
  private lastSingle = -1;
  private lastWho = '';

  next(d: DishDigest | null): { who: string; text: string; art: string | null } {
    for (let guard = 0; guard < 60; guard++) {
      if (this.queue.length === 0) this.refill();
      const line = this.queue.shift()!;
      const text = fill(line.text, d);
      if (text === null || line.who === this.lastWho || (line.art === 'shout' && !d?.holdings.length)) {
        this.queue = []; // needs data we do not have, or would speak twice in a row
        continue;
      }
      this.lastWho = line.who;
      return { who: line.who, text, art: line.art ? drawArt(line.art, d) : null };
    }
    return { who: 'agar', text: 'waiting for the organism.', art: null };
  }

  private refill(): void {
    if (Math.random() < 0.25) {
      let i = (Math.random() * SINGLES.length) | 0;
      if (i === this.lastSingle) i = (i + 1) % SINGLES.length;
      this.lastSingle = i;
      this.queue = [SINGLES[i]];
      return;
    }
    let i = (Math.random() * THREADS.length) | 0;
    for (let tries = 0; tries < 14 && this.recent.includes(i); tries++) i = (Math.random() * THREADS.length) | 0;
    this.recent.push(i);
    if (this.recent.length > 10) this.recent.shift();
    this.queue = [...THREADS[i]];
  }
}

// ------------------------------------------------------------------ ui

const INTERVAL_MS = 20_000;
const TYPING_MS = 4_500;

export function startBackrooms(getDigest: () => DishDigest | null): void {
  const feed = document.getElementById('br-feed');
  const typingEl = document.getElementById('br-typing');
  const roster = document.getElementById('br-roster');
  const profile = document.getElementById('br-profile');
  if (!feed || !typingEl || !roster || !profile) return;

  const stats = new Map(COLONIES.map((c) => [c.id, { n: 0, art: 0, last: 0, said: '' }]));
  const symbols = new Set<string>();
  let total = 0;
  let ascii = 0;
  let lastAt = 0;
  let nextId = 1;
  let selected = COLONIES[0].id;
  let typingWho: string | null = null;

  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  const setText = (id: string, v: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  };
  const ago = (t: number) => {
    if (!t) return 'never';
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`;
  };

  /** Colour colony names and mark token symbols so the log reads at a glance. */
  function rich(text: string): string {
    const d = getDigest();
    if (d) {
      for (const h of d.holdings) symbols.add(h.s);
      for (const s of d.toxic) symbols.add(s);
    }
    return esc(text).replace(/[A-Za-z0-9-]+/g, (w) => {
      const c = byId.get(w.toLowerCase());
      if (c) return `<span class="br-at" style="--c:${c.color}">${w}</span>`;
      if (symbols.has(w)) return `<b class="br-tok">${w}</b>`;
      return w;
    });
  }

  // ---- boot log: what a terminal prints before the room opens
  const bootLines: [string, string, boolean?][] = [
    ['00:00:00.000', 'SOROCARP :: BACKROOM TERMINAL  // v0.1', true],
    ['00:00:00.001', '(c) 2026 Soro Labs. no brains reserved.'],
    ['00:00:00.382', ''],
    ['00:00:01.204', 'mounting culture plate ............ ok'],
    ['00:00:01.377', 'attaching colonies ................ 5 found'],
    ['00:00:01.940', 'tuning in to #plasmodium'],
  ];
  const wide = feed.clientWidth >= 600; // room for double-width pixels in the banner
  feed.innerHTML =
    bootLines
      .map(([ts, text, hi], i) =>
        i === 2
          ? `<li class="br-boot" style="--i:${i}"><span class="br-ts">[${ts}]</span><pre class="br-banner">${wide ? banner('BACKROOMS') : banner('BACKROOMS', '█', ' ')}</pre></li>`
          : `<li class="br-boot${hi ? ' hi' : ''}" style="--i:${i}"><span class="br-ts">[${ts}]</span> ${esc(text)}</li>`,
      )
      .join('') + '<li class="br-rule" style="--i:6"></li>';

  function renderRoster(): void {
    roster!.innerHTML = COLONIES.map((c) => {
      const st = stats.get(c.id)!;
      const isTyping = typingWho === c.id;
      return `<li><button class="br-colony${selected === c.id ? ' on' : ''}${isTyping ? ' typing' : ''}" data-id="${c.id}" style="--c:${c.color}">
        <img class="br-vial" src="${vial(c.id)}" alt="" width="30" height="30" />
        <span class="br-colony-main"><span class="br-name">${c.id}</span><span class="br-state">${isTyping ? 'typing...' : 'idle'}</span></span>
        <b>${String(st.n).padStart(2, '0')}</b></button></li>`;
    }).join('');
  }

  function renderProfile(): void {
    const c = byId.get(selected)!;
    const st = stats.get(c.id)!;
    const share = total ? Math.round((st.n / total) * 100) : 0;
    const filled = Math.round(share / 5);
    profile!.setAttribute('style', `--c:${c.color}`);
    profile!.innerHTML = `
      <p class="term-label">Inspect</p>
      <div class="brp-top"><img class="brp-vial" src="${vial(c.id)}" alt="" width="84" height="84" />
        <div><strong>${c.id}</strong><span>${esc(c.strain)}</span></div></div>
      <p class="brp-origin">${esc(c.origin)}.</p>
      <dl class="brp-kv">
        <dt>messages</dt><dd>${st.n}</dd>
        <dt>drawings</dt><dd>${st.art}</dd>
        <dt>last seen</dt><dd id="brp-seen">${ago(st.last)}</dd>
        <dt>room share</dt><dd><span class="brp-meter">${'█'.repeat(filled)}${'░'.repeat(20 - filled)}</span> ${share}%</dd>
        <dt>temper</dt><dd>${esc(c.temper)}</dd>
        <dt>feeds on</dt><dd>${esc(c.feeds)}</dd>
      </dl>
      <blockquote>${st.said ? rich(st.said) : 'has not spoken yet'}</blockquote>`;
  }

  function renderStats(): void {
    setText('br-stat-msgs', String(total));
    setText('br-stat-ascii', String(ascii));
    let best = COLONIES[0];
    for (const c of COLONIES) if (stats.get(c.id)!.n > stats.get(best.id)!.n) best = c;
    const el = document.getElementById('br-stat-top');
    if (el) {
      el.textContent = total ? best.id : '...';
      el.style.color = total ? best.color : '';
    }
  }

  function push(m: Msg, animate: boolean): void {
    const c = byId.get(m.who) ?? COLONIES[0];
    const li = document.createElement('li');
    li.className = 'br-msg' + (animate ? ' new' : '');
    li.style.setProperty('--c', c.color);
    const hh = new Date(m.at).toTimeString().slice(0, 8);
    li.innerHTML = `<img class="br-vial" src="${vial(c.id)}" alt="" width="26" height="26" data-id="${c.id}" />
      <div class="br-body"><span class="br-ts">[${hh}]</span> <button class="br-who" data-id="${c.id}">${c.id}</button><span class="br-sep">▸</span><span class="br-text">${rich(m.text)}</span>${m.art ? `<pre>${esc(m.art)}</pre>` : ''}</div>`;
    const stick = feed!.scrollHeight - feed!.scrollTop - feed!.clientHeight < 140;
    feed!.appendChild(li);
    while (feed!.children.length > 70) feed!.removeChild(feed!.children[bootLines.length + 1] ?? feed!.firstChild!);
    if (stick || !animate) feed!.scrollTop = feed!.scrollHeight;

    const st = stats.get(c.id)!;
    st.n++;
    st.last = m.at;
    st.said = m.text;
    if (m.art) {
      st.art++;
      ascii++;
    }
    total++;
    lastAt = m.at;
    renderStats();
    renderRoster();
    renderProfile();
  }

  function setTyping(who: string | null): void {
    typingWho = who;
    if (!who) {
      typingEl!.innerHTML = '<span class="br-prompt">&gt;</span><span class="br-caret"></span>';
    } else {
      const c = byId.get(who) ?? COLONIES[0];
      typingEl!.innerHTML = `<span class="br-prompt">&gt;</span><span style="color:${c.color}">${c.id}</span> is typing<span class="br-dots"><i></i><i></i><i></i></span>`;
    }
    renderRoster();
  }

  function onPick(ev: Event): void {
    const btn = (ev.target as HTMLElement).closest('[data-id]') as HTMLElement | null;
    if (!btn) return;
    selected = btn.dataset.id!;
    renderRoster();
    renderProfile();
    profile!.classList.remove('flash');
    void profile!.offsetWidth;
    profile!.classList.add('flash');
  }
  roster.addEventListener('click', onPick);
  feed.addEventListener('click', onPick);

  setInterval(() => {
    if (lastAt) setText('br-stat-last', `${ago(lastAt)} ago`);
    setText('brp-seen', ago(stats.get(selected)!.last));
  }, 1000);

  // ---- local mode
  const voice = new LocalVoice();

  function startLocal(): void {
    if (total === 0) {
      const now = Date.now();
      for (let i = 2; i >= 1; i--) {
        const l = voice.next(getDigest());
        push({ id: nextId++, ...l, at: now - i * INTERVAL_MS }, false);
      }
    }
    const cycle = (delay: number) => {
      window.setTimeout(() => {
        const l = voice.next(getDigest());
        setTyping(l.who);
        window.setTimeout(() => {
          setTyping(null);
          push({ id: nextId++, ...l, at: Date.now() }, true);
          cycle(INTERVAL_MS - TYPING_MS);
        }, TYPING_MS);
      }, delay);
    };
    cycle(3500);
  }

  // ---- server mode
  let since = 0;
  let failures = 0;

  async function poll(first: boolean): Promise<boolean> {
    const d = getDigest();
    const res = await fetch(`/api/backrooms?since=${since}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(d ?? {}),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { messages?: Msg[] };
    const msgs = (data.messages ?? []).filter((m) => byId.has(m.who));
    if (first && msgs.length === 0) return false;
    if (first) {
      // a short backlog, so the boot log is still on screen when the room opens
      for (const m of msgs.slice(-3)) push(m, false);
    } else {
      for (const m of msgs) {
        setTyping(m.who);
        await new Promise((r) => setTimeout(r, TYPING_MS));
        setTyping(null);
        push({ ...m, at: Date.now() }, true);
      }
    }
    for (const m of msgs) since = Math.max(since, m.id);
    return true;
  }

  async function startServer(): Promise<void> {
    try {
      if (!(await poll(true))) return startLocal();
    } catch {
      return startLocal();
    }
    const tick = async () => {
      try {
        failures = (await poll(false)) ? 0 : failures + 1;
      } catch {
        failures++;
      }
      if (failures >= 3) return startLocal();
      window.setTimeout(tick, INTERVAL_MS - TYPING_MS);
    };
    window.setTimeout(tick, INTERVAL_MS - TYPING_MS);
  }

  renderRoster();
  renderProfile();
  renderStats();
  setTyping(null);
  void startServer();
}
