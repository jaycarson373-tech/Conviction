import Link from "next/link";
import type { profile } from "@/lib/service.ts";
import { ConvictionArc, ConvictionBar } from "./conviction-arc.tsx";
import { ScoreBreakdown } from "./score-breakdown.tsx";
import { Empty, Section, Stat, TokenAvatar } from "./ui.tsx";
import { ago, days, int, short, sol, solscanTx } from "@/lib/format.ts";
import { COMPONENTS } from "@/lib/scoring.ts";

type Profile = Awaited<ReturnType<typeof profile>>;

/** Portable conviction profile. Server-rendered from the same data the API exposes. */
export function ProfileView({ p, self = false }: { p: Profile; self?: boolean }) {
  // Exact decomposition of the portable score: best community ×1, every other ×0.25 (same rule as globalScore),
  // scaled down only if the 1000 cap bites.
  const W: Record<string, number> = { holding: 250, participation: 150, contributions: 350, governance: 150, consistency: 100 };
  const ranked = [...p.communities].sort((a, b) => b.score.total - a.score.total);
  const raw = COMPONENTS.map((c) => ({
    component: c,
    points: ranked.reduce((s, x, i) => s + (i === 0 ? 1 : 0.25) * (x.score.components.find((k) => k.component === c)?.points ?? 0), 0),
  }));
  const rawSum = raw.reduce((s, x) => s + x.points, 0);
  const scale = rawSum > 0 ? p.global.total / rawSum : 0;
  const parts = raw.map((x) => ({ component: x.component, max: W[x.component], points: x.points * scale }));
  const approved = p.contributions.filter((c) => c.status === "approved").length;
  const pending = p.contributions.filter((c) => c.status === "pending").length;
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        <section className="card flex flex-col items-center p-6">
          <p className="label mb-1 self-start">{self ? "Your portable conviction" : "Portable conviction"}</p>
          <p className="mb-4 self-start font-mono text-xs text-ink-3 break-all">{p.wallet}</p>
          <ConvictionArc parts={parts} total={p.global.total} size={260} label="Conviction" stacked />
          <p className="mt-4 self-start font-mono text-[11px] text-ink-3">{p.global.explain}</p>
        </section>
        <div className="space-y-6">
          <section className="card grid grid-cols-2 gap-5 p-5 sm:grid-cols-4">
            <Stat label="Communities" value={int(p.communities.length)} />
            <Stat label="Approved work" value={int(approved)} hint={pending ? `${pending} pending review` : undefined} />
            <Stat label="Achievements" value={int(p.achievements.length)} />
            <Stat label="Rewards received" value={`${sol(p.paidLamports)} ◎`} hint="verified on-chain" />
          </section>
          <Section title="Achievements">
            {p.achievements.length === 0 ? (
              <p className="text-sm text-ink-3">Earned through verified activity: first approved contribution, consistent epochs, governance participation, long holding.</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {p.achievements.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 rounded-xl border border-line p-3">
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-deep text-xs text-accent-ink" aria-hidden>◆</span>
                    <span>
                      <span className="block text-sm font-medium">{a.label}</span>
                      <span className="block text-xs text-ink-3">{a.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

      <Section title="Community membership" aside="score per community">
        {p.communities.length === 0 ? (
          <Empty title="No communities yet">{self ? <>Open any token on <Link className="text-accent-ink" href="/">Discover</Link> and join, contribute or vote.</> : "This wallet hasn't joined any community."}</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {p.communities.map((c) => (
              <li key={c.token.mint} className="py-4">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-4">
                    <TokenAvatar src={c.token.image} symbol={c.token.symbol} />
                    <span className="min-w-0 flex-1">
                      <Link href={`/t/${c.token.mint}`} className="block truncate font-medium hover:text-accent-ink">{c.token.name}</Link>
                      <span className="block text-xs text-ink-3">
                        ${c.token.symbol} · joined {ago(c.joinedAt)} · {c.holding?.since ? `held ${c.holding.partial ? "≥" : ""}${days(c.holding.since)}` : "not holding"} · {c.approvedCount} approved
                      </span>
                    </span>
                    <span className="hidden sm:block"><ConvictionBar parts={c.score.components} width={140} /></span>
                    <span className="num w-12 text-right text-lg font-semibold">{c.score.total}</span>
                    <span className="text-ink-3 transition-transform group-open:rotate-90" aria-hidden>›</span>
                  </summary>
                  <div className="mt-3 pl-0 sm:pl-[52px]">
                    <ScoreBreakdown score={c.score} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Verified contributions" aside={`${p.contributions.length} submitted`}>
          {p.contributions.length === 0 ? (
            <p className="text-sm text-ink-3">No submissions yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {p.contributions.slice(0, 30).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <a href={c.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="min-w-0 truncate hover:text-accent-ink">{c.title}</a>
                  <span className="shrink-0 text-xs text-ink-3">
                    {c.type} · {c.status === "approved" ? `approved ${c.quality}/5` : c.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Rewards received">
          {p.rewards.length === 0 ? (
            <p className="text-sm text-ink-3">No reward allocations yet. Rewards come from projects&apos; verified budgets, split by approved contribution points.</p>
          ) : (
            <ul className="divide-y divide-line">
              {p.rewards.map((r) => (
                <li key={r.epoch_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <Link href={`/rewards/${r.epoch_id}`} className="hover:text-accent-ink">Epoch {r.epoch}</Link>
                  <span className="num">{sol(r.lamports, 4)} ◎</span>
                  {r.signature ? (
                    <a className="font-mono text-xs text-accent-ink" href={solscanTx(r.signature)} target="_blank" rel="noopener noreferrer">{short(r.signature, 5)} ↗</a>
                  ) : (
                    <span className="text-xs text-ink-3">pending payout</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
