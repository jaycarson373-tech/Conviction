import { body, route, str } from "@/lib/http.ts";
import { HttpError, requireWallet } from "@/lib/auth.ts";
import { db } from "@/lib/db.ts";
import { audit, canModerate, getToken } from "@/lib/service.ts";
import { pubkey } from "@/lib/solana.ts";

/** Reviewers flag (or clear) wallets they believe are Sybil / coordinated. Flags exclude rewards and are public. */
export const POST = route(async (req: Request) => {
  const wallet = await requireWallet();
  const b = await body(req);
  const t = await getToken(str(b.mint, "mint", 44, 32));
  if (!t || !canModerate(t, wallet)) throw new HttpError(403, "Only this token's creator and reviewers can flag wallets");
  const target = pubkey(b.wallet, "wallet").toBase58();
  const d = await db();
  if (b.clear === true) {
    await d.query("delete from sybil_flags where mint=$1 and wallet=$2", [t.mint, target]);
    await audit(t.mint, wallet, "sybil-clear", { wallet: target });
    return { ok: true };
  }
  const reason = str(b.reason, "Reason", 300, 6);
  await d.query(
    "insert into sybil_flags(mint, wallet, reason, flagged_by) values ($1,$2,$3,$4) on conflict (mint, wallet) do update set reason=excluded.reason, flagged_by=excluded.flagged_by",
    [t.mint, target, reason, wallet],
  );
  await audit(t.mint, wallet, "sybil-flag", { wallet: target, reason });
  return { ok: true };
});

export const GET = route(async (req: Request) => {
  const mint = new URL(req.url).searchParams.get("mint");
  if (!mint) throw new HttpError(400, "mint is required");
  return { flags: await (await db()).query("select wallet, reason, flagged_by, created_at from sybil_flags where mint=$1 order by created_at desc", [mint]) };
});
