"use client";
/**
 * Browser wallet layer on the Wallet Standard (Phantom, Solflare, Backpack, … autodetected).
 * Ported from Jay's zil-launchpad / wanted-meteora signing code: the signed transaction's
 * message must be byte-identical to what we built, or nothing is sent.
 */
import { getWallets } from "@wallet-standard/app";
import { getTransactionDecoder } from "@solana/kit";
import bs58 from "bs58";

export type StdWallet = { name: string; icon: string; chains: readonly string[]; accounts: readonly StdAccount[]; features: Record<string, any> };
export type StdAccount = { address: string; publicKey: Uint8Array; chains: readonly string[]; features: readonly string[] };

export const CHAIN = "solana:mainnet";

export function listWallets(): StdWallet[] {
  return (getWallets().get() as unknown as StdWallet[]).filter(
    (w) => w.features["standard:connect"] && (w.features["solana:signTransaction"] || w.features["solana:signMessage"]) && (w.chains ?? []).some((c) => c.startsWith("solana:")),
  );
}

export function onWalletsChange(fn: () => void) {
  const r = getWallets();
  const a = r.on("register", fn);
  const b = r.on("unregister", fn);
  return () => {
    a();
    b();
  };
}

export async function connect(w: StdWallet, silent = false): Promise<StdAccount> {
  const { accounts } = await w.features["standard:connect"].connect(silent ? { silent: true } : undefined);
  const acct = (accounts as StdAccount[]).find((a) => a.chains.includes(CHAIN)) ?? (accounts as StdAccount[])[0];
  if (!acct) throw new Error("No Solana account selected in the wallet");
  return acct;
}

export async function disconnect(w: StdWallet) {
  await w.features["standard:disconnect"]?.disconnect?.();
}

export async function signMessage(w: StdWallet, account: StdAccount, text: string): Promise<string> {
  const f = w.features["solana:signMessage"];
  if (!f) throw new Error(`${w.name} cannot sign messages`);
  const [out] = await f.signMessage({ account, message: new TextEncoder().encode(text) });
  return bs58.encode(out.signature);
}

/** Wallet-sign serialized transaction bytes; verifies the wallet didn't alter the message. */
export async function signTransaction(w: StdWallet, account: StdAccount, wire: Uint8Array): Promise<Uint8Array> {
  const f = w.features["solana:signTransaction"];
  if (!f) throw new Error(`${w.name} cannot sign transactions`);
  const before = getTransactionDecoder().decode(wire);
  if (!Object.keys(before.signatures).includes(account.address)) throw new Error("Connected wallet is not a signer of this transaction");
  const [out] = await f.signTransaction({ account, chain: CHAIN, transaction: wire });
  const signed: Uint8Array = out.signedTransaction;
  const after = getTransactionDecoder().decode(signed);
  const a = new Uint8Array(before.messageBytes);
  const b = new Uint8Array(after.messageBytes);
  if (a.length !== b.length || a.some((x, i) => x !== b[i])) throw new Error("The wallet changed the transaction. Nothing was sent.");
  return signed;
}

export const rpcUrl = () => (typeof window === "undefined" ? "" : `${window.location.origin}/api/rpc`);

export async function api<T = any>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const r = await fetch(path, {
    ...init,
    headers: { ...(init?.json !== undefined ? { "content-type": "application/json" } : {}), ...(init?.headers ?? {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
  return j as T;
}
