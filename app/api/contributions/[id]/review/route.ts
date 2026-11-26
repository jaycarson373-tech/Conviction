import { body, route } from "@/lib/http.ts";
import { HttpError, requireWallet } from "@/lib/auth.ts";
import { db } from "@/lib/db.ts";
import { audit, canModerate, getToken } from "@/lib/service.ts";

const REASONS = ["spam", "duplicate", "undisclosed-paid", "low-effort", "off-topic", "not-original", "other"] as const;
/** Rejections that count as strikes against the contributor's score. */
const STRIKES = new Set(["spam", "undisclosed-paid", "not-original"]);

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const wallet = await requireWallet();
  const id = (await ctx.params).id;
  const d = await db();
  const c = (await d.query<{ id: string; mint: string; wallet: string; status: string }>("select id, mint, wallet, status from contributions where id=$1", [id]))[0];
  if (!c) throw new HttpError(404, "Contribution not found");
  const t = await getToken(c.mint);
  if (!t || !canModerate(t, wallet)) throw new HttpError(403, "Only this token's creator and reviewers can review");
  if (c.wallet === wallet) throw new HttpError(403, "You can't review your own contribution");
  if (c.status !== "pending") throw new HttpError(409, "Already reviewed");
  const b = await body(req);
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 500) : null;
  if (b.decision === "approve") {
    const q = Number(b.quality);
    if (!Number.isInteger(q) || q < 1 || q > 5) throw new HttpError(400, "Quality must be 1–5");
    await d.query("update contributions set status='approved', quality=$2, reviewer=$3, review_note=$4, reviewed_at=now() where id=$1 and status='pending'", [id, q, wallet, note]);
    await audit(c.mint, wallet, "approve", { id, quality: q });
    return { ok: true };
  }
  if (b.decision === "reject") {
    const reason = String(b.reason);
    if (!REASONS.includes(reason as never)) throw new HttpError(400, "Choose a rejection reason");
    const strike = STRIKES.has(reason);
    await d.query("update contributions set status='rejected', reject_reason=$2, strike=$3, reviewer=$4, review_note=$5, reviewed_at=now() where id=$1 and status='pending'", [id, reason, strike, wallet, note]);
    await audit(c.mint, wallet, "reject", { id, reason, strike });
    return { ok: true };
  }
  throw new HttpError(400, "decision must be approve or reject");
});
