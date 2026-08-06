/**
 * Server: static files + a small REST API + a WebSocket feed of the organism.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import type { Config } from '../config.js';
import { logger } from '../core/log.js';
import type { Runner } from '../engine/runner.js';
import { encodeAgents, encodeTrail, parseClientMessage, type ServerMessage } from './protocol.js';

const log = logger('server');
const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(here, '..', '..', 'public');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(body));
}

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse, urlPath: string): void {
  const rel = urlPath === '/' ? '/index.html' : urlPath;
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(data);
  });
}

export function createServer(cfg: Config, runner: Runner): http.Server {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const p = url.pathname;

    if (p === '/health') return json(res, 200, { ok: true, step: runner.organism.sim.step });
    if (p === '/api/state') return json(res, 200, runner.state());
    if (p === '/api/tokens') return json(res, 200, runner.state().tokens);
    if (p === '/api/allocation') {
      const s = runner.state();
      return json(res, 200, {
        cash: s.cashShare,
        tokens: Object.fromEntries(s.tokens.map((t) => [t.symbol, t.share])),
      });
    }
    if (p === '/api/portfolio') return json(res, 200, runner.organism.state(runner.stepsPerSecond, 1200).portfolio);
    if (p === '/api/config') return json(res, 200, { sim: cfg.sim, engine: cfg.engine, market: { source: cfg.market.source } });
    if (p.startsWith('/api/')) return json(res, 404, { error: 'unknown endpoint' });

    serveStatic(req, res, p);
  });

  const wss = new WebSocketServer({ server });
  const clients = new Set<WebSocket>();
  let agentSubscribers = 0;

  const send = (ws: WebSocket, msg: ServerMessage) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  wss.on('connection', (ws) => {
    clients.add(ws);
    let wantsAgents = false;
    send(ws, { type: 'hello', width: cfg.sim.width, height: cfg.sim.height, state: runner.state() });
    log.info('client connected', { clients: clients.size });

    ws.on('message', (data) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return;
      }
      const msg = parseClientMessage(parsed);
      if (!msg) return;
      switch (msg.type) {
        case 'pause':
          runner.pause();
          break;
        case 'resume':
          runner.resume();
          break;
        case 'reset':
          runner.reset();
          break;
        case 'speed':
          runner.setSpeed(msg.value);
          break;
        case 'agents':
          if (msg.on && !wantsAgents) agentSubscribers++;
          if (!msg.on && wantsAgents) agentSubscribers--;
          wantsAgents = msg.on;
          runner.sendAgents = agentSubscribers > 0;
          break;
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      if (wantsAgents) agentSubscribers--;
      runner.sendAgents = agentSubscribers > 0;
      log.info('client left', { clients: clients.size });
    });
  });

  const broadcast = (buf: Buffer | string) => {
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 4 * 1024 * 1024) ws.send(buf);
    }
  };

  runner.on('frame', (trail: Uint8Array) => broadcast(encodeTrail(trail)));
  runner.on('agents', (positions: Uint16Array) => broadcast(encodeAgents(positions)));
  runner.on('state', (state) => broadcast(JSON.stringify({ type: 'state', state } satisfies ServerMessage)));

  return server;
}
