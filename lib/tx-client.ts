"use client";
import { Buffer } from "buffer";
import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction, VersionedTransaction, type Keypair } from "@solana/web3.js";
import { rpcUrl, signTransaction, type StdAccount, type StdWallet } from "./wallet-client.ts";

const MEMO = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export const browserConnection = () => new Connection(rpcUrl(), { commitment: "confirmed", disableRetryOnRateLimit: false });

/** Poll signature status (no websockets needed through the RPC relay). */
export async function confirm(conn: Connection, signature: string, lastValidBlockHeight: number, onTick?: (s: string) => void) {
  for (let i = 0; i < 90; i++) {
    const st = (await conn.getSignatureStatuses([signature])).value[0];
    if (st?.err) throw new Error(`Transaction failed on-chain: ${JSON.stringify(st.err)}`);
    if (st?.confirmationStatus === "confirmed" || st?.confirmationStatus === "finalized") return;
    if (i % 5 === 4) {
      const h = await conn.getBlockHeight("confirmed").catch(() => 0);
      if (h > lastValidBlockHeight) throw new Error("Transaction expired before confirmation. Nothing was charged; try again.");
    }
    onTick?.(`Confirming… ${i + 1}s`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Not confirmed yet. Check the signature on Solscan before retrying.");
}

/** Sign a server-built transaction: add the new mint's signature, then the wallet's, then broadcast. */
export async function signAndSendLaunch(w: StdWallet, account: StdAccount, base64: string, mint: Keypair, onTick?: (s: string) => void): Promise<string> {
  const conn = browserConnection();
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  let wire: Uint8Array;
  const versioned = (bytes[1 + 64 * bytes[0]] & 0x80) !== 0; // first message byte after the signature section
  if (versioned) {
    const tx = VersionedTransaction.deserialize(bytes);
    tx.sign([mint]);
    wire = tx.serialize();
  } else {
    const tx = Transaction.from(Buffer.from(bytes));
    tx.partialSign(mint);
    wire = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  }
  onTick?.("Approve in your wallet…");
  const signed = await signTransaction(w, account, wire);
  const { lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  onTick?.("Broadcasting…");
  const sig = await conn.sendRawTransaction(signed, { skipPreflight: false, maxRetries: 3 });
  await confirm(conn, sig, lastValidBlockHeight + 150, onTick);
  return sig;
}

/** One payout transaction: memo + up to 10 System transfers from the reward wallet. */
export async function sendPayout(w: StdWallet, account: StdAccount, memo: string, items: { wallet: string; lamports: string }[], onTick?: (s: string) => void): Promise<string> {
  const conn = browserConnection();
  const from = new PublicKey(account.address);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: from, blockhash, lastValidBlockHeight });
  tx.add(new TransactionInstruction({ programId: MEMO, keys: [], data: Buffer.from(memo, "utf8") }));
  for (const it of items) tx.add(SystemProgram.transfer({ fromPubkey: from, toPubkey: new PublicKey(it.wallet), lamports: BigInt(it.lamports) }));
  onTick?.("Approve the payout in your wallet…");
  const signed = await signTransaction(w, account, tx.serialize({ requireAllSignatures: false, verifySignatures: false }));
  onTick?.("Broadcasting…");
  const sig = await conn.sendRawTransaction(signed, { maxRetries: 3 });
  await confirm(conn, sig, lastValidBlockHeight, onTick);
  return sig;
}
