/**
 * GET /api/chain
 *
 * A live read of Solana mainnet: current slot, block height and epoch.
 * Cached for a moment so a busy page does not hammer the public RPC.
 * Set SOLANA_RPC_URL to use a dedicated endpoint (Helius, Triton, QuickNode).
 */
const RPCS = [process.env.SOLANA_RPC_URL, 'https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com'].filter(Boolean);
const CACHE_MS = 2000;

let cached = null;
let cachedAt = 0;

async function read(rpc) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 4000);
  try {
    const res = await fetch(rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: ctl.signal,
      body: JSON.stringify([
        { jsonrpc: '2.0', id: 1, method: 'getSlot', params: [{ commitment: 'confirmed' }] },
        { jsonrpc: '2.0', id: 2, method: 'getEpochInfo', params: [{ commitment: 'confirmed' }] },
      ]),
    });
    if (!res.ok) throw new Error(`rpc ${res.status}`);
    const body = await res.json();
    const slot = body.find((r) => r.id === 1)?.result;
    const epoch = body.find((r) => r.id === 2)?.result;
    if (typeof slot !== 'number') throw new Error('no slot');
    return {
      chain: 'solana',
      cluster: 'mainnet-beta',
      slot,
      blockHeight: epoch?.blockHeight ?? null,
      epoch: epoch?.epoch ?? null,
      at: Date.now(),
    };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_MS) {
    res.setHeader('cache-control', 'public, s-maxage=2, stale-while-revalidate=5');
    return res.status(200).json(cached);
  }
  for (const rpc of RPCS) {
    try {
      cached = await read(rpc);
      cachedAt = now;
      res.setHeader('cache-control', 'public, s-maxage=2, stale-while-revalidate=5');
      return res.status(200).json(cached);
    } catch {
      /* try the next endpoint */
    }
  }
  if (cached) return res.status(200).json({ ...cached, stale: true });
  return res.status(502).json({ error: 'chain unreachable' });
}
