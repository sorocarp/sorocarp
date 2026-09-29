/**
 * GET /api/wallet?address=<solana address>
 *
 * A read-only look at a Solana wallet: its SOL balance, straight from the chain.
 * Nothing is signed and no key is involved; this is the same public data any
 * explorer shows.
 */
const RPCS = [process.env.SOLANA_RPC_URL, 'https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com'].filter(Boolean);
const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const cache = new Map(); // address -> { at, data }

async function balance(rpc, address) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 4500);
  try {
    const res = await fetch(rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: ctl.signal,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address, { commitment: 'confirmed' }] }),
    });
    if (!res.ok) throw new Error(`rpc ${res.status}`);
    const body = await res.json();
    const lamports = body?.result?.value;
    if (typeof lamports !== 'number') throw new Error('no balance');
    return { address, lamports, sol: lamports / 1e9, slot: body.result.context?.slot ?? null, at: Date.now() };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  const address = String(req.query?.address || '');
  if (!ADDRESS.test(address)) return res.status(400).json({ error: 'invalid address' });

  const hit = cache.get(address);
  if (hit && Date.now() - hit.at < 8000) return res.status(200).json(hit.data);

  for (const rpc of RPCS) {
    try {
      const data = await balance(rpc, address);
      cache.set(address, { at: Date.now(), data });
      if (cache.size > 200) cache.delete(cache.keys().next().value);
      res.setHeader('cache-control', 'no-store');
      return res.status(200).json(data);
    } catch {
      /* next endpoint */
    }
  }
  if (hit) return res.status(200).json({ ...hit.data, stale: true });
  return res.status(502).json({ error: 'chain unreachable' });
}
