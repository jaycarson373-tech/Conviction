/**
 * On-chain reads and verification (server-side). Everything here comes from the RPC:
 * nothing is estimated, and anything we can't read is returned as null, never zero.
 */
import { Connection, PublicKey, type ParsedTransactionWithMeta } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, getMint, getTokenMetadata } from "@solana/spl-token";

export const PUMP_PROGRAM = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
export const PUMP_AMM_PROGRAM = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");
export const DBC_PROGRAM = new PublicKey("dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN");
export const METAPLEX_METADATA = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
export const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const PUMP_INITIAL_REAL_TOKENS = 793_100_000_000_000n;

let conn: Connection | null = null;
export function connection(): Connection {
  if (!conn) conn = new Connection(process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com", { commitment: "confirmed" });
  return conn;
}

export function pubkey(v: unknown, label = "address"): PublicKey {
  if (typeof v !== "string" || v.length < 32 || v.length > 44) throw new Error(`Invalid ${label}`);
  try {
    return new PublicKey(v);
  } catch {
    throw new Error(`Invalid ${label}`);
  }
}

export interface TokenInfo {
  mint: string;
  programId: string;
  decimals: number;
  supplyRaw: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  name: string | null;
  symbol: string | null;
  uri: string | null;
}

function readBorshString(buf: Buffer, off: number): [string, number] {
  const len = buf.readUInt32LE(off);
  return [buf.subarray(off + 4, off + 4 + len).toString("utf8").replace(/\0/g, "").trim(), off + 4 + len];
}

export async function tokenInfo(mintKey: PublicKey): Promise<TokenInfo> {
  const c = connection();
  const acc = await c.getAccountInfo(mintKey);
  if (!acc) throw new Error("Mint account not found on mainnet");
  const programId = acc.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : acc.owner.equals(TOKEN_PROGRAM_ID) ? TOKEN_PROGRAM_ID : null;
  if (!programId) throw new Error("Account is not an SPL token mint");
  const m = await getMint(c, mintKey, "confirmed", programId);
  let name: string | null = null;
  let symbol: string | null = null;
  let uri: string | null = null;
  if (programId.equals(TOKEN_2022_PROGRAM_ID)) {
    const md = await getTokenMetadata(c, mintKey, "confirmed", programId).catch(() => null);
    if (md) ({ name, symbol, uri } = md);
  }
  if (!name) {
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from("metadata"), METAPLEX_METADATA.toBuffer(), mintKey.toBuffer()], METAPLEX_METADATA);
    const md = await c.getAccountInfo(pda);
    if (md && md.data.length > 70) {
      let off = 1 + 32 + 32;
      [name, off] = readBorshString(md.data, off);
      [symbol, off] = readBorshString(md.data, off);
      [uri] = readBorshString(md.data, off);
    }
  }
  return {
    mint: mintKey.toBase58(),
    programId: programId.toBase58(),
    decimals: m.decimals,
    supplyRaw: m.supply.toString(),
    mintAuthority: m.mintAuthority?.toBase58() ?? null,
    freezeAuthority: m.freezeAuthority?.toBase58() ?? null,
    name: name || null,
    symbol: symbol || null,
    uri: uri || null,
  };
}

/** Off-chain metadata JSON (image, description). Only https/ipfs, short timeout, small body. */
export async function fetchMetadataJson(uri: string | null): Promise<{ image?: string; description?: string; twitter?: string; website?: string; telegram?: string } | null> {
  if (!uri) return null;
  const url = uri.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${uri.slice(7)}` : uri;
  if (!/^https:\/\//.test(url)) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000), redirect: "follow" });
    if (!r.ok) return null;
    const text = (await r.text()).slice(0, 200_000);
    const j = JSON.parse(text);
    const s = (v: unknown) => (typeof v === "string" && v.length < 2000 ? v : undefined);
    return { image: s(j.image), description: s(j.description), twitter: s(j.twitter), website: s(j.website), telegram: s(j.telegram) };
  } catch {
    return null;
  }
}

export interface PumpCurve {
  address: string;
  creator: string;
  complete: boolean;
  progress: number;
  realSolLamports: string;
}

export async function pumpCurve(mintKey: PublicKey): Promise<PumpCurve | null> {
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), mintKey.toBuffer()], PUMP_PROGRAM);
  const acc = await connection().getAccountInfo(pda);
  if (!acc || !acc.owner.equals(PUMP_PROGRAM) || acc.data.length < 81) return null;
  const realToken = acc.data.readBigUInt64LE(24);
  const realSol = acc.data.readBigUInt64LE(32);
  const complete = acc.data[48] === 1;
  const sold = PUMP_INITIAL_REAL_TOKENS - (realToken > PUMP_INITIAL_REAL_TOKENS ? PUMP_INITIAL_REAL_TOKENS : realToken);
  return {
    address: pda.toBase58(),
    creator: new PublicKey(acc.data.subarray(49, 81)).toBase58(),
    complete,
    progress: complete ? 1 : Number((sold * 10_000n) / PUMP_INITIAL_REAL_TOKENS) / 10_000,
    realSolLamports: realSol.toString(),
  };
}

/** Pump.fun creator-fee vault balance (claimable creator revenue on the bonding curve). */
export async function pumpCreatorVaultLamports(creator: PublicKey): Promise<number | null> {
  const [vault] = PublicKey.findProgramAddressSync([Buffer.from("creator-vault"), creator.toBuffer()], PUMP_PROGRAM);
  const c = connection();
  const [bal, rent] = await Promise.all([c.getBalance(vault).catch(() => null), c.getMinimumBalanceForRentExemption(0).catch(() => 890_880)]);
  return bal === null ? null : Math.max(0, bal - rent);
}

export interface HoldingResult {
  balanceRaw: string;
  /** Start of the current continuous holding period (ms), null when not holding. */
  since: number | null;
  /** History scan hit its cap: since is a lower bound (they've held at least this long). */
  partial: boolean;
}

/**
 * Continuous holding period for `owner` in `mint`, from the owner's associated token account.
 * Walks the account's transactions newest → oldest until the balance before a tx was below
 * the dust floor (or the account was created). Reads at most `maxTx` transactions.
 */
export async function holdingHistory(mintKey: PublicKey, owner: PublicKey, programId: PublicKey, dustRaw: bigint, maxTx = 60): Promise<HoldingResult> {
  const c = connection();
  const ata = getAssociatedTokenAddressSync(mintKey, owner, true, programId);
  const bal = await c.getTokenAccountBalance(ata).catch(() => null);
  const balanceRaw = bal?.value.amount ?? "0";
  if (BigInt(balanceRaw) < (dustRaw > 0n ? dustRaw : 1n)) return { balanceRaw, since: null, partial: false };

  let before: string | undefined;
  let scanned = 0;
  let oldest: number | null = null;
  const ataStr = ata.toBase58();
  while (scanned < maxTx) {
    const sigs = await c.getSignaturesForAddress(ata, { before, limit: Math.min(100, maxTx - scanned) });
    if (!sigs.length) break;
    for (const s of sigs) {
      before = s.signature;
      scanned++;
      if (s.blockTime) oldest = s.blockTime * 1000;
      if (s.err) continue;
      const tx = await c.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 1 }).catch(() => null);
      if (!tx?.meta) continue;
      const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
      const idx = keys.indexOf(ataStr);
      if (idx < 0) continue;
      const pre = tx.meta.preTokenBalances?.find((b) => b.accountIndex === idx);
      const preRaw = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
      if (preRaw < (dustRaw > 0n ? dustRaw : 1n)) {
        return { balanceRaw, since: (tx.blockTime ?? s.blockTime ?? 0) * 1000, partial: false };
      }
    }
    if (sigs.length < 100) break;
  }
  // Ran out of history (account older than the RPC keeps) or hit the cap: report a lower bound.
  return { balanceRaw, since: oldest, partial: true };
}

/** Earliest transaction of a wallet (anti-Sybil: brand-new wallets can't claim rewards). */
export async function walletFirstSeen(owner: PublicKey, maxPages = 3): Promise<{ firstSeen: number | null; partial: boolean }> {
  const c = connection();
  let before: string | undefined;
  let oldest: number | null = null;
  for (let page = 0; page < maxPages; page++) {
    const sigs = await c.getSignaturesForAddress(owner, { before, limit: 1000 });
    if (!sigs.length) return { firstSeen: oldest, partial: false };
    const last = sigs[sigs.length - 1];
    before = last.signature;
    if (last.blockTime) oldest = last.blockTime * 1000;
    if (sigs.length < 1000) return { firstSeen: oldest, partial: false };
  }
  return { firstSeen: oldest, partial: true };
}

export async function getTx(signature: string): Promise<ParsedTransactionWithMeta | null> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(signature)) throw new Error("Invalid transaction signature");
  return connection().getParsedTransaction(signature, { maxSupportedTransactionVersion: 1, commitment: "confirmed" });
}

function lamportDelta(tx: ParsedTransactionWithMeta, address: string): number {
  const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
  const i = keys.indexOf(address);
  if (i < 0 || !tx.meta) return 0;
  return tx.meta.postBalances[i] - tx.meta.preBalances[i];
}

/** A funding record: a confirmed tx that increased the reward wallet's SOL balance. */
export async function verifyFunding(signature: string, rewardWallet: string): Promise<{ lamports: number; source: "creator-fee-claim" | "transfer"; blockTime: number | null }> {
  const tx = await getTx(signature);
  if (!tx) throw new Error("Transaction not found (it may not be confirmed yet)");
  if (tx.meta?.err) throw new Error("Transaction failed on-chain");
  const delta = lamportDelta(tx, rewardWallet);
  if (delta <= 0) throw new Error("This transaction did not add SOL to the reward wallet");
  const programs = tx.transaction.message.instructions.map((ix) => ix.programId.toBase58());
  const source = programs.includes(PUMP_PROGRAM.toBase58()) || programs.includes(PUMP_AMM_PROGRAM.toBase58()) || programs.includes(DBC_PROGRAM.toBase58()) ? "creator-fee-claim" : "transfer";
  return { lamports: delta, source, blockTime: tx.blockTime ?? null };
}

/**
 * Payout verification: the tx is confirmed, signed by the reward wallet, carries the epoch memo,
 * and contains a System transfer of exactly the allocated lamports to each claimed recipient.
 */
export async function verifyPayout(signature: string, o: { from: string; memo: string; expected: Map<string, bigint> }): Promise<string[]> {
  const tx = await getTx(signature);
  if (!tx) throw new Error("Transaction not found (it may not be confirmed yet)");
  if (tx.meta?.err) throw new Error("Transaction failed on-chain");
  const signer = tx.transaction.message.accountKeys.find((k) => k.signer)?.pubkey.toBase58();
  if (!tx.transaction.message.accountKeys.some((k) => k.signer && k.pubkey.toBase58() === o.from)) throw new Error(`Payout must be signed by the reward wallet (signed by ${signer})`);
  let memoOk = false;
  const paid: string[] = [];
  for (const ix of tx.transaction.message.instructions) {
    if (ix.programId.equals(MEMO_PROGRAM) && "parsed" in ix && ix.parsed === o.memo) memoOk = true;
    if ("parsed" in ix && ix.program === "system" && ix.parsed?.type === "transfer") {
      const info = ix.parsed.info as { source: string; destination: string; lamports: number };
      const want = o.expected.get(info.destination);
      if (info.source === o.from && want !== undefined && BigInt(info.lamports) === want) paid.push(info.destination);
    }
  }
  if (!memoOk) throw new Error(`Missing memo "${o.memo}"`);
  return paid;
}

export async function largestHolders(mintKey: PublicKey): Promise<{ owner: string; amountRaw: string }[] | null> {
  try {
    const c = connection();
    const res = await c.getTokenLargestAccounts(mintKey);
    const accts = res.value.slice(0, 20);
    const infos = await c.getMultipleParsedAccounts(accts.map((a) => a.address));
    return accts.map((a, i) => {
      const d = infos.value[i]?.data;
      const owner = d && "parsed" in d ? (d.parsed.info.owner as string) : a.address.toBase58();
      return { owner, amountRaw: a.amount };
    });
  } catch {
    return null; // public RPC often rate-limits this call
  }
}

/** Exact holder count via Helius DAS (only with HELIUS_API_KEY). */
export async function holderCount(mint: string): Promise<number | null> {
  const key = process.env.HELIUS_API_KEY;
  if (!key) return null;
  let count = 0;
  let cursor: string | undefined;
  for (let page = 0; page < 50; page++) {
    const r = await fetch(`https://mainnet.helius-rpc.com/?api-key=${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTokenAccounts", params: { mint, limit: 1000, cursor } }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (!r?.ok) return null;
    const j = (await r.json()) as { result?: { token_accounts: { amount: number }[]; cursor?: string } };
    if (!j.result) return null;
    count += j.result.token_accounts.filter((a) => a.amount > 0).length;
    if (!j.result.cursor || j.result.token_accounts.length < 1000) return count;
    cursor = j.result.cursor;
  }
  return null; // > 50k accounts: don't report a truncated number
}
