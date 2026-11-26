import { route } from "@/lib/http.ts";
import { profile } from "@/lib/service.ts";
import { pubkey } from "@/lib/solana.ts";

export const GET = route(async (_req: Request, ctx: { params: Promise<{ wallet: string }> }) => profile(pubkey((await ctx.params).wallet, "wallet").toBase58()));
