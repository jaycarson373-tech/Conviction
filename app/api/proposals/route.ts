import crypto from "node:crypto";
import { body, limit, route, str } from "@/lib/http.ts";
import { HttpError, requireWallet } from "@/lib/auth.ts";
import { db } from "@/lib/db.ts";
import { audit, canModerate, currentEpoch, getToken } from "@/lib/service.ts";

export const GET = route(async (req: Request) => {
  const mint = new URL(req.url).searchParams.get("mint");
  if (!mint) throw new HttpError(400, "mint is required");
  const d = await db();
  const proposals = await d.query<{ id: string; options: string[] }>("select * from proposals where mint=$1 order by created_at desc limit 50", [mint]);
  const tallies = await d.query<{ proposal_id: string; choice: number; n: string }>(
    "select v.proposal_id, v.choice, count(*)::text as n from votes v join proposals p on p.id=v.proposal_id where p.mint=$1 group by v.proposal_id, v.choice",
    [mint],
  );
  return {
    proposals: proposals.map((p) => ({
      ...p,
      tally: p.options.map((_, i) => Number(tallies.find((t) => t.proposal_id === p.id && t.choice === i)?.n ?? 0)),
    })),
  };
});

/** Creator / reviewers open proposals; members vote with wallet-signed messages. */
export const POST = route(async (req: Request) => {
  const wallet = await requireWallet();
  const b = await body(req);
  const t = await getToken(str(b.mint, "mint", 44, 32));
  if (!t) throw new HttpError(404, "Token not listed");
  if (!canModerate(t, wallet)) throw new HttpError(403, "Only the creator and reviewers can open proposals");
  limit(`proposal:${t.mint}`, 10, 86_400_000);
  const title = str(b.title, "Title", 140, 6);
  const text = typeof b.body === "string" ? b.body.trim().slice(0, 4000) : "";
  const options = Array.isArray(b.options) ? b.options.map((o: unknown) => str(o, "Option", 60)).slice(0, 6) : [];
  if (options.length < 2) throw new HttpError(400, "At least two options");
  const days = Number(b.days ?? 3);
  if (!(days >= 1 && days <= 14)) throw new HttpError(400, "Voting period must be 1–14 days");
  const id = crypto.randomUUID();
  await (await db()).query("insert into proposals(id, mint, author, title, body, options, ends_at, epoch) values ($1,$2,$3,$4,$5,$6,$7,$8)", [
    id,
    t.mint,
    wallet,
    title,
    text,
    JSON.stringify(options),
    new Date(Date.now() + days * 86_400_000),
    currentEpoch(t),
  ]);
  await audit(t.mint, wallet, "proposal", { id, title });
  return { id };
});
