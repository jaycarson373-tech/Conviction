import { route } from "@/lib/http.ts";
import { HttpError } from "@/lib/auth.ts";
import { getToken, leaderboard } from "@/lib/service.ts";

export const GET = route(async (_req: Request, ctx: { params: Promise<{ mint: string }> }) => {
  const t = await getToken((await ctx.params).mint);
  if (!t) throw new HttpError(404, "Token not listed");
  return { members: await leaderboard(t) };
});
