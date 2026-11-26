import { body, route, str } from "@/lib/http.ts";
import { requireWallet } from "@/lib/auth.ts";
import { registerToken } from "@/lib/registry.ts";

/** After the browser broadcasts the launch: verify it on-chain, then register the token. */
export const POST = route(async (req: Request) => {
  const wallet = await requireWallet();
  const b = await body(req);
  const mint = str(b.mint, "mint", 44, 32);
  const signature = str(b.signature, "signature", 100, 80);
  // The mint can take a moment to be visible at "confirmed"; retry briefly.
  let lastErr: unknown;
  for (let i = 0; i < 8; i++) {
    try {
      return await registerToken({ mint, listedBy: wallet, launchSig: signature });
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
  throw lastErr;
});
