/**
 * Token registry: launches made through ConvictionPad and imports of existing mints.
 * Creator rights (configure scoring, review, run rewards) require an on-chain proof.
 */
import { PublicKey } from "@solana/web3.js";
import { db, audit } from "./db.ts";
import { HttpError } from "./auth.ts";
import { DBC_PROGRAM, connection, fetchMetadataJson, getTx, pumpCurve, tokenInfo } from "./solana.ts";

export type Venue = "pumpfun" | "meteora-dbc" | "raydium-launchlab" | "other";

async function dbcPoolCreator(mint: PublicKey): Promise<{ pool: string; creator: string } | null> {
  try {
    const { DynamicBondingCurveClient } = await import("@meteora-ag/dynamic-bonding-curve-sdk");
    const client = new DynamicBondingCurveClient(connection(), "confirmed");
    const pool = await client.state.getPoolByBaseMint(mint);
    if (!pool) return null;
    return { pool: pool.publicKey.toBase58(), creator: pool.account.poolState.creator.toBase58() };
  } catch {
    return null;
  }
}

export interface Detected {
  venue: Venue;
  creator: string | null;
  proof: string | null;
  pool: string | null;
}

/** Find where a mint trades and who created it, from chain state only. */
export async function detectVenue(mint: PublicKey): Promise<Detected> {
  const curve = await pumpCurve(mint);
  if (curve) return { venue: "pumpfun", creator: curve.creator, proof: `pump.fun bonding curve ${curve.address} creator field`, pool: curve.address };
  const dbc = await dbcPoolCreator(mint);
  if (dbc) return { venue: "meteora-dbc", creator: dbc.creator, proof: `Meteora DBC pool ${dbc.pool} creator field`, pool: dbc.pool };
  return { venue: "other", creator: null, proof: null, pool: null };
}

export async function registerToken(o: { mint: string; listedBy: string; launchSig?: string; venueHint?: Venue }) {
  let mintKey: PublicKey;
  try {
    mintKey = new PublicKey(o.mint);
  } catch {
    throw new HttpError(400, "Invalid mint address");
  }
  const d = await db();
  const existing = (await d.query<{ mint: string }>("select mint from tokens where mint=$1", [o.mint]))[0];
  if (existing) return { mint: o.mint, existed: true };

  const info = await tokenInfo(mintKey);
  const det = await detectVenue(mintKey);
  let venue: Venue = det.venue === "other" && o.venueHint === "raydium-launchlab" ? "raydium-launchlab" : det.venue;
  let creator = det.creator;
  let proof = det.proof;

  if (o.launchSig) {
    // Launched through ConvictionPad: the launch tx must be confirmed, succeed, be signed by the lister, and touch this mint.
    const tx = await getTx(o.launchSig);
    if (!tx || tx.meta?.err) throw new HttpError(400, "Launch transaction not confirmed or failed");
    const keys = tx.transaction.message.accountKeys;
    if (!keys.some((k) => k.signer && k.pubkey.toBase58() === o.listedBy)) throw new HttpError(400, "Launch transaction was not signed by your wallet");
    if (!keys.some((k) => k.pubkey.toBase58() === o.mint)) throw new HttpError(400, "Launch transaction does not create this mint");
    if (venue === "meteora-dbc" && !keys.some((k) => k.pubkey.equals(DBC_PROGRAM))) throw new HttpError(400, "Not a Meteora DBC launch");
    creator = creator ?? o.listedBy;
    proof = proof ?? `launch transaction ${o.launchSig}`;
  }
  const meta = await fetchMetadataJson(info.uri);
  const links: Record<string, string> = {};
  for (const k of ["website", "twitter", "telegram"] as const) if (meta?.[k] && /^https:\/\//.test(meta[k]!)) links[k] = meta[k]!;

  await d.query(
    `insert into tokens(mint, name, symbol, image, description, venue, creator, creator_proof, launch_sig, pool, token_program, decimals, links, listed_by, reward_wallet)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) on conflict (mint) do nothing`,
    [
      o.mint,
      (info.name ?? "Unnamed token").slice(0, 64),
      (info.symbol ?? o.mint.slice(0, 4)).slice(0, 16),
      meta?.image && /^https:\/\//.test(meta.image) ? meta.image : null,
      meta?.description?.slice(0, 1000) ?? null,
      venue,
      creator,
      proof,
      o.launchSig ?? null,
      det.pool,
      info.programId,
      info.decimals,
      JSON.stringify(links),
      o.listedBy,
      creator,
    ],
  );
  if (creator) await d.query("insert into memberships(mint, wallet) values ($1,$2) on conflict do nothing", [o.mint, creator]);
  await audit(o.mint, o.listedBy, o.launchSig ? "launch" : "import", { venue, creator, proof });
  return { mint: o.mint, existed: false, venue, creator };
}
