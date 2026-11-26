import { body, limit, route, str } from "@/lib/http.ts";
import { requireWallet } from "@/lib/auth.ts";
import { registerToken, type Venue } from "@/lib/registry.ts";
import { listTokens } from "@/lib/queries.ts";

export const GET = route(async () => ({ tokens: await listTokens() }));

/** Import an existing mint (any venue). Creator rights only with an on-chain proof. */
export const POST = route(async (req: Request) => {
  const wallet = await requireWallet();
  limit(`import:${wallet}`, 10, 3600_000);
  const b = await body(req);
  const hint = b.venue === "raydium-launchlab" ? ("raydium-launchlab" as Venue) : undefined;
  return registerToken({ mint: str(b.mint, "mint", 44, 32), listedBy: wallet, venueHint: hint });
});
