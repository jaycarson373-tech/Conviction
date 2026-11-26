import crypto from "node:crypto";
import { body, canonicalUrl, httpsUrl, limit, route, str } from "@/lib/http.ts";
import { HttpError, requireWallet } from "@/lib/auth.ts";
import { db } from "@/lib/db.ts";
import { audit, currentEpoch, ensureMember, getToken } from "@/lib/service.ts";
import { CONTRIBUTION_TYPES, type ContributionType } from "@/lib/scoring.ts";

export const GET = route(async (req: Request) => {
  const u = new URL(req.url);
  const where: string[] = [];
  const p: unknown[] = [];
  for (const k of ["mint", "wallet", "status"] as const) {
    const v = u.searchParams.get(k);
    if (v) {
      p.push(v);
      where.push(`c.${k} = $${p.length}`);
    }
  }
  const rows = await (await db()).query(
    `select c.id, c.mint, c.wallet, c.type, c.title, c.url, c.body, c.paid, c.paid_by, c.status, c.quality, c.reject_reason, c.strike,
            c.reviewer, c.review_note, c.epoch, c.created_at, c.reviewed_at, t.symbol, t.name
     from contributions c join tokens t on t.mint=c.mint ${where.length ? `where ${where.join(" and ")}` : ""}
     order by c.created_at desc limit 200`,
    p,
  );
  return { contributions: rows };
});

export const POST = route(async (req: Request) => {
  const wallet = await requireWallet();
  const b = await body(req);
  const t = await getToken(str(b.mint, "mint", 44, 32));
  if (!t) throw new HttpError(404, "Token not listed");
  limit(`contrib:${wallet}:${t.mint}`, 5, 86_400_000);
  limit(`contrib:${wallet}`, 20, 86_400_000);
  const type = b.type as ContributionType;
  if (!CONTRIBUTION_TYPES.includes(type)) throw new HttpError(400, "Choose a contribution type");
  const title = str(b.title, "Title", 120, 4);
  const url = httpsUrl(b.url, "Link");
  const text = typeof b.body === "string" ? b.body.trim().slice(0, 2000) : "";
  const paid = b.paid === true;
  const paidBy = paid ? str(b.paidBy, "Who paid you", 120, 2) : null;
  if (b.original !== true) throw new HttpError(400, "Confirm the work is original or properly credited");
  const hash = crypto.createHash("sha256").update(canonicalUrl(url)).digest("hex");
  const d = await db();
  const dup = await d.query("select id from contributions where mint=$1 and url_hash=$2", [t.mint, hash]);
  if (dup.length) throw new HttpError(409, "This link was already submitted to this community");
  const id = crypto.randomUUID();
  await d.query(
    `insert into contributions(id, mint, wallet, type, title, url, url_hash, body, paid, paid_by, epoch) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id, t.mint, wallet, type, title, url, hash, text, paid, paidBy, currentEpoch(t)],
  );
  await ensureMember(t.mint, wallet);
  await audit(t.mint, wallet, "contribution", { id, type, paid });
  return { id, status: "pending" };
});
