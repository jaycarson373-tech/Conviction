import { body, route, str } from "@/lib/http.ts";
import { HttpError, requireWallet } from "@/lib/auth.ts";
import { db } from "@/lib/db.ts";
import { audit, getToken } from "@/lib/service.ts";
import { verifyPayout } from "@/lib/solana.ts";
import { memoFor } from "@/lib/rewards.ts";

export const GET = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const id = (await ctx.params).id;
  const d = await db();
  const e = (await d.query("select id, mint, epoch, pot_lamports::text, manifest, manifest_sha256, closed_by, created_at from reward_epochs where id=$1", [id]))[0];
  if (!e) throw new HttpError(404, "Epoch not found");
  const allocations = await d.query("select wallet, points, lamports::text, status, signature, paid_at from reward_allocations where epoch_id=$1 order by lamports desc", [id]);
  return { epoch: e, allocations, memo: memoFor(id) };
});

/** Record a payout transaction: every transfer in it is checked against the published allocations. */
export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const wallet = await requireWallet();
  const id = (await ctx.params).id;
  const d = await db();
  const e = (await d.query<{ id: string; mint: string }>("select id, mint from reward_epochs where id=$1", [id]))[0];
  if (!e) throw new HttpError(404, "Epoch not found");
  const t = await getToken(e.mint);
  if (!t?.reward_wallet || (t.creator !== wallet && t.reward_wallet !== wallet)) throw new HttpError(403, "Only the verified creator or the reward wallet can record payouts");
  const signature = str((await body(req)).signature, "signature", 100, 80);
  const pending = await d.query<{ wallet: string; lamports: string }>("select wallet, lamports::text from reward_allocations where epoch_id=$1 and status='pending'", [id]);
  if (!pending.length) throw new HttpError(409, "All allocations in this epoch are already paid");
  const paid = await verifyPayout(signature, { from: t.reward_wallet, memo: memoFor(id), expected: new Map(pending.map((p) => [p.wallet, BigInt(p.lamports)])) });
  if (!paid.length) throw new HttpError(400, "No transfer in this transaction matches a pending allocation");
  for (const w of paid) {
    await d.query("update reward_allocations set status='paid', signature=$3, paid_at=now() where epoch_id=$1 and wallet=$2 and status='pending'", [id, w, signature]);
  }
  await audit(e.mint, wallet, "payout", { epoch: id, signature, recipients: paid.length });
  return { paid };
});
