import { body, route, str } from "@/lib/http.ts";
import { HttpError, requireWallet, verifyEd25519 } from "@/lib/auth.ts";
import { db } from "@/lib/db.ts";
import { audit, currentEpoch, ensureMember, getToken, verifiedHolding } from "@/lib/service.ts";
import { voteMessage } from "@/lib/siws.ts";

/**
 * A vote is a wallet-signed message (stored verbatim with its signature, verifiable by anyone).
 * Eligible voters: wallets currently holding the token, or with an approved contribution.
 * One vote per wallet per proposal.
 */
export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const wallet = await requireWallet();
  const id = (await ctx.params).id;
  const d = await db();
  const p = (await d.query<{ id: string; mint: string; title: string; options: string[]; ends_at: Date }>("select * from proposals where id=$1", [id]))[0];
  if (!p) throw new HttpError(404, "Proposal not found");
  if (new Date(p.ends_at).getTime() < Date.now()) throw new HttpError(409, "Voting has ended");
  const t = await getToken(p.mint);
  if (!t) throw new HttpError(404, "Token not listed");
  const b = await body(req);
  const choice = Number(b.choice);
  if (!Number.isInteger(choice) || choice < 0 || choice >= p.options.length) throw new HttpError(400, "Invalid choice");
  const at = str(b.at, "timestamp", 40);
  if (Math.abs(Date.parse(at) - Date.now()) > 10 * 60_000) throw new HttpError(400, "Signature is stale; sign again");
  const message = voteMessage({ mint: p.mint, proposalId: p.id, title: p.title, choice, label: p.options[choice], address: wallet, at });
  if (b.message !== message) throw new HttpError(400, "Signed message does not match this vote");
  const signature = str(b.signature, "signature", 120);
  if (!verifyEd25519(wallet, message, signature)) throw new HttpError(401, "Invalid vote signature");

  const contributor = await d.query("select 1 from contributions where mint=$1 and wallet=$2 and status='approved' limit 1", [p.mint, wallet]);
  if (!contributor.length) {
    const h = await verifiedHolding(t, wallet);
    if (!h.since) throw new HttpError(403, "Only holders or approved contributors can vote");
  }
  const r = await d.query(
    "insert into votes(proposal_id, wallet, choice, message, signature, epoch) values ($1,$2,$3,$4,$5,$6) on conflict do nothing returning wallet",
    [p.id, wallet, choice, message, signature, currentEpoch(t)],
  );
  if (!r.length) throw new HttpError(409, "You already voted on this proposal");
  await ensureMember(p.mint, wallet);
  await audit(p.mint, wallet, "vote", { proposal: p.id, choice });
  return { ok: true };
});
