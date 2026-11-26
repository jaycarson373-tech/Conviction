/**
 * Launch transaction builders. The server never holds a user key:
 *   - it builds an unsigned transaction for the creator's wallet,
 *   - the browser generates the new mint keypair and adds its signature,
 *   - the wallet signs, the browser broadcasts, and /api/launch/confirm verifies on-chain
 *     before the token is registered.
 */
import { PublicKey, VersionedTransaction, Transaction, ComputeBudgetProgram } from "@solana/web3.js";
import { connection } from "./solana.ts";
import { HttpError } from "./auth.ts";

export interface LaunchMeta {
  name: string;
  symbol: string;
  uri: string;
}

/** Venues and what is operational in this build. Surfaced on /launch and /docs. */
export function venues() {
  return [
    { id: "pumpfun", label: "Pump.fun", status: "live" as const, detail: "Bonding curve via PumpPortal local transactions; graduates to PumpSwap. Signed in your wallet." },
    {
      id: "meteora-dbc",
      label: "Meteora DBC",
      status: process.env.DBC_CONFIG ? ("live" as const) : ("not-configured" as const),
      detail: process.env.DBC_CONFIG
        ? "Dynamic Bonding Curve on the ConvictionPad config; migrates to DAMM v2. Signed in your wallet."
        : "Operator has not created the platform DBC config yet (npm run dbc:config). No Meteora launches are possible until then.",
    },
    { id: "raydium-launchlab", label: "Raydium LaunchLab", status: "planned" as const, detail: "Direct creation is a planned integration. Tokens already launched on LaunchLab can be imported today." },
  ];
}

/** Metadata → IPFS. Pinata when PINATA_JWT is set, else pump.fun's public IPFS endpoint. */
export async function uploadMetadata(form: FormData): Promise<string> {
  const jwt = process.env.PINATA_JWT;
  if (jwt) {
    const file = form.get("file");
    if (!(file instanceof Blob)) throw new HttpError(400, "Image is required");
    const up = new FormData();
    up.append("file", file, "image");
    up.append("network", "public");
    const r = await fetch("https://uploads.pinata.cloud/v3/files", { method: "POST", headers: { Authorization: `Bearer ${jwt}` }, body: up });
    if (!r.ok) throw new HttpError(502, `Image upload failed (${r.status})`);
    const cid = ((await r.json()) as { data: { cid: string } }).data.cid;
    const meta = {
      name: form.get("name"),
      symbol: form.get("symbol"),
      description: form.get("description") ?? "",
      image: `https://ipfs.io/ipfs/${cid}`,
      twitter: form.get("twitter") || undefined,
      telegram: form.get("telegram") || undefined,
      website: form.get("website") || undefined,
    };
    const up2 = new FormData();
    up2.append("file", new Blob([JSON.stringify(meta)], { type: "application/json" }), "metadata.json");
    up2.append("network", "public");
    const r2 = await fetch("https://uploads.pinata.cloud/v3/files", { method: "POST", headers: { Authorization: `Bearer ${jwt}` }, body: up2 });
    if (!r2.ok) throw new HttpError(502, `Metadata upload failed (${r2.status})`);
    return `https://ipfs.io/ipfs/${((await r2.json()) as { data: { cid: string } }).data.cid}`;
  }
  const r = await fetch("https://pump.fun/api/ipfs", { method: "POST", body: form, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new HttpError(502, `Metadata upload failed (${r.status}). Try again or configure PINATA_JWT.`);
  const j = (await r.json()) as { metadataUri?: string };
  if (!j.metadataUri) throw new HttpError(502, "Metadata upload returned no URI");
  return j.metadataUri;
}

/** pump.fun create (+ optional dev buy) through PumpPortal's local-transaction API. */
export async function pumpCreateTx(o: { creator: string; mint: string; meta: LaunchMeta; devBuySol: number; slippagePct: number; priorityFeeSol: number }): Promise<string> {
  if (!(o.devBuySol >= 0 && o.devBuySol <= 50)) throw new HttpError(400, "Dev buy must be 0–50 SOL");
  const r = await fetch("https://pumpportal.fun/api/trade-local", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      publicKey: o.creator,
      action: "create",
      tokenMetadata: o.meta,
      mint: o.mint,
      denominatedInSol: "true",
      amount: o.devBuySol,
      slippage: o.slippagePct,
      priorityFee: o.priorityFeeSol,
      pool: "pump",
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (r.status !== 200) throw new HttpError(502, `PumpPortal could not build the launch (${r.status}): ${(await r.text()).slice(0, 160)}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  const tx = VersionedTransaction.deserialize(bytes);
  const keys = tx.message.staticAccountKeys.map((k) => k.toBase58());
  if (keys[0] !== o.creator || !keys.includes(o.mint)) throw new HttpError(502, "PumpPortal returned an unexpected transaction. Nothing was signed.");
  return Buffer.from(bytes).toString("base64");
}

/** Meteora DBC createPool on the platform config. Returns a legacy tx, fee payer = creator. */
export async function dbcCreateTx(o: { creator: string; mint: string; meta: LaunchMeta }): Promise<string> {
  const config = process.env.DBC_CONFIG;
  if (!config) throw new HttpError(503, "Meteora launches are not configured on this deployment.");
  const { DynamicBondingCurveClient } = await import("@meteora-ag/dynamic-bonding-curve-sdk");
  const c = connection();
  const sdk = new DynamicBondingCurveClient(c, "confirmed");
  const tx: Transaction = await sdk.creator.createPool({
    name: o.meta.name,
    symbol: o.meta.symbol,
    uri: o.meta.uri,
    payer: new PublicKey(o.creator),
    poolCreator: new PublicKey(o.creator),
    config: new PublicKey(config),
    baseMint: new PublicKey(o.mint),
  });
  tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
  tx.feePayer = new PublicKey(o.creator);
  tx.recentBlockhash = (await c.getLatestBlockhash("confirmed")).blockhash;
  const wire = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  const sim = await c.simulateTransaction(VersionedTransaction.deserialize(wire), { sigVerify: false, commitment: "confirmed" });
  if (sim.value.err) throw new HttpError(400, `Simulation failed: ${JSON.stringify(sim.value.err)}. Nothing was signed.`);
  return Buffer.from(wire).toString("base64");
}

export function validateMeta(v: Record<string, unknown>): LaunchMeta {
  const name = typeof v.name === "string" ? v.name.trim() : "";
  const symbol = typeof v.symbol === "string" ? v.symbol.trim().toUpperCase() : "";
  const uri = typeof v.uri === "string" ? v.uri.trim() : "";
  if (name.length < 1 || name.length > 32) throw new HttpError(400, "Name must be 1–32 characters");
  if (!/^[A-Z0-9]{1,10}$/.test(symbol)) throw new HttpError(400, "Symbol must be 1–10 letters or digits");
  if (!/^https:\/\/.{5,190}$/.test(uri)) throw new HttpError(400, "Metadata URI missing — upload the image first");
  return { name, symbol, uri };
}
