import { route } from "@/lib/http.ts";
import { endSession } from "@/lib/auth.ts";

export const POST = route(async () => {
  await endSession();
  return { ok: true };
});
