/** Market data from DexScreener (public API). Every field is real or null. */
export interface Market {
  priceUsd: number | null;
  marketCapUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  change24hPct: number | null;
  buys24h: number | null;
  sells24h: number | null;
  pairAddress: string | null;
  dex: string | null;
  pairCreatedAt: number | null;
  url: string | null;
}

const EMPTY: Market = { priceUsd: null, marketCapUsd: null, liquidityUsd: null, volume24hUsd: null, change24hPct: null, buys24h: null, sells24h: null, pairAddress: null, dex: null, pairCreatedAt: null, url: null };
const cache = new Map<string, { at: number; v: Market }>();

const num = (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));

export async function markets(mints: string[]): Promise<Map<string, Market>> {
  const out = new Map<string, Market>();
  const todo = mints.filter((m) => {
    const c = cache.get(m);
    if (c && Date.now() - c.at < 30_000) {
      out.set(m, c.v);
      return false;
    }
    return true;
  });
  for (let i = 0; i < todo.length; i += 30) {
    const batch = todo.slice(i, i + 30);
    try {
      const r = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${batch.join(",")}`, { signal: AbortSignal.timeout(10_000), next: { revalidate: 30 } } as RequestInit);
      const pairs = r.ok ? ((await r.json()) as any[]) : [];
      for (const m of batch) {
        const mine = pairs.filter((p) => p?.baseToken?.address === m);
        const p = mine.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
        const v: Market = p
          ? {
              priceUsd: num(p.priceUsd),
              marketCapUsd: num(p.marketCap ?? p.fdv),
              liquidityUsd: num(p.liquidity?.usd),
              volume24hUsd: num(p.volume?.h24),
              change24hPct: num(p.priceChange?.h24),
              buys24h: num(p.txns?.h24?.buys),
              sells24h: num(p.txns?.h24?.sells),
              pairAddress: p.pairAddress ?? null,
              dex: p.dexId ?? null,
              pairCreatedAt: num(p.pairCreatedAt),
              url: p.url ?? null,
            }
          : EMPTY;
        cache.set(m, { at: Date.now(), v });
        out.set(m, v);
      }
    } catch {
      for (const m of batch) out.set(m, EMPTY);
    }
  }
  return out;
}

export async function market(mint: string): Promise<Market> {
  return (await markets([mint])).get(mint) ?? EMPTY;
}
