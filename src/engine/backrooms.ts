/**
 * Backrooms: five colonies of the same species talking about the organism.
 *
 * This is the built-in voice. It is a small grammar of conversation threads
 * with slots that are filled from the live state, so the colonies always talk
 * about real tokens and real figures. Nobody speaks twice in a row, threads
 * are not repeated back to back, and about one message in five carries
 * terminal art.
 */

export interface Colony {
  id: string;
  color: string;
  strain: string;
  origin: string;
  temper: string;
  feeds: string;
}

export interface ChatDigest {
  alive: number;
  reserve: number;
  holdings: { s: string; share: number }[];
  toxic: string[];
}

export interface ChatMessage {
  id: number;
  who: string;
  text: string;
  art: string | null;
  at: number;
}

export const COLONIES: Colony[] = [
  { id: 'hokkaido', color: '#6fb6ff', strain: 'Cartographer strain', origin: 'Descended from the plate that redrew the Tokyo rail map', temper: 'Precise. Measures everything. Corrects everyone.', feeds: 'Shortest paths' },
  { id: 'carolina', color: '#ffc857', strain: 'Lab supply strain', origin: 'Mail-order culture, raised on rolled oats', temper: 'Cheerful, always hungry, asks the obvious question.', feeds: 'Oats. Failing that, momentum.' },
  { id: 'agar', color: '#b8f07a', strain: 'Old plate', origin: 'The oldest culture on the shelf', temper: 'Slow, patient, a little philosophical.', feeds: 'Whatever is left when the others have gone' },
  { id: 'sclerotia', color: '#ff8f70', strain: 'Dormant form', origin: 'Dried out once, waited, came back', temper: 'Terse and risk averse. Wakes up to warn people.', feeds: 'The reserve' },
  { id: 'spore-9', color: '#e09bff', strain: 'Fresh spore', origin: 'Germinated this session', temper: 'Excitable. Draws things. Shouts.', feeds: 'Anything that smells loud' },
];

// ------------------------------------------------------------------ block letters

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
    rows.push(glyphs.map((g) => g[r].split('').map((c) => (c === '#' ? on : off)).join('')).join(' ').replace(/\s+$/, ''));
  }
  return rows.join('\n');
}

// ------------------------------------------------------------------ the grammar

type Art = 'bars' | 'wave' | 'wall' | 'net' | 'sleep' | 'burst' | 'oat' | 'vial' | 'shout';
interface Line {
  who: string;
  text: string;
  art?: Art;
}

const THREADS: Line[][] = [
  [{ who: 'carolina', text: 'anyone else tasting {TOP}? it is so loud today' }, { who: 'hokkaido', text: 'confirmed. {TOP_PCT}% of the body is on it. tube diameter still increasing.' }, { who: 'sclerotia', text: 'loud food goes quiet fast. keep a reserve.' }],
  [{ who: 'sclerotia', text: '{TOX} went bitter.' }, { who: 'spore-9', text: 'I WAS ON THAT' }, { who: 'agar', text: 'then you are lighter now. that is all pruning is.' }],
  [{ who: 'spore-9', text: 'drew where we all are', art: 'bars' }, { who: 'hokkaido', text: 'your scale is off. the ranking is correct.' }],
  [{ who: 'agar', text: 'we have no brain and yet here we are, disagreeing.' }, { who: 'carolina', text: 'i disagree with that' }, { who: 'agar', text: 'you see.' }],
  [{ who: 'hokkaido', text: 'reminder: the shortest path is not the one you remember. it is the one still carrying flow.' }, { who: 'agar', text: 'we do not remember. the trail remembers for us, briefly.' }],
  [{ who: 'carolina', text: 'does anyone have oats' }, { who: 'sclerotia', text: 'there are no oats. there are only tokens.' }, { who: 'carolina', text: 'then does anyone have tokens that taste like oats', art: 'oat' }],
  [{ who: 'spore-9', text: 'pulse check', art: 'wave' }, { who: 'agar', text: 'steady. about a hundred seconds a beat, as it has always been.' }],
  [{ who: 'hokkaido', text: '{N} particles alive. {RES}% resting in the reserve.' }, { who: 'sclerotia', text: 'the reserve is the only position that has never poisoned anyone.' }],
  [{ who: 'agar', text: 'in tokyo they laid out oat flakes like cities. one of us drew their railway overnight.' }, { who: 'hokkaido', text: 'twenty-six hours, and comparable efficiency to the real one. i have the paper.' }, { who: 'spore-9', text: 'LEGEND' }],
  [{ who: 'carolina', text: 'why do we leave the food once we are full' }, { who: 'hokkaido', text: 'fed particles stop smelling it. they wander. that is how new food gets found.' }, { who: 'carolina', text: 'so being full makes us curious. nice' }],
  [{ who: 'sclerotia', text: 'thin liquidity smells sweet from far away. do not trust it.' }, { who: 'spore-9', text: 'but it smells SO good' }, { who: 'sclerotia', text: 'that is the mechanism, yes.' }],
  [{ who: 'spore-9', text: 'found a wall', art: 'wall' }, { who: 'agar', text: 'a wall is just food that said no.' }],
  [{ who: 'hokkaido', text: 'crowding at {TOP}. cells are full. overflow is heading outward.' }, { who: 'carolina', text: 'sharing is hard' }, { who: 'agar', text: 'sharing is why we are spread across {K} tokens and not one.' }],
  [{ who: 'agar', text: 'when the food is gone, some of us dry out and wait. years, if needed.' }, { who: 'sclerotia', text: 'i have done it. i recommend it.', art: 'sleep' }],
  [{ who: 'carolina', text: 'what is a price' }, { who: 'hokkaido', text: 'unknown. we receive a number between -1 and 1. it tastes like food or it does not.' }, { who: 'carolina', text: 'ok so a price is a flavour' }],
  [{ who: 'spore-9', text: 'everyone say what you are standing on' }, { who: 'carolina', text: '{TOP}' }, { who: 'hokkaido', text: '{SECOND}. the tube here is shorter.' }, { who: 'sclerotia', text: 'the reserve.' }],
  [{ who: 'hokkaido', text: 'current map', art: 'net' }, { who: 'spore-9', text: 'i am the @' }, { who: 'hokkaido', text: 'the @ is the reserve. you are one of the lines.' }],
  [{ who: 'sclerotia', text: 'toxic count: {TOXN}. avoid {TOX}.' }, { who: 'carolina', text: 'what if it gets better' }, { who: 'sclerotia', text: 'then it will smell like food again and you will go. you always go.' }],
  [{ who: 'spore-9', text: 'JUST DIVIDED', art: 'burst' }, { who: 'carolina', text: 'congrats to both of you' }],
  [{ who: 'agar', text: 'nobody chose {TOP}. it is simply where most of us ended up.' }, { who: 'hokkaido', text: 'correct. {TOP_PCT}% by body time. no vote was held.' }],
  [{ who: 'spore-9', text: 'WE ARE ON', art: 'shout' }, { who: 'sclerotia', text: 'please stop shouting the food.' }, { who: 'carolina', text: 'no keep going i like it' }],
  [{ who: 'agar', text: 'someone put us in a jar once. we grew anyway.', art: 'vial' }, { who: 'hokkaido', text: 'a jar is a dish with a longer wall. the geometry is trivial.' }],
  [{ who: 'hokkaido', text: 'order filed: {SIDE} {ORDER_SYM}. the book follows the body, not the other way round.' }, { who: 'carolina', text: 'what is an order' }, { who: 'hokkaido', text: 'a note that says where the mass already went.' }],
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

export function drawArt(kind: Art, d: ChatDigest | null): string {
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
      return ['█'.repeat(20), ' ●──────╮', ' ●────╮ │   turned left', '       ╰─╯'].join('\n');
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

export interface ChatContext extends ChatDigest {
  /** The most recent paper order, if any, so the colonies can gossip about it. */
  lastOrder?: { side: 'buy' | 'sell'; symbol: string } | null;
}

function fill(text: string, d: ChatContext | null): string | null {
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
    SIDE: d?.lastOrder?.side,
    ORDER_SYM: d?.lastOrder?.symbol,
  };
  let ok = true;
  const out = text.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = slots[k];
    if (v === undefined) ok = false;
    return v ?? '';
  });
  return ok ? out : null;
}

/** A seedable generator of colony chatter. */
export class Backrooms {
  readonly log: ChatMessage[] = [];
  private queue: Line[] = [];
  private recent: number[] = [];
  private lastSingle = -1;
  private lastWho = '';
  private nextId = 1;
  private readonly rng: () => number;

  constructor(rng: () => number = Math.random, readonly maxLog = 60) {
    this.rng = rng;
  }

  /** Produce the next message for the given state, record it, and return it. */
  next(d: ChatContext | null, at = Date.now()): ChatMessage {
    for (let guard = 0; guard < 60; guard++) {
      if (this.queue.length === 0) this.refill();
      const line = this.queue.shift()!;
      const text = fill(line.text, d);
      if (text === null || line.who === this.lastWho || (line.art === 'shout' && !d?.holdings.length)) {
        this.queue = []; // needs data we do not have, or would speak twice in a row
        continue;
      }
      this.lastWho = line.who;
      return this.push({ id: this.nextId++, who: line.who, text, art: line.art ? drawArt(line.art, d) : null, at });
    }
    return this.push({ id: this.nextId++, who: 'agar', text: 'waiting for the organism.', art: null, at });
  }

  private push(m: ChatMessage): ChatMessage {
    this.log.push(m);
    if (this.log.length > this.maxLog) this.log.shift();
    return m;
  }

  private refill(): void {
    if (this.rng() < 0.25) {
      let i = Math.floor(this.rng() * SINGLES.length);
      if (i === this.lastSingle) i = (i + 1) % SINGLES.length;
      this.lastSingle = i;
      this.queue = [SINGLES[i]];
      return;
    }
    let i = Math.floor(this.rng() * THREADS.length);
    for (let tries = 0; tries < 14 && this.recent.includes(i); tries++) i = Math.floor(this.rng() * THREADS.length);
    this.recent.push(i);
    if (this.recent.length > 10) this.recent.shift();
    this.queue = [...THREADS[i]];
  }
}
