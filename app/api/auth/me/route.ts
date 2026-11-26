import { route } from "@/lib/http.ts";
import { sessionWallet } from "@/lib/auth.ts";
import { db } from "@/lib/db.ts";

export const GET = route(async () => {
  const address = await sessionWallet();
  if (!address) return { address: null, moderates: [] };
  const rows = await (await db()).query<{ mint: string }>("select mint from tokens where creator=$1 or $1 = any(reviewers)", [address]);
  return { address, moderates: rows.map((r) => r.mint) };
});
