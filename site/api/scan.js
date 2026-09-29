/**
 * GET /api/scan            the Solana tokens currently most boosted on DexScreener
 * GET /api/scan?q=<text>   search Solana pairs by name, symbol or address
 *
 * Real Solana market data. Each token is collapsed
 * to its deepest pool and returned in the same shape the simulation scores.
 */
const BASE = 'https://api.dexscreener.com';
const FALLBACK = [
  'So11111111111111111111111111111111111111112',
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
  'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',
  'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',
  'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE',
];
const cache = new Map(); // key -> { at, data }

async function get(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: ctl.signal });
    if (!res.ok) throw new Error(`dexscreener ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Keep the deepest Solana pool per base token and map it to a snapshot. */
function collapse(pairs, limit) {
  const best = new Map();
  for (const p of pairs) {
    if (!p || p.chainId !== 'solana' || !p.baseToken?.address) continue;
    const prev = best.get(p.baseToken.address);
    if (!prev || (p.liquidity?.usd ?? 0) > (prev.liquidity?.usd ?? 0)) best.set(p.baseToken.address, p);
  }
  const out = [];
  for (const p of best.values()) {
    const price = Number(p.priceUsd);
    if (!Number.isFinite(price) || price <= 0) continue;
    out.push({
      address: p.baseToken.address,
      symbol: String(p.baseToken.symbol || '').slice(0, 12),
      name: String(p.baseToken.name || '').slice(0, 40),
      priceUsd: price,
      volume24hUsd: p.volume?.h24 ?? 0,
      liquidityUsd: p.liquidity?.usd ?? 0,
      priceChange1hPct: p.priceChange?.h1 ?? 0,
      priceChange24hPct: p.priceChange?.h24 ?? 0,
      marketCapUsd: p.marketCap ?? p.fdv ?? null,
      dex: p.dexId ?? null,
      updatedAt: Date.now(),
    });
  }
  return out.slice(0, limit);
}

async function trending() {
  let addresses = [];
  try {
    const boosts = await get(`${BASE}/token-boosts/top/v1`);
    addresses = (Array.isArray(boosts) ? boosts : []).filter((b) => b.chainId === 'solana' && b.tokenAddress).map((b) => b.tokenAddress);
  } catch {
    /* fall through to the fallback list */
  }
  addresses = [...new Set(addresses)].slice(0, 22);
  if (addresses.length < 6) addresses = FALLBACK;
  const pairs = await get(`${BASE}/tokens/v1/solana/${addresses.join(',')}`);
  return collapse(Array.isArray(pairs) ? pairs : [], 18);
}

async function search(q) {
  const body = await get(`${BASE}/latest/dex/search?q=${encodeURIComponent(q)}`);
  return collapse(Array.isArray(body?.pairs) ? body.pairs : [], 14);
}

export default async function handler(req, res) {
  const q = String(req.query?.q || '').trim().slice(0, 64);
  const key = q ? `q:${q.toLowerCase()}` : 'trending';
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 15_000) return res.status(200).json(hit.data);
  try {
    const tokens = q ? await search(q) : await trending();
    const data = { source: 'dexscreener', query: q || null, tokens, at: Date.now() };
    cache.set(key, { at: Date.now(), data });
    if (cache.size > 100) cache.delete(cache.keys().next().value);
    res.setHeader('cache-control', 'no-store');
    return res.status(200).json(data);
  } catch (error) {
    if (hit) return res.status(200).json({ ...hit.data, stale: true });
    return res.status(502).json({ error: 'market unreachable' });
  }
}
