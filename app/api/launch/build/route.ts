import { body, limit, route } from "@/lib/http.ts";
import { HttpError, requireWallet } from "@/lib/auth.ts";
import { dbcCreateTx, pumpCreateTx, validateMeta, venues } from "@/lib/launch.ts";
import { pubkey } from "@/lib/solana.ts";

export const GET = route(async () => ({ venues: venues() }));

/** Build the unsigned launch transaction for the signed-in creator. */
export const POST = route(async (req: Request) => {
  const wallet = await requireWallet();
  limit(`build:${wallet}`, 12, 3600_000);
  const b = await body(req);
  const mint = pubkey(b.mint, "mint").toBase58();
  const meta = validateMeta(b);
  if (b.venue === "pumpfun") {
    const tx = await pumpCreateTx({
      creator: wallet,
      mint,
      meta,
      devBuySol: Number(b.devBuySol ?? 0),
      slippagePct: Math.min(50, Math.max(1, Number(b.slippagePct ?? 10))),
      priorityFeeSol: Math.min(0.01, Math.max(0, Number(b.priorityFeeSol ?? 0.0005))),
    });
    return { venue: "pumpfun", transaction: tx };
  }
  if (b.venue === "meteora-dbc") return { venue: "meteora-dbc", transaction: await dbcCreateTx({ creator: wallet, mint, meta }) };
  if (b.venue === "raydium-launchlab") throw new HttpError(501, "Raydium LaunchLab creation is a planned integration. Launch there and import the mint.");
  throw new HttpError(400, "Unknown venue");
});
