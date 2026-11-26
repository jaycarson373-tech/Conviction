import { route } from "@/lib/http.ts";
import { HttpError, sessionWallet } from "@/lib/auth.ts";
import { canModerate, getToken, memberScore } from "@/lib/service.ts";

export const GET = route(async (_req: Request, ctx: { params: Promise<{ mint: string }> }) => {
  const wallet = await sessionWallet();
  const t = await getToken((await ctx.params).mint);
  if (!t) throw new HttpError(404, "Token not listed");
  if (!wallet) return { wallet: null, moderator: false };
  return { wallet, moderator: canModerate(t, wallet), creator: t.creator === wallet, score: await memberScore(t, wallet) };
});
