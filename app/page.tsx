import Link from "next/link";
import { listTokens, platformStats } from "@/lib/queries.ts";
import { ConvictionArc } from "@/components/conviction-arc.tsx";
import { Empty, Stat, TokenAvatar } from "@/components/ui.tsx";
import { DEFAULT_CONFIG, COMPONENTS } from "@/lib/scoring.ts";
import { VENUE_LABEL, int, pct, sol, usd } from "@/lib/format.ts";

export const dynamic = "force-dynamic";

export default async function Discover() {
  const [stats, tokens] = await Promise.all([platformStats(), listTokens()]);
  const model = COMPONENTS.map((c) => ({ component: c, points: DEFAULT_CONFIG.weights[c], max: DEFAULT_CONFIG.weights[c] }));
  return (
    <div className="space-y-10">
      <section className="grid items-center gap-10 pt-4 lg:grid-cols-[1.15fr_1fr] lg:pt-10">
        <div className="fade-up">
          <p className="label mb-4">Proof of Conviction</p>
          <h1 className="text-[40px] font-semibold leading-[1.04] tracking-[-0.03em] sm:text-[56px]">
            Prove your
            <br />
            conviction<span className="text-accent">.</span>
          </h1>
          <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-ink-2">
            ConvictionPad launches Solana tokens with a transparent reputation layer. Holding time, original work, governance and consistency become one portable score: verified on-chain or by public review, never by volume or paid hype.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/launch" className="btn btn-primary">Launch a token</Link>
            <Link href="/docs" className="btn btn-ghost">How scoring works</Link>
          </div>
          <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-line pt-6 sm:grid-cols-3">
            <Stat label="Tokens" value={int(stats.tokens)} />
            <Stat label="Members" value={int(stats.members)} />
            <Stat label="Approved work" value={int(stats.approved)} />
            <Stat label="Signed votes" value={int(stats.votes)} />
            <Stat label="Reward funding" value={`${sol(stats.funded)} ◎`} hint="verified on-chain" />
            <Stat label="Paid to contributors" value={`${sol(stats.paid)} ◎`} hint="on-chain transfers" />
          </dl>
        </div>
        <div className="card fade-up mx-auto w-full max-w-[440px] p-6" style={{ animationDelay: "120ms" }}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">The scoring model</p>
            <span className="pill">poc-1</span>
          </div>
          <p className="mb-4 text-xs text-ink-3">Maximum points per component (projects can re-weight). Hover a segment.</p>
          <div className="flex justify-center">
            <ConvictionArc parts={model} total={1000} label="Max score" size={260} />
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Discover</h2>
            <p className="text-sm text-ink-3">Every token listed on ConvictionPad, with live market data and community conviction.</p>
          </div>
          <Link href="/launch#import" className="text-sm text-accent-ink hover:underline">Import a token →</Link>
        </div>
        {tokens.length === 0 ? (
          <Empty title="No tokens listed yet">
            Be the first: <Link className="text-accent-ink" href="/launch">launch a token</Link> on Pump.fun or Meteora, or import one you created.
          </Empty>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="text-left text-ink-3">
                  {["Token", "Venue", "Price", "24h", "Market cap", "Liquidity", "Members", "Approved work", "Top conviction", "Reward pledge"].map((h, i) => (
                    <th key={h} className={`label px-4 py-3 font-medium ${i > 1 ? "text-right" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => (
                  <tr key={t.mint} className="border-t border-line transition-colors hover:bg-surface-2">
                    <td className="px-4 py-3">
                      <Link href={`/t/${t.mint}`} className="flex items-center gap-3">
                        <TokenAvatar src={t.image} symbol={t.symbol} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{t.name}</span>
                          <span className="block text-xs text-ink-3">${t.symbol}{t.verifiedCreator ? " · creator verified" : " · unclaimed"}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-2">{VENUE_LABEL[t.venue] ?? t.venue}</td>
                    <td className="num px-4 py-3 text-right">{usd(t.market.priceUsd)}</td>
                    <td className={`num px-4 py-3 text-right ${(t.market.change24hPct ?? 0) >= 0 ? "text-accent-ink" : "text-bad"}`}>{pct(t.market.change24hPct)}</td>
                    <td className="num px-4 py-3 text-right">{usd(t.market.marketCapUsd)}</td>
                    <td className="num px-4 py-3 text-right">{usd(t.market.liquidityUsd)}</td>
                    <td className="num px-4 py-3 text-right">{int(t.members)}</td>
                    <td className="num px-4 py-3 text-right">{int(t.approved)}</td>
                    <td className="num px-4 py-3 text-right">{t.topScore ?? "—"}</td>
                    <td className="num px-4 py-3 text-right">{t.rewardCommitmentBps ? `${(t.rewardCommitmentBps / 100).toFixed(1)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
