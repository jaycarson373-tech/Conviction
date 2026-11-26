import { NextResponse } from "next/server";
import { limit } from "@/lib/http.ts";

/** Browser → server RPC relay, so the RPC key stays private. Small method allowlist. */
const ALLOWED = new Set(["getLatestBlockhash", "sendTransaction", "getSignatureStatuses", "getBalance", "getTokenAccountBalance", "getAccountInfo", "simulateTransaction"]);

export async function POST(req: Request) {
  try {
    limit(`rpc:${req.headers.get("x-forwarded-for") ?? "local"}`, 120, 60_000);
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: 429, message: "Too many requests" } }, { status: 429 });
  }
  const text = await req.text();
  if (text.length > 20_000) return NextResponse.json({ error: "too large" }, { status: 413 });
  let msg: { method?: string; id?: unknown };
  try {
    msg = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (Array.isArray(msg) || !msg.method || !ALLOWED.has(msg.method)) {
    return NextResponse.json({ jsonrpc: "2.0", id: msg?.id ?? null, error: { code: -32601, message: "Method not allowed" } }, { status: 403 });
  }
  const r = await fetch(process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com", { method: "POST", headers: { "content-type": "application/json" }, body: text });
  return new NextResponse(await r.text(), { status: r.status, headers: { "content-type": "application/json" } });
}
