import Link from "next/link";
import { notFound } from "next/navigation";
import { tokenDetail } from "@/lib/queries.ts";
import { COMPONENTS, CONTRIBUTION_TYPES } from "@/lib/scoring.ts";
import { Section, Stat, TokenAvatar, Empty } from "@/components/ui.tsx";
import { ConvictionBar } from "@/components/conviction-arc.tsx";
import { CopyText } from "@/components/copy-text.tsx";
import { MyConvictionCard } from "@/components/token/my-conviction.tsx";
import { ContributionBoard } from "@/components/token/contribution-board.tsx";
import { Governance } from "@/components/token/governance.tsx";
import { CreatorConsole } from "@/components/token/creator-console.tsx";
import { COMPONENT_COLOR, COMPONENT_LABEL, VENUE_LABEL, ago, compact, days, int, pct, short, sol, solscanAccount, solscanTx, usd } from "@/lib/format.ts";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ mint: string }> }) {
  const d = await tokenDetail((await params).mint).catch(() => null);
  return { title: d ? `${d.token.name} ($${d.token.symbol})` : "Token" };
}

export default async function TokenPage({ params }: { params: Promise<{ mint: string }> }) {
  const mint = (await params).mint;
  const d = await tokenDetail(mint).catch(() => null);
  if (!d) notFound();
  const t = d.token;
  const m = d.market;
  const supply = d.chain.supplyRaw ? Number(d.chain.supplyRaw) / 10 ** t.decimals : null;
  const funded = BigInt(d.rewards.totals.funded);
  const allocated = BigInt(d.rewards.totals.allocated);
  const paid = BigInt(d.rewards.totals.paid);

  return (
    <div className="space-y-6">
      <header className="fade-up flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <TokenAvatar src={t.image} symbol={t.symbol} size={56} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[26px] font-semibold tracking-[-0.02em]">{t.name}</h1>
              <span className="text-ink-3">${t.symbol}</span>
              <span className="pill">{VENUE_LABEL[t.venue] ?? t.venue}</span>
              {t.creator ? <span className="pill pill-live" title={t.creator_proof ?? ""}>Creator verified</span> : <span className="pill pill-warn" title="No on-chain creator proof: scoring is read-only until claimed">Unclaimed listing</span>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
              <CopyText text={t.mint} label={`CA ${short(t.mint, 6)}`} />
              {t.creator && (
                <a className="hover:text-ink" href={`/u/${t.creator}`}>
                  creator {short(t.creator)}
                </a>
              )}
              {Object.entries(t.links ?? {}).map(([k, v]) => (
                <a key={k} href={v} target="_blank" rel="noopener noreferrer" className="capitalize hover:text-ink">
                  {k} ↗
                </a>
              ))}
              {m.url && (
                <a href={m.url} target="_blank" rel="noopener noreferrer" className="hover:text-ink">
                  chart ↗
                </a>
              )}
            </div>
          </div>
        </div>
      </header>

      <section className="card grid grid-cols-2 gap-5 p-5 sm:grid-cols-4 lg:grid-cols-8">
        <Stat label="Price" value={usd(m.priceUsd)} />
        <Stat label="24h" value={pct(m.change24hPct)} tone={m.change24hPct === null ? null : m.change24hPct >= 0 ? "up" : "down"} />
        <Stat label="Market cap" value={usd(m.marketCapUsd)} />
        <Stat label="Liquidity" value={usd(m.liquidityUsd)} hint={m.dex ?? undefined} />
        <Stat label="Volume 24h" value={usd(m.volume24hUsd)} hint={m.buys24h !== null ? `${compact(m.buys24h)} buys · ${compact(m.sells24h)} sells` : undefined} />
        <Stat label="Holders" value={compact(d.chain.holders)} hint={d.chain.holders === null ? "needs Helius key" : "on-chain"} />
        <Stat label="Supply" value={compact(supply)} />
        <div className="min-w-0">
          <p className="label">Curve</p>
          {d.chain.curve ? (
            <>
              <p className="num mt-1.5 text-[20px] font-semibold tracking-tight">{d.chain.curve.complete ? "Graduated" : `${(d.chain.curve.progress * 100).toFixed(1)}%`}</p>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, d.chain.curve.progress * 100)}%` }} />
              </div>
            </>
          ) : (
            <p className="num mt-1.5 text-[20px] font-semibold">—</p>
          )}
        </div>
      </section>
      <p className="-mt-3 text-[11px] text-ink-3">Market data: DexScreener (30s cache). Supply, holders and curve: read from Solana mainnet. Unknown values show “—”, never 0.</p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <Section title="Conviction leaderboard" aside={`${int(d.memberCount)} members · epoch ${d.epoch.current}`}>
            {d.leaderboard.length === 0 ? (
              <Empty title="No members yet">Join the community and verify your holding, or submit original work, to appear here.</Empty>
            ) : (
              <div className="-mx-2 overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="text-left">
                      <th className="label px-2 py-2">#</th>
                      <th className="label px-2 py-2">Wallet</th>
                      <th className="label px-2 py-2">Breakdown</th>
                      <th className="label px-2 py-2 text-right">Held</th>
                      <th className="label px-2 py-2 text-right">Approved</th>
                      <th className="label px-2 py-2 text-right">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.leaderboard.map((r, i) => (
                      <tr key={r.wallet} className="border-t border-line">
                        <td className="num px-2 py-2.5 text-ink-3">{i + 1}</td>
                        <td className="px-2 py-2.5">
                          <Link href={`/u/${r.wallet}`} className="font-mono text-[13px] hover:text-accent-ink">
                            {short(r.wallet)}
                          </Link>
                          {r.wallet === t.creator && <span className="ml-2 text-[11px] text-ink-3">creator</span>}
                        </td>
                        <td className="px-2 py-2.5">
                          <ConvictionBar parts={r.score.components} />
                        </td>
                        <td className="num px-2 py-2.5 text-right text-ink-2">
                          {r.holding?.since ? `${r.holding.partial ? "≥" : ""}${days(r.holding.since)}` : "—"}
                        </td>
                        <td className="num px-2 py-2.5 text-right text-ink-2">{r.approvedCount}</td>
                        <td className="num px-2 py-2.5 text-right font-semibold">{r.score.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-3">
              {COMPONENTS.map((c) => (
                <span key={c} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[2px]" style={{ background: COMPONENT_COLOR[c] }} />
                  {COMPONENT_LABEL[c]}
                </span>
              ))}
            </div>
          </Section>

          <ContributionBoard mint={t.mint} symbol={t.symbol} types={[...CONTRIBUTION_TYPES]} />
          <Governance mint={t.mint} />
        </div>

        <div className="min-w-0 space-y-6">
          <MyConvictionCard mint={t.mint} symbol={t.symbol} />

          <Section title="Fee & reward transparency">
            <dl className="space-y-3 text-sm">
              <Row k="Disclosed reward pledge" v={t.reward_commitment_bps ? `${(t.reward_commitment_bps / 100).toFixed(1)}% of creator revenue` : "None disclosed"} />
              <Row k="Reward wallet" v={t.reward_wallet ? <a className="font-mono hover:text-accent-ink" href={solscanAccount(t.reward_wallet)} target="_blank" rel="noopener noreferrer">{short(t.reward_wallet)} ↗</a> : "Not set"} />
              {t.venue === "pumpfun" && <Row k="Unclaimed creator fees" v={d.chain.creatorVaultLamports === null ? "—" : `${sol(d.chain.creatorVaultLamports)} ◎`} hint="pump.fun creator vault, live" />}
              <Row k="Verified funding" v={`${sol(funded.toString())} ◎`} hint={`${d.rewards.fundings.length} transaction${d.rewards.fundings.length === 1 ? "" : "s"}`} />
              <Row k="Allocated to contributors" v={`${sol(allocated.toString())} ◎`} />
              <Row k="Paid on-chain" v={`${sol(paid.toString())} ◎`} />
              <Row k="Available to allocate" v={`${sol((funded - allocated).toString())} ◎`} />
              <Row k="Per-wallet cap" v={`${(t.reward_cap_bps / 100).toFixed(0)}% of an epoch`} />
              <Row k="Min wallet age for rewards" v={`${t.min_wallet_age_days} days`} />
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-ink-3">
              Rewards are paid only from SOL the project has actually moved into its reward wallet, recorded by transaction signature. The pledge is the project&apos;s public commitment; only verified funding is spendable. Holding is never required to receive rewards.
            </p>
            {d.rewards.fundings.length > 0 && (
              <ul className="mt-4 space-y-1.5 border-t border-line pt-3 text-xs">
                {d.rewards.fundings.slice(0, 6).map((f) => (
                  <li key={f.signature} className="flex justify-between gap-2">
                    <a className="font-mono text-ink-2 hover:text-accent-ink" href={solscanTx(f.signature)} target="_blank" rel="noopener noreferrer">
                      {short(f.signature, 6)} ↗
                    </a>
                    <span className="text-ink-3">{f.source}</span>
                    <span className="num">+{sol(f.lamports)} ◎</span>
                  </li>
                ))}
              </ul>
            )}
            {d.rewards.epochs.length > 0 && (
              <ul className="mt-4 space-y-1.5 border-t border-line pt-3 text-xs">
                {d.rewards.epochs.map((e) => (
                  <li key={e.id} className="flex justify-between gap-2">
                    <Link className="hover:text-accent-ink" href={`/rewards/${e.id}`}>Epoch {e.epoch}</Link>
                    <span className="text-ink-3">{e.paid_count}/{e.recipients} paid</span>
                    <span className="num">{sol(e.pot_lamports)} ◎</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Scoring configuration" aside={`${t.epoch_days}-day epochs`}>
            <ul className="space-y-2 text-sm">
              {COMPONENTS.map((c) => (
                <li key={c} className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-ink-2">
                    <span className="h-2 w-2 rounded-[2px]" style={{ background: COMPONENT_COLOR[c] }} />
                    {COMPONENT_LABEL[c]}
                  </span>
                  <span className="num">{d.scoring.weights[c]}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-3">
              Current epoch {d.epoch.current}: {new Date(d.epoch.start).toLocaleDateString()} → {new Date(d.epoch.end).toLocaleDateString()}. Listed {ago(t.created_at)}.
            </p>
          </Section>

          <CreatorConsole mint={t.mint} decimals={t.decimals} current={{ scoring: d.scoring, epochDays: t.epoch_days, rewardCommitmentBps: t.reward_commitment_bps, rewardCapBps: t.reward_cap_bps, minWalletAgeDays: t.min_wallet_age_days, reviewers: t.reviewers, rewardWallet: t.reward_wallet, minHoldRaw: t.min_hold_raw }} currentEpoch={d.epoch.current} />
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, hint }: { k: string; v: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-ink-3">{k}</dt>
      <dd className="num text-right">
        {v}
        {hint && <span className="block text-[11px] text-ink-3">{hint}</span>}
      </dd>
    </div>
  );
}
