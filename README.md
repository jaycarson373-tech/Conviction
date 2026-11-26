# ConvictionPad

**Prove your conviction.**

A Solana launchpad built around **Proof of Conviction**: a transparent, portable reputation score for the people who actually build token communities. Every token listed gets a conviction leaderboard, a contribution board with public review, wallet-signed governance and a reward ledger where every lamport traces to an on-chain signature.

Next.js 16 · React 19 · Tailwind v4 · Postgres (Supabase) · `@solana/web3.js` · Wallet Standard · Meteora DBC SDK · PumpPortal

---

## What works today

| Area | Status | Notes |
|---|---|---|
| Launch on **Pump.fun** | ✅ operational | PumpPortal local transaction; the mint key is generated in the browser, the wallet signs, and the server verifies the confirmed launch on-chain before listing. Optional dev buy. |
| Launch on **Meteora DBC** | ✅ once configured | Needs the platform config (`npm run dbc:config`, then set `DBC_CONFIG`). Until then the UI says "not configured". |
| Launch on **Raydium LaunchLab** | 🕒 planned | LaunchLab tokens can be **imported** today. |
| Import any SPL / Token-2022 mint | ✅ | Creator rights only with an on-chain proof: the pump.fun curve creator, the DBC pool creator, or the launch signature. Otherwise the token is listed as *unclaimed*. |
| Token pages | ✅ | Live price, mcap, liquidity and volume from DexScreener; supply and curve progress from the chain; pump.fun creator-vault balance. Holder count needs `HELIUS_API_KEY`, otherwise "—". |
| Proof of Conviction scoring | ✅ | Open formula `poc-1` with a per-member breakdown ("Show math"); projects can re-weight it. |
| Verified holding duration | ✅ | From the wallet's token-account history; when the scan cap is hit the value is a lower bound ("≥"). |
| Contributions + public review | ✅ | Graded 1–5; strikes; duplicate-link detection; paid-promotion disclosure. |
| Governance | ✅ | Wallet-signed vote messages stored with their signatures (off-chain, verifiable). |
| Rewards | ✅ | Verified funding → epoch allocation manifest (sha256) → in-browser payouts from the reward wallet → per-transfer on-chain verification. |
| Conviction profiles | ✅ | Portable score, communities, contributions, achievements, rewards received. |
| SPL-token rewards, on-chain reward escrow, automated Sybil clustering, social account linking | 🕒 planned | Listed on `/docs`. |

Nothing on the site is simulated. Unknown values render as "—", never 0. Platform stats are live database counts.

## Proof of Conviction (model `poc-1`)

| Component | Max | Input | Source |
|---|---|---|---|
| Holding | 250 | `ln(1+days)/ln(1+365)`: **time only, amount ignored** | chain (ATA history) |
| Participation | 150 | distinct active epochs | approved work + signed votes |
| Contributions | 350 | `typeWeight × quality`, k-th item per epoch × 0.5^(k−1), strikes −25% each | public review |
| Governance | 150 | votes + 3 × proposals with turnout ≥ 5 | signed votes |
| Consistency | 100 | share of recent epochs with approved work (ramps in over 3 epochs) | public review |

Portable score: `min(1000, best community + 25% × the rest)`.

Never counted: trading volume, position size, engagement metrics, undisclosed paid promotion. Reward weights use **approved contribution points only**, so nobody has to hold, or hold more, to get paid. Disclosed paid work builds reputation but is excluded from payouts.

The pure engine is `lib/scoring.ts` and `lib/rewards.ts`; tests are in `tests/`.

## Rewards: the money rules

1. A project sets a **reward wallet** and may publish a pledge, e.g. "20% of creator fees". The pledge is a commitment; only verified funding is spendable.
2. **Funding** = confirmed transactions that increased the reward wallet's SOL (creator-fee claims or transfers), recorded by signature.
3. **Closing an epoch** computes allocations from that epoch's approved points. The pot is `min(budget, funded − already allocated)`, with a per-wallet cap, a minimum payout, and exclusion of Sybil-flagged, project and too-new wallets. A canonical manifest and its sha256 are published.
4. **Payouts** are SOL transfers signed by the reward wallet in the browser, each carrying the memo `convictionpad:<epoch>`. The server verifies every transfer against the manifest before marking it paid.

No deposits from participants, no promised returns, no custody. ConvictionPad never holds a key.

## Deploy (Vercel + Supabase)

1. **Supabase:** create a project. Copy the *connection pooler* URI (Transaction mode) into `DATABASE_URL`, then run `DATABASE_URL=… npm run db:migrate` (the app also applies `lib/schema.sql` on first use).
2. **Vercel:** import the repo and set these environment variables (see `.env.example`):
   - `DATABASE_URL`, `SESSION_SECRET` (`openssl rand -hex 32`)
   - `SOLANA_RPC_URL`: use a dedicated RPC (Helius or Triton); the public RPC rate-limits
   - `NEXT_PUBLIC_SITE_URL`: your domain, which sign-in messages are bound to
   - optional: `HELIUS_API_KEY` (holder counts), `PINATA_JWT` (metadata uploads), `DBC_CONFIG`
3. **Meteora (optional):** `OPERATOR_KEYPAIR=./keys/operator.json npm run dbc:config` does a dry run and simulation. Run it again with `-- --send` to create the config, then set `DBC_CONFIG`.

## Develop

```bash
npm install
npm run dev          # http://localhost:3200, embedded PGlite DB in ./.data (no setup)
npm test             # scoring, rewards, formatting, SIWS, URL canonicalization
npm run typecheck
```

Dev tools (read-only, mainnet):
- `node scripts/check-holding.ts <MINT>` verifies holding history for recent buyers.
- `node scripts/check-payout.ts` exercises the payout verifier on a real memo+transfer transaction.

## Architecture

```
app/                     pages (server components) + app/api/* JSON routes
lib/scoring.ts           Proof of Conviction engine (pure)
lib/rewards.ts           allocation math: exact lamports, cap, min payout (pure)
lib/solana.ts            chain reads + verification (holding, funding, payouts, curves)
lib/registry.ts          token import / launch registration with creator proofs
lib/launch.ts            PumpPortal + Meteora DBC transaction builders, IPFS upload
lib/service.ts           scores, leaderboards, profiles, reward ledger
lib/auth.ts, lib/siws.ts Sign-In With Solana (HMAC nonces, ed25519, signed cookie)
lib/wallet-client.ts     Wallet Standard connect/sign; refuses wallet-modified transactions
lib/db.ts, schema.sql    Postgres (prod) / PGlite (dev), same SQL
components/              Conviction Arc, breakdowns, token panels, creator console
```

The wallet signing and Meteora DBC patterns were ported from `zil-launchpad` and `wanted-meteora`.

## Security notes

- Every write requires a signed-in wallet. Creator actions require an on-chain creator proof, and reviewers can't review their own work.
- Votes and sign-ins are ed25519-verified; nonces are single-use and HMAC-bound with an expiry.
- The browser RPC relay (`/api/rpc`) only allows a small method allowlist.
- The scoring config, reviewer list, reward wallet and every review, flag, funding and payout are written to `audit_log`.
- Rate limits are in-memory per instance. Behind multiple instances, add a shared limiter (e.g. Upstash) if abuse appears.
