import { PublicKey } from "@solana/web3.js";
import { db } from "./db.ts";
import { markets, market } from "./market.ts";
import { currentEpoch, epochWindow, getToken, leaderboard, rewardLedger, type TokenRow } from "./service.ts";
import { holderCount, largestHolders, pumpCreatorVaultLamports, pumpCurve, connection } from "./solana.ts";
import { mergeConfig } from "./scoring.ts";

export interface TokenCard {
  mint: string;
  name: string;
  symbol: string;
  image: string | null;
  venue: string;
  verifiedCreator: boolean;
  members: number;
  approved: number;
  topScore: number | null;
  rewardCommitmentBps: number;
  fundedLamports: string;
  createdAt: string;
  market: Awaited<ReturnType<typeof market>>;
}

export async function listTokens(): Promise<TokenCard[]> {
  const d = await db();
  const rows = await d.query<TokenRow & { members: string; approved: string; funded: string }>(
    `select t.*,
       (select count(*) from memberships m where m.mint=t.mint)::text as members,
       (select count(*) from contributions c where c.mint=t.mint and c.status='approved')::text as approved,
       (select coalesce(sum(lamports),0) from reward_fundings f where f.mint=t.mint)::text as funded
     from tokens t order by t.created_at desc limit 200`,
  );
  const mk = await markets(rows.map((r) => r.mint));
  const tops = await Promise.all(rows.map(async (r) => ((await leaderboard(r))[0]?.score.total ?? null)));
  return rows.map((r, i) => ({
    mint: r.mint,
    name: r.name,
    symbol: r.symbol,
    image: r.image,
    venue: r.venue,
    verifiedCreator: !!r.creator,
    members: Number(r.members),
    approved: Number(r.approved),
    topScore: tops[i],
    rewardCommitmentBps: r.reward_commitment_bps,
    fundedLamports: r.funded,
    createdAt: new Date(r.created_at).toISOString(),
    market: mk.get(r.mint)!,
  }));
}

export async function platformStats() {
  const d = await db();
  const [r] = await d.query<{ tokens: string; members: string; approved: string; votes: string; funded: string; paid: string }>(
    `select (select count(*) from tokens)::text as tokens,
            (select count(distinct wallet) from memberships)::text as members,
            (select count(*) from contributions where status='approved')::text as approved,
            (select count(*) from votes)::text as votes,
            (select coalesce(sum(lamports),0) from reward_fundings)::text as funded,
            (select coalesce(sum(lamports),0) from reward_allocations where status='paid')::text as paid`,
  );
  return r;
}

export async function tokenDetail(mint: string) {
  const t = await getToken(mint);
  if (!t) return null;
  const key = new PublicKey(mint);
  const [m, board, ledger, curve, holders, count, supply] = await Promise.all([
    market(mint),
    leaderboard(t),
    rewardLedger(mint),
    t.venue === "pumpfun" ? pumpCurve(key).catch(() => null) : Promise.resolve(null),
    largestHolders(key),
    holderCount(mint).catch(() => null),
    connection().getTokenSupply(key).then((s) => s.value.amount).catch(() => null),
  ]);
  let dbc: { progress: number; migrated: boolean; quoteReserveLamports: string } | null = null;
  if (t.venue === "meteora-dbc" && t.pool) {
    try {
      const { DynamicBondingCurveClient } = await import("@meteora-ag/dynamic-bonding-curve-sdk");
      const sdk = new DynamicBondingCurveClient(connection(), "confirmed");
      const pool = (await sdk.state.getPool(t.pool))?.poolState;
      const cfg = pool ? await sdk.state.getPoolConfig(pool.config) : null;
      if (pool && cfg) {
        const threshold = BigInt(cfg.migrationQuoteThreshold.toString());
        const reserve = BigInt(pool.quoteReserve.toString());
        const migrated = !!pool.isMigrated;
        dbc = { progress: migrated ? 1 : threshold > 0n ? Math.min(1, Number((reserve * 10_000n) / threshold) / 10_000) : 0, migrated, quoteReserveLamports: reserve.toString() };
      }
    } catch {
      dbc = null;
    }
  }
  const creatorVault = t.venue === "pumpfun" && t.creator ? await pumpCreatorVaultLamports(new PublicKey(t.creator)).catch(() => null) : null;
  const epoch = currentEpoch(t);
  const d = await db();
  const [counts] = await d.query<{ pending: string; approved: string; rejected: string; proposals: string }>(
    `select (select count(*) from contributions where mint=$1 and status='pending')::text as pending,
            (select count(*) from contributions where mint=$1 and status='approved')::text as approved,
            (select count(*) from contributions where mint=$1 and status='rejected')::text as rejected,
            (select count(*) from proposals where mint=$1)::text as proposals`,
    [mint],
  );
  return {
    token: { ...t, program_start: new Date(t.program_start).toISOString(), created_at: new Date(t.created_at).toISOString() },
    scoring: mergeConfig(t.scoring),
    epoch: { current: epoch, ...epochWindow(t, epoch) },
    market: m,
    chain: {
      supplyRaw: supply,
      holders: count,
      topHolders: holders,
      curve: curve ? { progress: curve.progress, complete: curve.complete, realSolLamports: curve.realSolLamports } : dbc ? { progress: dbc.progress, complete: dbc.migrated, realSolLamports: dbc.quoteReserveLamports } : null,
      creatorVaultLamports: creatorVault,
    },
    leaderboard: board.slice(0, 100),
    memberCount: board.length,
    counts,
    rewards: ledger,
  };
}

/** Portable leaderboard: each wallet's best community in full + 25% of the rest (see globalScore). */
export async function globalLeaderboard(limitN = 200) {
  const { globalScore } = await import("./scoring.ts");
  const d = await db();
  const tokens = await d.query<TokenRow>("select * from tokens");
  const per = new Map<string, { scores: number[]; communities: { mint: string; symbol: string; score: number }[] }>();
  for (const t of tokens) {
    for (const r of await leaderboard(t)) {
      if (r.score.total <= 0) continue;
      const e = per.get(r.wallet) ?? { scores: [], communities: [] };
      e.scores.push(r.score.total);
      e.communities.push({ mint: t.mint, symbol: t.symbol, score: r.score.total });
      per.set(r.wallet, e);
    }
  }
  return [...per]
    .map(([wallet, e]) => ({ wallet, total: globalScore(e.scores).total, communities: e.communities.sort((a, b) => b.score - a.score) }))
    .sort((a, b) => b.total - a.total || a.wallet.localeCompare(b.wallet))
    .slice(0, limitN);
}
