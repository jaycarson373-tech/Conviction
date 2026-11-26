import { route } from "@/lib/http.ts";
import { tokenDetail } from "@/lib/queries.ts";
import { HttpError } from "@/lib/auth.ts";

export const GET = route(async (_req: Request, ctx: { params: Promise<{ mint: string }> }) => {
  const d = await tokenDetail((await ctx.params).mint);
  if (!d) throw new HttpError(404, "Token not listed on ConvictionPad");
  return d;
});
