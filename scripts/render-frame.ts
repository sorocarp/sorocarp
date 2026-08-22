/**
 * Render the dish to a PNG without a browser.
 *
 *   npx tsx scripts/render-frame.ts [steps] [out.png]
 *
 * Runs the organism headless against the configured market source for the given
 * number of steps and writes the trail map through the same colour ramp the web
 * client uses. Handy for CI artefacts, READMEs and checking the sim without a UI.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { loadConfig } from '../src/config.js';
import { Organism } from '../src/engine/organism.js';
import { createMarketSource } from '../src/market/index.js';

const steps = Number(process.argv[2] ?? 3000);
const out = process.argv[3] ?? 'frame.png';
const SCALE = 3;

const STOPS: [number, [number, number, number]][] = [
  [0, [9, 10, 13]],
  [40, [38, 36, 24]],
  [120, [120, 102, 40]],
  [200, [214, 184, 70]],
  [255, [250, 232, 150]],
];

function lut(v: number): [number, number, number] {
  let a = STOPS[0];
  let b = STOPS[STOPS.length - 1];
  for (let i = 0; i < STOPS.length - 1; i++) {
    if (v >= STOPS[i][0] && v <= STOPS[i + 1][0]) {
      a = STOPS[i];
      b = STOPS[i + 1];
      break;
    }
  }
  const t = a[0] === b[0] ? 0 : (v - a[0]) / (b[0] - a[0]);
  return [0, 1, 2].map((c) => Math.round(a[1][c] + (b[1][c] - a[1][c]) * t)) as [number, number, number];
}

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(width: number, height: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    rgb.copy
      ? Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3).copy(raw, y * (width * 3 + 1) + 1)
      : raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * (width * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

async function main() {
  const cfg = loadConfig();
  const organism = new Organism(cfg, createMarketSource(cfg.market));
  const stepsPerRefresh = Math.max(1, Math.round((cfg.engine.stepsPerSecond * organism.market.refreshMs) / 1000));
  await organism.refreshMarket();
  for (let i = 1; i <= steps; i++) {
    organism.tick();
    if (i % stepsPerRefresh === 0) await organism.refreshMarket();
  }

  const { width, height } = cfg.sim;
  const bytes = new Uint8Array(width * height);
  organism.frame(bytes);

  const W = width * SCALE;
  const H = height * SCALE;
  const rgb = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = bytes[((y / SCALE) | 0) * width + ((x / SCALE) | 0)];
      const [r, g, b] = lut(v);
      const o = (y * W + x) * 3;
      rgb[o] = r;
      rgb[o + 1] = g;
      rgb[o + 2] = b;
    }
  }

  // Mark food nodes: white ring for food, red ring for poison, grey for the nucleus.
  const state = organism.state(cfg.engine.stepsPerSecond);
  const ring = (cx: number, cy: number, r: number, col: [number, number, number]) => {
    for (let a = 0; a < 360; a += 1) {
      const x = Math.round((cx + Math.cos((a * Math.PI) / 180) * r) * SCALE);
      const y = Math.round((cy + Math.sin((a * Math.PI) / 180) * r) * SCALE);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const o = (y * W + x) * 3;
      rgb[o] = col[0];
      rgb[o + 1] = col[1];
      rgb[o + 2] = col[2];
    }
  };
  ring(state.nucleus.x, state.nucleus.y, state.nucleus.radius, [120, 124, 132]);
  for (const t of state.tokens) ring(t.x, t.y, t.radius, t.toxicity > 0 ? [224, 112, 95] : [230, 232, 235]);

  fs.writeFileSync(out, png(W, H, rgb));
  console.log(`wrote ${out}: step ${state.step}, alive ${state.alive}, cash ${(state.cashShare * 100).toFixed(1)}%`);
  for (const t of state.tokens) {
    console.log(`  ${t.symbol.padEnd(7)} score ${t.score.total.toFixed(2).padStart(5)}  share ${(t.share * 100).toFixed(1).padStart(5)}%  occ ${t.occupancy}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
