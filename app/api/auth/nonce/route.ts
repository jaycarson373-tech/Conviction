import { route } from "@/lib/http.ts";
import { expectedDomain, issueNonce } from "@/lib/auth.ts";

export const GET = route(async () => {
  const { nonce, expiresAt } = issueNonce();
  return { nonce, expiresAt, issuedAt: new Date().toISOString(), domain: await expectedDomain() };
});
