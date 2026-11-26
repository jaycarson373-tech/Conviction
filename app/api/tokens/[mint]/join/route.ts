import { limit, route } from "@/lib/http.ts";
import { HttpError, requireWallet } from "@/lib/auth.ts";
import { audit, ensureMember, getToken, memberScore, verifiedHolding } from "@/lib/service.ts";

/** Join a community and (re)verify holding from chain history. */
export const POST = route(async (_req: Request, ctx: { params: Promise<{ mint: string }> }) => {
  const wallet = await requireWallet();
  const t = await getToken((await ctx.params).mint);
  if (!t) throw new HttpError(404, "Token not listed");
  limit(`hold:${wallet}:${t.mint}`, 4, 600_000);
  await ensureMember(t.mint, wallet);
  const holding = await verifiedHolding(t, wallet, true);
  await audit(t.mint, wallet, "verify-holding", { since: holding.since, partial: holding.partial });
  return { holding, score: await memberScore(t, wallet) };
});
