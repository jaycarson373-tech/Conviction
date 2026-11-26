import crypto from "node:crypto";
import { body, route, str } from "@/lib/http.ts";
import { HttpError, requireWallet } from "@/lib/auth.ts";
import { db } from "@/lib/db.ts";
import { audit, currentEpoch, epochPoints, getToken, walletAgeDays } from "@/lib/service.ts";
import { allocate, allocationManifest, epochPot, type Claimant } from "@/lib/rewards.ts";

const LAMPORTS = 1_000_000_000;
/** New system accounts need ≥ rent-exempt minimum; smaller payouts would fail. */
const MIN_PAYOUT = 1_000_000n;

/** Preview (dry run) or close a finished epoch into a published allocation set. */
export const POST = route(async (req: Request) => {
  const wallet = await requireWallet();
  const b = await body(req);
  const t = await getToken(str(b.mint, "mint", 44, 32));
  if (!t) throw new HttpError(404, "Token not listed");
  if (t.creator !== wallet) throw new HttpError(403, "Only the verified creator can close reward epochs");
  if (!t.reward_wallet) throw new HttpError(400, "Set a reward wallet in settings first");
  const epoch = Number(b.epoch);
  if (!Number.isInteger(epoch) || epoch < 0) throw new HttpError(400, "Invalid epoch");
  if (epoch >= currentEpoch(t)) throw new HttpError(400, "Only finished epochs can be closed");
  const budgetSol = Number(b.budgetSol);
  if (!(budgetSol > 0 && budgetSol <= 100_000)) throw new HttpError(400, "Budget must be a positive SOL amount");

  const d = await db();
  if ((await d.query("select 1 from reward_epochs where mint=$1 and epoch=$2", [t.mint, epoch])).length) throw new HttpError(409, "This epoch is already closed");
  const [tot] = await d.query<{ funded: string; allocated: string }>(
    `select (select coalesce(sum(lamports),0) from reward_fundings where mint=$1)::text as funded,
            (select coalesce(sum(a.lamports),0) from reward_allocations a join reward_epochs e on e.id=a.epoch_id where e.mint=$1)::text as allocated`,
    [t.mint],
  );
  const pot = epochPot({ budget: BigInt(Math.round(budgetSol * LAMPORTS)), funded: BigInt(tot.funded), alreadyAllocated: BigInt(tot.allocated) });
  if (pot === 0n) throw new HttpError(400, "No verified, unallocated funding. Record a funding transaction first.");

  const points = await epochPoints(t, epoch);
  const flags = new Map((await d.query<{ wallet: string; reason: string }>("select wallet, reason from sybil_flags where mint=$1", [t.mint])).map((f) => [f.wallet, f.reason]));
  const claimants: Claimant[] = [];
  for (const [w, pts] of [...points].slice(0, 500)) {
    let reason: string | undefined;
    if (w === t.creator || w === t.reward_wallet) reason = "project wallet";
    else if (flags.has(w)) reason = `flagged: ${flags.get(w)}`;
    else if (t.min_wallet_age_days > 0) {
      const age = await walletAgeDays(w).catch(() => ({ days: null, partial: false }));
      if (age.days === null) reason = "wallet age unverifiable";
      else if (age.days < t.min_wallet_age_days && !age.partial) reason = `wallet younger than ${t.min_wallet_age_days} days`;
    }
    claimants.push({ wallet: w, points: pts, eligible: !reason, reason });
  }
  const result = allocate(claimants, { pot, capBps: t.reward_cap_bps, minPayout: MIN_PAYOUT });
  const id = `${t.mint.slice(0, 8)}-e${epoch}`;
  const manifest = allocationManifest(id, pot, result.allocations);
  const sha = crypto.createHash("sha256").update(manifest).digest("hex");
  const preview = { id, epoch, pot: pot.toString(), manifestSha256: sha, allocations: result.allocations, excluded: result.excluded, unallocated: result.unallocated.toString() };
  if (b.commit !== true) return { preview: true, ...preview };
  if (!result.allocations.length) throw new HttpError(400, "No eligible contributions in this epoch; nothing to close");

  await d.tx(async (x) => {
    await x.query("insert into reward_epochs(id, mint, epoch, pot_lamports, manifest, manifest_sha256, closed_by) values ($1,$2,$3,$4,$5,$6,$7)", [id, t.mint, epoch, result.allocations.reduce((s, a) => s + a.lamports, 0n).toString(), manifest, sha, wallet]);
    for (const a of result.allocations) {
      await x.query("insert into reward_allocations(epoch_id, wallet, points, lamports) values ($1,$2,$3,$4)", [id, a.wallet, a.points, a.lamports.toString()]);
    }
  });
  await audit(t.mint, wallet, "close-epoch", { id, epoch, pot: pot.toString(), sha, recipients: result.allocations.length });
  return { preview: false, ...preview };
});
