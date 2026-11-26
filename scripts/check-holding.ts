/** Dev tool: verify holding history for recent buyers of a mint (read-only).  node scripts/check-holding.ts <MINT> */
import { PublicKey } from "@solana/web3.js";
import { connection, holdingHistory, tokenInfo, walletFirstSeen } from "../lib/solana.ts";
const mint = new PublicKey(process.argv[2]);
const c = connection();
const info = await tokenInfo(mint);
// find recent buyers from the mint's own history
const sigs = await c.getSignaturesForAddress(mint, { limit: 25 });
const owners = new Set<string>();
for (const s of sigs) {
  const tx = await c.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 1 }).catch(() => null);
  for (const b of tx?.meta?.postTokenBalances ?? []) if (b.mint === mint.toBase58() && b.owner && Number(b.uiTokenAmount.amount) > 0) owners.add(b.owner);
  if (owners.size >= 3) break;
  await new Promise((r) => setTimeout(r, 250));
}
console.log(info.symbol, info.programId.slice(0, 6), "owners", [...owners].length);
for (const o of [...owners].slice(0, 3)) {
  const h = await holdingHistory(mint, new PublicKey(o), new PublicKey(info.programId), 1n);
  const age = await walletFirstSeen(new PublicKey(o), 1);
  console.log(o.slice(0, 6), "balance", h.balanceRaw, "since", h.since ? new Date(h.since).toISOString() : null, "partial", h.partial, "| wallet first seen", age.firstSeen ? new Date(age.firstSeen).toISOString() : null, age.partial ? "(≥)" : "");
}
