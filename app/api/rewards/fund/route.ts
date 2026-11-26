import { body, route, str } from "@/lib/http.ts";
import { HttpError, requireWallet } from "@/lib/auth.ts";
import { db } from "@/lib/db.ts";
import { audit, getToken } from "@/lib/service.ts";
import { verifyFunding } from "@/lib/solana.ts";

/**
 * The creator designates a confirmed transaction that added SOL to the reward wallet
 * (a creator-fee claim or a transfer) as reward budget. Only verified amounts count.
 */
export const POST = route(async (req: Request) => {
  const wallet = await requireWallet();
  const b = await body(req);
  const t = await getToken(str(b.mint, "mint", 44, 32));
  if (!t) throw new HttpError(404, "Token not listed");
  if (t.creator !== wallet) throw new HttpError(403, "Only the verified creator can designate reward funding");
  if (!t.reward_wallet) throw new HttpError(400, "Set a reward wallet in settings first");
  const signature = str(b.signature, "Transaction signature", 100, 80);
  const d = await db();
  const used = await d.query("select mint from reward_fundings where signature=$1", [signature]);
  if (used.length) throw new HttpError(409, "This transaction is already recorded as funding");
  const f = await verifyFunding(signature, t.reward_wallet);
  await d.query("insert into reward_fundings(signature, mint, wallet, lamports, source, block_time, recorded_by) values ($1,$2,$3,$4,$5,$6,$7)", [
    signature,
    t.mint,
    t.reward_wallet,
    f.lamports,
    f.source,
    f.blockTime ? new Date(f.blockTime * 1000) : null,
    wallet,
  ]);
  await audit(t.mint, wallet, "fund", { signature, lamports: f.lamports, source: f.source });
  return { lamports: f.lamports, source: f.source };
});
