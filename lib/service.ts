import { db, audit } from "./db.ts";
import {
  achievements,
  contributionPoints,
  epochOf,
  globalScore,
  longestStreak,
  mergeConfig,
  scoreMember,
  type ApprovedContribution,
  type ContributionType,
  type ScoreResult,
  type ScoringConfig,
} from "./scoring.ts";
import { holdingHistory, pubkey, walletFirstSeen } from "./solana.ts";
import { PublicKey } from "@solana/web3.js";

export interface TokenRow {
  mint: string;
  name: string;
  symbol: string;
  image: string | null;
  description: string | null;
  venue: string;
  creator: string | null;
  creator_proof: string | null;
  launch_sig: string | null;
  pool: string | null;
  token_program: string;
  decimals: number;
  links: Record<string, string>;
  scoring: Partial<ScoringConfig>;
  epoch_days: number;
  program_start: Date | string;
  min_hold_raw: string;
  reward_wallet: string | null;
  reward_commitment_bps: number;
  reward_cap_bps: number;
  min_wallet_age_days: number;
  reviewers: string[];
  listed_by: string;
  created_at: Date | string;
}

const ms = (d: Date | string | null) => (d === null ? null : new Date(d).getTime());

export function currentEpoch(t: TokenRow, at = Date.now()) {
  return epochOf(at, ms(t.program_start)!, t.epoch_days);
}

export function epochWindow(t: TokenRow, epoch: number) {
  const start = ms(t.program_start)! + epoch * t.epoch_days * 86_400_000;
  return { start, end: start + t.epoch_days * 86_400_000 };
}

export async function getToken(mint: string): Promise<TokenRow | null> {
  const rows = await (await db()).query<TokenRow>("select * from tokens where mint = $1", [mint]);
  return rows[0] ?? null;
}

export function canModerate(t: TokenRow, wallet: string | null) {
  return !!wallet && (wallet === t.creator || t.reviewers.includes(wallet));
}

export async function ensureMember(mint: string, wallet: string) {
  await (await db()).query("insert into memberships(mint, wallet) values ($1,$2) on conflict do nothing", [mint, wallet]);
}

const HOLDING_TTL = 6 * 3600_000;

/** Verified holding, cached for 6h. `force` re-reads the chain (rate-limited by the caller). */
export async function verifiedHolding(t: TokenRow, wallet: string, force = false) {
  const d = await db();
  const cached = (await d.query<{ balance_raw: string; since: Date | null; partial: boolean; checked_at: Date }>("select * from holdings where mint=$1 and wallet=$2", [t.mint, wallet]))[0];
  if (cached && !force && Date.now() - ms(cached.checked_at)! < HOLDING_TTL) {
    return { balanceRaw: cached.balance_raw, since: ms(cached.since), partial: cached.partial, checkedAt: ms(cached.checked_at)! };
  }
  const r = await holdingHistory(new PublicKey(t.mint), pubkey(wallet, "wallet"), new PublicKey(t.token_program), BigInt(t.min_hold_raw || "1"));
  await d.query(
    `insert into holdings(mint, wallet, balance_raw, since, partial, checked_at) values ($1,$2,$3,$4,$5,now())
     on conflict (mint, wallet) do update set balance_raw=excluded.balance_raw, since=excluded.since, partial=excluded.partial, checked_at=now()`,
    [t.mint, wallet, r.balanceRaw, r.since ? new Date(r.since) : null, r.partial],
  );
  return { ...r, checkedAt: Date.now() };
}

export async function walletAgeDays(wallet: string): Promise<{ days: number | null; partial: boolean }> {
  const d = await db();
  const c = (await d.query<{ first_seen: Date | null; partial: boolean; checked_at: Date }>("select * from wallet_age where wallet=$1", [wallet]))[0];
  let first: number | null;
  let partial: boolean;
  if (c && Date.now() - ms(c.checked_at)! < 24 * 3600_000) {
    first = ms(c.first_seen);
    partial = c.partial;
  } else {
    const r = await walletFirstSeen(pubkey(wallet, "wallet"));
    first = r.firstSeen;
    partial = r.partial;
    await d.query(
      `insert into wallet_age(wallet, first_seen, partial, checked_at) values ($1,$2,$3,now())
       on conflict (wallet) do update set first_seen=excluded.first_seen, partial=excluded.partial, checked_at=now()`,
      [wallet, first ? new Date(first) : null, partial],
    );
  }
  return { days: first === null ? null : (Date.now() - first) / 86_400_000, partial };
}

interface MemberFacts {
  wallet: string;
  approved: ApprovedContribution[];
  strikes: number;
  voteEpochs: number[];
  meaningfulProposals: number;
  holding: { since: number | null; partial: boolean; balanceRaw: string; checkedAt: number } | null;
  joinedAt: number;
}

export const MEANINGFUL_TURNOUT = 5;

async function memberFacts(t: TokenRow, wallets?: string[]): Promise<MemberFacts[]> {
  const d = await db();
  const filter = wallets ? " and wallet = any($2)" : "";
  const p = wallets ? [t.mint, wallets] : [t.mint];
  const [members, contribs, votes, props, holds] = await Promise.all([
    d.query<{ wallet: string; joined_at: Date }>(`select wallet, joined_at from memberships where mint=$1${filter}`, p),
    d.query<{ wallet: string; type: ContributionType; quality: number | null; epoch: number; status: string; strike: boolean }>(
      `select wallet, type, quality, epoch, status, strike from contributions where mint=$1 and status <> 'pending'${filter}`,
      p,
    ),
    d.query<{ wallet: string; epoch: number }>(`select v.wallet, v.epoch from votes v join proposals pr on pr.id=v.proposal_id where pr.mint=$1${wallets ? " and v.wallet = any($2)" : ""}`, p),
    d.query<{ author: string; n: string }>(
      `select pr.author, count(v.*)::text as n from proposals pr left join votes v on v.proposal_id=pr.id where pr.mint=$1 and pr.ends_at < now() group by pr.id, pr.author`,
      [t.mint],
    ),
    d.query<{ wallet: string; balance_raw: string; since: Date | null; partial: boolean; checked_at: Date }>(`select * from holdings where mint=$1${filter}`, p),
  ]);
  const map = new Map<string, MemberFacts>();
  const get = (w: string) => {
    let m = map.get(w);
    if (!m) map.set(w, (m = { wallet: w, approved: [], strikes: 0, voteEpochs: [], meaningfulProposals: 0, holding: null, joinedAt: Date.now() }));
    return m;
  };
  for (const r of members) get(r.wallet).joinedAt = ms(r.joined_at)!;
  for (const c of contribs) {
    const m = get(c.wallet);
    if (c.status === "approved" && c.quality) m.approved.push({ type: c.type, quality: c.quality, epoch: c.epoch });
    if (c.status === "rejected" && c.strike) m.strikes++;
  }
  for (const v of votes) get(v.wallet).voteEpochs.push(v.epoch);
  for (const pr of props) if (Number(pr.n) >= MEANINGFUL_TURNOUT && (!wallets || wallets.includes(pr.author))) get(pr.author).meaningfulProposals++;
  for (const h of holds) get(h.wallet).holding = { since: ms(h.since), partial: h.partial, balanceRaw: h.balance_raw, checkedAt: ms(h.checked_at)! };
  return [...map.values()];
}

export interface MemberScore {
  wallet: string;
  score: ScoreResult;
  holding: MemberFacts["holding"];
  approvedCount: number;
  strikes: number;
}

function score(t: TokenRow, f: MemberFacts, cfg: ScoringConfig): MemberScore {
  const now = Date.now();
  const holdingDays = f.holding?.since ? (now - f.holding.since) / 86_400_000 : null;
  return {
    wallet: f.wallet,
    holding: f.holding,
    approvedCount: f.approved.length,
    strikes: f.strikes,
    score: scoreMember(
      {
        holdingDays,
        holdingPartial: f.holding?.partial,
        approved: f.approved,
        strikes: f.strikes,
        voteEpochs: f.voteEpochs,
        meaningfulProposals: f.meaningfulProposals,
        currentEpoch: currentEpoch(t, now),
      },
      cfg,
    ),
  };
}

export async function leaderboard(t: TokenRow): Promise<MemberScore[]> {
  const cfg = mergeConfig(t.scoring);
  const facts = await memberFacts(t);
  return facts.map((f) => score(t, f, cfg)).sort((a, b) => b.score.total - a.score.total || a.wallet.localeCompare(b.wallet));
}

export async function memberScore(t: TokenRow, wallet: string): Promise<MemberScore> {
  const cfg = mergeConfig(t.scoring);
  const [f] = await memberFacts(t, [wallet]);
  return score(t, f ?? { wallet, approved: [], strikes: 0, voteEpochs: [], meaningfulProposals: 0, holding: null, joinedAt: Date.now() }, cfg);
}

/** Contribution points per wallet earned in one epoch (the only input to reward weights). */
export async function epochPoints(t: TokenRow, epoch: number): Promise<Map<string, number>> {
  const cfg = mergeConfig(t.scoring);
  const rows = await (await db()).query<{ wallet: string; type: ContributionType; quality: number }>(
    "select wallet, type, quality from contributions where mint=$1 and status='approved' and epoch=$2 and paid=false",
    [t.mint, epoch],
  );
  const by = new Map<string, ApprovedContribution[]>();
  for (const r of rows) {
    const l = by.get(r.wallet) ?? [];
    l.push({ type: r.type, quality: r.quality, epoch });
    by.set(r.wallet, l);
  }
  return new Map([...by].map(([w, items]) => [w, Math.round(contributionPoints(items, cfg) * 100) / 100]));
}

export async function profile(wallet: string) {
  const d = await db();
  const mints = (
    await d.query<{ mint: string }>(
      `select mint from memberships where wallet=$1 union select mint from contributions where wallet=$1
       union select pr.mint from votes v join proposals pr on pr.id=v.proposal_id where v.wallet=$1`,
      [wallet],
    )
  ).map((r) => r.mint);
  const tokens = mints.length ? await d.query<TokenRow>("select * from tokens where mint = any($1)", [mints]) : [];
  const communities = [];
  for (const t of tokens) {
    const s = await memberScore(t, wallet);
    const joined = (await d.query<{ joined_at: Date }>("select joined_at from memberships where mint=$1 and wallet=$2", [t.mint, wallet]))[0];
    communities.push({ token: { mint: t.mint, name: t.name, symbol: t.symbol, image: t.image }, joinedAt: joined ? ms(joined.joined_at) : null, ...s });
  }
  communities.sort((a, b) => b.score.total - a.score.total);
  const contributions = await d.query<{ id: string; mint: string; type: ContributionType; title: string; url: string; status: string; quality: number | null; epoch: number; created_at: Date; paid: boolean }>(
    "select id, mint, type, title, url, status, quality, epoch, created_at, paid from contributions where wallet=$1 order by created_at desc limit 200",
    [wallet],
  );
  const rewards = await d.query<{ epoch_id: string; mint: string; epoch: number; lamports: string; status: string; signature: string | null; paid_at: Date | null }>(
    `select a.epoch_id, e.mint, e.epoch, a.lamports::text, a.status, a.signature, a.paid_at from reward_allocations a
     join reward_epochs e on e.id=a.epoch_id where a.wallet=$1 order by e.created_at desc`,
    [wallet],
  );
  const votes = (await d.query<{ n: string }>("select count(*)::text as n from votes where wallet=$1", [wallet]))[0];
  const approved = contributions.filter((c) => c.status === "approved");
  const byType: Partial<Record<ContributionType, number>> = {};
  for (const c of approved) byType[c.type] = (byType[c.type] ?? 0) + 1;
  const maxHoldingDays = Math.max(0, ...communities.map((c) => (c.holding?.since ? (Date.now() - c.holding.since) / 86_400_000 : 0)));
  const g = globalScore(communities.map((c) => c.score.total));
  return {
    wallet,
    global: g,
    communities,
    contributions,
    rewards,
    achievements: achievements({
      maxHoldingDays,
      approvedByType: byType,
      approvedTotal: approved.length,
      votes: Number(votes?.n ?? 0),
      longestStreak: Math.max(0, ...tokens.map((t) => longestStreak(approved.filter((c) => c.mint === t.mint).map((c) => c.epoch)))),
      communitiesOver100: communities.filter((c) => c.score.total >= 100).length,
    }),
    paidLamports: rewards.filter((r) => r.status === "paid").reduce((s, r) => s + BigInt(r.lamports), 0n).toString(),
  };
}

/** Reward ledger for a token: verified funding, allocations, payouts. */
export async function rewardLedger(mint: string) {
  const d = await db();
  const [fundings, epochs, totals] = await Promise.all([
    d.query<{ signature: string; wallet: string; lamports: string; source: string; block_time: Date | null; created_at: Date }>(
      "select signature, wallet, lamports::text, source, block_time, created_at from reward_fundings where mint=$1 order by created_at desc",
      [mint],
    ),
    d.query<{ id: string; epoch: number; pot_lamports: string; manifest_sha256: string; created_at: Date; paid: string; recipients: string; paid_count: string }>(
      `select e.id, e.epoch, e.pot_lamports::text, e.manifest_sha256, e.created_at,
              coalesce(sum(a.lamports) filter (where a.status='paid'),0)::text as paid,
              count(a.*)::text as recipients, count(a.*) filter (where a.status='paid')::text as paid_count
       from reward_epochs e left join reward_allocations a on a.epoch_id=e.id where e.mint=$1 group by e.id order by e.epoch desc`,
      [mint],
    ),
    d.query<{ funded: string; allocated: string; paid: string }>(
      `select (select coalesce(sum(lamports),0) from reward_fundings where mint=$1)::text as funded,
              (select coalesce(sum(a.lamports),0) from reward_allocations a join reward_epochs e on e.id=a.epoch_id where e.mint=$1)::text as allocated,
              (select coalesce(sum(a.lamports),0) from reward_allocations a join reward_epochs e on e.id=a.epoch_id where e.mint=$1 and a.status='paid')::text as paid`,
      [mint],
    ),
  ]);
  return { fundings, epochs, totals: totals[0] };
}

export { audit };
