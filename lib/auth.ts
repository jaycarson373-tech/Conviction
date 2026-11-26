/**
 * Server-side wallet auth: HMAC nonces, ed25519 verification, signed session cookies.
 * No custody, no keys: a session only proves "this browser controls this wallet".
 */
import crypto from "node:crypto";
import bs58 from "bs58";
import { cookies, headers } from "next/headers";
import { db } from "./db.ts";
import { parseSiws } from "./siws.ts";

const COOKIE = "cp_session";
const SESSION_DAYS = 7;

function secret(): Buffer {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return Buffer.from(s);
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET (32+ chars) is required in production");
  return Buffer.from("dev-only-session-secret-change-me-0000000000");
}

const hmac = (data: string) => crypto.createHmac("sha256", secret()).update(data).digest("base64url");

export function verifyEd25519(address: string, message: string | Uint8Array, signatureB58: string): boolean {
  try {
    const pub = bs58.decode(address);
    const sig = bs58.decode(signatureB58);
    if (pub.length !== 32 || sig.length !== 64) return false;
    const key = crypto.createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: Buffer.from(pub).toString("base64url") }, format: "jwk" });
    const msg = typeof message === "string" ? Buffer.from(message, "utf8") : Buffer.from(message);
    return crypto.verify(null, msg, key, Buffer.from(sig));
  } catch {
    return false;
  }
}

/** Nonce = random.expiry.hmac → any server instance can check it; single use is enforced in the DB. */
export function issueNonce(ttlMs = 10 * 60_000): { nonce: string; expiresAt: string } {
  const exp = Date.now() + ttlMs;
  const r = crypto.randomBytes(12).toString("base64url");
  return { nonce: `${r}.${exp}.${hmac(`${r}.${exp}`).slice(0, 22)}`, expiresAt: new Date(exp).toISOString() };
}

function nonceValid(nonce: string): number | null {
  const [r, exp, mac] = nonce.split(".");
  if (!r || !exp || !mac) return null;
  const expected = hmac(`${r}.${exp}`).slice(0, 22);
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  const e = Number(exp);
  return Number.isFinite(e) && e > Date.now() ? e : null;
}

export async function expectedDomain(): Promise<string> {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site) return new URL(site).host;
  const h = await headers();
  return h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
}

export async function verifySignIn(message: string, signature: string): Promise<{ ok: true; address: string } | { ok: false; error: string }> {
  const f = parseSiws(message);
  if (!f) return { ok: false, error: "Malformed sign-in message" };
  if (f.domain !== (await expectedDomain())) return { ok: false, error: "Sign-in message is for a different site" };
  const exp = nonceValid(f.nonce);
  if (!exp) return { ok: false, error: "Sign-in request expired. Try again." };
  if (Date.parse(f.expiresAt) > exp || Date.parse(f.expiresAt) < Date.now()) return { ok: false, error: "Sign-in request expired. Try again." };
  if (!verifyEd25519(f.address, message, signature)) return { ok: false, error: "Invalid signature" };
  const used = await (await db()).query("insert into auth_nonces(nonce) values ($1) on conflict do nothing returning nonce", [f.nonce]);
  if (!used.length) return { ok: false, error: "This sign-in request was already used" };
  return { ok: true, address: f.address };
}

export async function startSession(address: string) {
  const exp = Date.now() + SESSION_DAYS * 86_400_000;
  const payload = `${address}.${exp}`;
  (await cookies()).set(COOKIE, `${payload}.${hmac(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(exp),
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function sessionWallet(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [address, exp, mac] = parts;
  const expected = hmac(`${address}.${exp}`);
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  if (!(Number(exp) > Date.now())) return null;
  return address;
}

export async function requireWallet(): Promise<string> {
  const w = await sessionWallet();
  if (!w) throw new HttpError(401, "Connect and sign in with your wallet first.");
  return w;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
