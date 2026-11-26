import { body, limit, route, str } from "@/lib/http.ts";
import { HttpError, startSession, verifySignIn } from "@/lib/auth.ts";

export const POST = route(async (req: Request) => {
  limit(`verify:${req.headers.get("x-forwarded-for") ?? "local"}`, 20, 60_000);
  const b = await body(req);
  const r = await verifySignIn(str(b.message, "message", 1000), str(b.signature, "signature", 120));
  if (!r.ok) throw new HttpError(401, r.error);
  await startSession(r.address);
  return { address: r.address };
});
