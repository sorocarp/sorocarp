/**
 * Wire protocol between the runner and the browser.
 *
 * Text frames are JSON ServerMessage / ClientMessage.
 * Binary frames start with one tag byte:
 *   0x01  trail map, width*height bytes, row-major, 0..255
 *   0x02  agent positions, uint16 little-endian (x, y) pairs
 */
import type { OrganismState } from '../engine/organism.js';

export const BIN_TRAIL = 0x01;
export const BIN_AGENTS = 0x02;

export type LiveState = OrganismState & { paused: boolean; stepsPerSecond: number };

export type ServerMessage =
  | { type: 'hello'; width: number; height: number; state: LiveState }
  | { type: 'state'; state: LiveState };

export type ClientMessage =
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'reset' }
  | { type: 'speed'; value: number }
  | { type: 'agents'; on: boolean };

export function encodeTrail(trail: Uint8Array): Buffer {
  const out = Buffer.allocUnsafe(1 + trail.length);
  out[0] = BIN_TRAIL;
  out.set(trail, 1);
  return out;
}

export function encodeAgents(positions: Uint16Array): Buffer {
  const out = Buffer.allocUnsafe(1 + positions.byteLength);
  out[0] = BIN_AGENTS;
  out.set(new Uint8Array(positions.buffer, positions.byteOffset, positions.byteLength), 1);
  return out;
}

export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  switch (m.type) {
    case 'pause':
    case 'resume':
    case 'reset':
      return { type: m.type };
    case 'speed':
      return typeof m.value === 'number' && Number.isFinite(m.value) ? { type: 'speed', value: m.value } : null;
    case 'agents':
      return { type: 'agents', on: Boolean(m.on) };
    default:
      return null;
  }
}
