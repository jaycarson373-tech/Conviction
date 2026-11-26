import { body, route } from "@/lib/http.ts";
import { HttpError, requireWallet } from "@/lib/auth.ts";
import { audit, getToken } from "@/lib/service.ts";
import { db } from "@/lib/db.ts";
import { mergeConfig, validateConfig } from "@/lib/scoring.ts";
import { pubkey } from "@/lib/solana.ts";

/** Creator-only: scoring weights, epochs, reviewers, reward wallet and disclosed commitment. All changes are audit-logged publicly. */
export const PUT = route(async (req: Request, ctx: { params: Promise<{ mint: string }> }) => {
  const wallet = await requireWallet();
  const t = await getToken((await ctx.params).mint);
  if (!t) throw new HttpError(404, "Token not listed");
  if (!t.creator || t.creator !== wallet) throw new HttpError(403, "Only the on-chain verified creator can change settings");
  const b = await body<Record<string, any>>(req);

  const scoring = b.scoring ? mergeConfig(b.scoring) : mergeConfig(t.scoring);
  const errors = validateConfig(scoring);
  if (errors.length) throw new HttpError(400, errors.join("; "));
  const int = (v: unknown, lo: number, hi: number, def: number, label: string) => {
    if (v === undefined) return def;
    const n = Number(v);
    if (!Number.isInteger(n) || n < lo || n > hi) throw new HttpError(400, `${label} must be an integer ${lo}–${hi}`);
    return n;
  };
  const epochDays = int(b.epochDays, 1, 90, t.epoch_days, "epochDays");
  const commitment = int(b.rewardCommitmentBps, 0, 10_000, t.reward_commitment_bps, "rewardCommitmentBps");
  const cap = int(b.rewardCapBps, 100, 10_000, t.reward_cap_bps, "rewardCapBps");
  const minAge = int(b.minWalletAgeDays, 0, 365, t.min_wallet_age_days, "minWalletAgeDays");
  const reviewers: string[] = Array.isArray(b.reviewers) ? [...new Set(b.reviewers.map((r: unknown) => pubkey(r, "reviewer").toBase58()))] : t.reviewers;
  if (reviewers.length > 20) throw new HttpError(400, "At most 20 reviewers");
  const rewardWallet = b.rewardWallet === undefined ? t.reward_wallet : b.rewardWallet ? pubkey(b.rewardWallet, "reward wallet").toBase58() : null;
  const minHold = b.minHoldRaw === undefined ? t.min_hold_raw : /^\d{1,30}$/.test(String(b.minHoldRaw)) ? String(b.minHoldRaw) : (() => { throw new HttpError(400, "minHoldRaw must be a raw integer amount"); })();

  // Epoch boundaries must not move under an existing reward history.
  if (epochDays !== t.epoch_days) {
    const closed = await (await db()).query("select 1 from reward_epochs where mint=$1 limit 1", [t.mint]);
    if (closed.length) throw new HttpError(400, "Epoch length is locked once a reward epoch has been closed");
  }
  if (rewardWallet !== t.reward_wallet) {
    const open = await (await db()).query("select 1 from reward_allocations a join reward_epochs e on e.id=a.epoch_id where e.mint=$1 and a.status='pending' limit 1", [t.mint]);
    if (open.length) throw new HttpError(400, "Pay out pending allocations before changing the reward wallet");
  }

  await (await db()).query(
    `update tokens set scoring=$2, epoch_days=$3, reward_commitment_bps=$4, reward_cap_bps=$5, min_wallet_age_days=$6, reviewers=$7, reward_wallet=$8, min_hold_raw=$9 where mint=$1`,
    [t.mint, JSON.stringify(scoring), epochDays, commitment, cap, minAge, reviewers, rewardWallet, minHold],
  );
  await audit(t.mint, wallet, "settings", { scoring, epochDays, commitment, cap, minAge, reviewers, rewardWallet, minHold });
  return { ok: true };
});
