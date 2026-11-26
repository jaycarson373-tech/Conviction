/** Dev tool: exercise verifyPayout against a real mainnet memo+transfer transaction (read-only). */
import { PublicKey } from "@solana/web3.js";
import { MEMO_PROGRAM, connection, verifyPayout } from "../lib/solana.ts";

const c = connection();
const sigs = await c.getSignaturesForAddress(MEMO_PROGRAM, { limit: 60 });
for (const s of sigs) {
  if (s.err) continue;
  const tx = await c.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 1 }).catch(() => null);
  if (!tx) continue;
  const ixs = tx.transaction.message.instructions;
  const memo = ixs.find((ix) => ix.programId.equals(MEMO_PROGRAM) && "parsed" in ix);
  const transfers = ixs.filter((ix) => "parsed" in ix && ix.program === "system" && ix.parsed?.type === "transfer");
  if (!memo || !transfers.length || !("parsed" in memo) || typeof memo.parsed !== "string") continue;
  const t = (transfers[0] as any).parsed.info as { source: string; destination: string; lamports: number };
  console.log("tx", s.signature.slice(0, 12), "memo", JSON.stringify(memo.parsed).slice(0, 40), "transfer", t.lamports, "→", t.destination.slice(0, 6));
  const expected = new Map([[t.destination, BigInt(t.lamports)]]);
  const paid = await verifyPayout(s.signature, { from: t.source, memo: memo.parsed, expected });
  console.log(paid.includes(t.destination) ? "✓ matching payout verified" : "✗ expected match", paid);
  const wrongAmount = await verifyPayout(s.signature, { from: t.source, memo: memo.parsed, expected: new Map([[t.destination, BigInt(t.lamports) + 1n]]) });
  console.log(wrongAmount.length === 0 ? "✓ wrong amount not counted" : "✗ wrong amount counted");
  await verifyPayout(s.signature, { from: t.source, memo: "convictionpad:other", expected }).then(() => console.log("✗ wrong memo accepted"), (e) => console.log("✓ wrong memo rejected:", e.message));
  await verifyPayout(s.signature, { from: new PublicKey("11111111111111111111111111111112").toBase58(), memo: memo.parsed, expected }).then(() => console.log("✗ wrong signer accepted"), (e) => console.log("✓ wrong signer rejected"));
  process.exit(0);
}
console.log("no memo+transfer tx in sample");
