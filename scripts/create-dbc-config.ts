/**
 * Create ConvictionPad's Meteora Dynamic Bonding Curve partner config (run once per deployment).
 * DRY RUN by default: builds and simulates. Add --send to broadcast. Keys are never printed.
 *
 *   OPERATOR_KEYPAIR=./keys/operator.json npm run dbc:config -- [--initial-mcap 30] [--migration-mcap 420] [--fee-bps 100] [--creator-fee-pct 50] [--send]
 *
 * Then set DBC_CONFIG=<printed address> in the deployment environment.
 * Defaults: SOL quote, SPL token, 1B supply, 1% trading fee with an exponential anti-sniper
 * fee (50% → 1% over 10 minutes), fees in SOL, migration to DAMM v2, 100% of LP permanently locked.
 */
import fs from "node:fs";
import { parseArgs } from "node:util";
import bs58 from "bs58";
import { Connection, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import {
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  DynamicBondingCurveClient,
  MigrationFeeOption,
  MigrationOption,
  TokenAuthorityOption,
  TokenType,
  buildCurveWithMarketCap,
} from "@meteora-ag/dynamic-bonding-curve-sdk";

const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

function loadKeypair(source: string): Keypair {
  const raw = (process.env[source] && !fs.existsSync(source) ? process.env[source]! : fs.readFileSync(source, "utf8")).trim();
  return raw.startsWith("[") ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw))) : Keypair.fromSecretKey(bs58.decode(raw));
}

const { values: v } = parseArgs({
  options: {
    "initial-mcap": { type: "string", default: "30" },
    "migration-mcap": { type: "string", default: "420" },
    "fee-bps": { type: "string", default: "100" },
    "creator-fee-pct": { type: "string", default: "50" },
    send: { type: "boolean", default: false },
  },
});

const src = process.env.OPERATOR_KEYPAIR;
if (!src) throw new Error("Set OPERATOR_KEYPAIR to a keypair file path (JSON array or base58)");
const operator = loadKeypair(fs.existsSync(src) ? src : "OPERATOR_KEYPAIR");
const conn = new Connection(process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com", "confirmed");
const sdk = new DynamicBondingCurveClient(conn, "confirmed");
const feeBps = Number(v["fee-bps"]);

const curve = buildCurveWithMarketCap({
  token: { tokenType: TokenType.SPLToken, tokenBaseDecimal: 6, tokenQuoteDecimal: 9, tokenAuthorityOption: TokenAuthorityOption.Immutable, totalTokenSupply: 1_000_000_000, leftover: 0 },
  fee: {
    baseFeeParams: { baseFeeMode: BaseFeeMode.FeeSchedulerExponential, feeSchedulerParam: { startingFeeBps: 5000, endingFeeBps: feeBps, numberOfPeriod: 60, totalDuration: 600 } },
    dynamicFeeEnabled: true,
    collectFeeMode: CollectFeeMode.QuoteToken,
    creatorTradingFeePercentage: Number(v["creator-fee-pct"]),
    poolCreationFee: 0,
    enableFirstSwapWithMinFee: true,
  },
  migration: { migrationOption: MigrationOption.MET_DAMM_V2, migrationFeeOption: MigrationFeeOption.FixedBps100, migrationFee: { feePercentage: 0, creatorFeePercentage: 0 } },
  liquidityDistribution: { partnerLiquidityPercentage: 0, partnerPermanentLockedLiquidityPercentage: 50, creatorLiquidityPercentage: 0, creatorPermanentLockedLiquidityPercentage: 50 },
  lockedVesting: { totalLockedVestingAmount: 0, numberOfVestingPeriod: 0, cliffUnlockAmount: 0, totalVestingDuration: 0, cliffDurationFromMigrationTime: 0 },
  activationType: ActivationType.Timestamp,
  initialMarketCap: Number(v["initial-mcap"]),
  migrationMarketCap: Number(v["migration-mcap"]),
});

const config = Keypair.generate();
const tx = await sdk.partner.createConfig({ ...curve, config: config.publicKey, feeClaimer: operator.publicKey, leftoverReceiver: operator.publicKey, payer: operator.publicKey, quoteMint: SOL_MINT });
tx.feePayer = operator.publicKey;
const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
tx.recentBlockhash = blockhash;
tx.partialSign(config);

console.log(`${v.send ? "LIVE" : "DRY RUN"} — ConvictionPad DBC config`);
console.log(`  operator (partner, fee claimer): ${operator.publicKey.toBase58()}`);
console.log(`  config account:                  ${config.publicKey.toBase58()}`);
console.log(`  curve: ${v["initial-mcap"]} SOL → ${v["migration-mcap"]} SOL market cap, ${feeBps / 100}% fee (anti-snipe 50% → ${feeBps / 100}% over 10 min), creator share ${v["creator-fee-pct"]}%`);
const sim = await conn.simulateTransaction(VersionedTransaction.deserialize(tx.serialize({ requireAllSignatures: false, verifySignatures: false })), { sigVerify: false });
console.log(`  simulation: ${sim.value.err ? `FAILED ${JSON.stringify(sim.value.err)}${JSON.stringify(sim.value.err).includes("AccountNotFound") ? " (operator wallet unfunded?)" : ""}` : `ok (${sim.value.unitsConsumed} CU)`}`);
if (!v.send) {
  console.log("\nNothing sent. Re-run with --send to create it.");
  process.exit(0);
}
if (sim.value.err) throw new Error("Simulation failed; not sending.");
tx.partialSign(operator);
const sig = await conn.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
console.log(`\n✓ created: https://solscan.io/tx/${sig}`);
console.log(`Set in your deployment:  DBC_CONFIG=${config.publicKey.toBase58()}`);
