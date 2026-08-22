const defaultFetcher = async (url) => {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok)
        throw new Error(`dexscreener ${res.status} ${res.statusText}`);
    return res.json();
};
const BASE = 'https://api.dexscreener.com/tokens/v1/solana/';
const BATCH = 30;
export function pairsToSnapshots(pairs, wanted, now = Date.now()) {
    const best = new Map();
    for (const p of pairs) {
        if (p.chainId !== 'solana')
            continue;
        const addr = p.baseToken?.address;
        if (!addr || !wanted.has(addr))
            continue;
        const prev = best.get(addr);
        if (!prev || (p.liquidity?.usd ?? 0) > (prev.liquidity?.usd ?? 0))
            best.set(addr, p);
    }
    const out = [];
    for (const p of best.values()) {
        const price = Number(p.priceUsd);
        if (!Number.isFinite(price) || price <= 0)
            continue;
        out.push({
            address: p.baseToken.address,
            symbol: p.baseToken.symbol,
            name: p.baseToken.name,
            priceUsd: price,
            volume24hUsd: p.volume?.h24 ?? 0,
            liquidityUsd: p.liquidity?.usd ?? 0,
            priceChange1hPct: p.priceChange?.h1 ?? 0,
            priceChange24hPct: p.priceChange?.h24 ?? 0,
            marketCapUsd: p.marketCap ?? p.fdv,
            updatedAt: now,
        });
    }
    return out;
}
export class DexScreenerMarketSource {
    name = 'dexscreener';
    refreshMs;
    addresses;
    fetcher;
    last = [];
    constructor(addresses, refreshMs = 15_000, fetcher = defaultFetcher) {
        if (addresses.length === 0)
            throw new Error('dexscreener source needs at least one token address');
        this.addresses = [...new Set(addresses)];
        this.refreshMs = refreshMs;
        this.fetcher = fetcher;
    }
    async fetch() {
        const wanted = new Set(this.addresses);
        const pairs = [];
        for (let i = 0; i < this.addresses.length; i += BATCH) {
            const chunk = this.addresses.slice(i, i + BATCH);
            const body = await this.fetcher(BASE + chunk.join(','));
            if (Array.isArray(body))
                pairs.push(...body);
        }
        const snaps = pairsToSnapshots(pairs, wanted);
        // If the API hiccups, keep feeding the organism the last good data rather than starving it.
        if (snaps.length > 0)
            this.last = snaps;
        return this.last;
    }
}
