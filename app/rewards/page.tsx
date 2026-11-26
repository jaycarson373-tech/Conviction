import Link from "next/link";
import { db } from "@/lib/db.ts";
import { Empty, PageHeader, Section, Stat } from "@/components/ui.tsx";
import { platformStats } from "@/lib/queries.ts";
import { ago, short, sol, solscanTx } from "@/lib/format.ts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rewards" };

export default async function Rewards() {
  const d = await db();
  const [stats, epochs, fundings, payouts] = await Promise.all([
    platformStats(),
    d.query<{ id: string; mint: string; symbol: string; epoch: number; pot: string; sha: string; created_at: Date; recipients: string; paid_count: string }>(
      `select e.id, e.mint, t.symbol, e.epoch, e.pot_lamports::text as pot, e.manifest_sha256 as sha, e.created_at,
              count(a.*)::text as recipients, count(a.*) filter (where a.status='paid')::text as paid_count
       from reward_epochs e join tokens t on t.mint=e.mint left join reward_allocations a on a.epoch_id=e.id
       group by e.id, t.symbol order by e.created_at desc limit 100`,
    ),
    d.query<{ signature: string; mint: string; symbol: string; lamports: string; source: string; created_at: Date }>(
      "select f.signature, f.mint, t.symbol, f.lamports::text, f.source, f.created_at from reward_fundings f join tokens t on t.mint=f.mint order by f.created_at desc limit 50",
    ),
    d.query<{ signature: string; epoch_id: string; n: string; total: string; paid_at: Date }>(
      "select signature, epoch_id, count(*)::text as n, sum(lamports)::text as total, max(paid_at) as paid_at from reward_allocations where status='paid' group by signature, epoch_id order by max(paid_at) desc limit 50",
    ),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Conviction Rewards" title="Every lamport, accounted for">
        Projects can pledge a disclosed share of real revenue (such as creator fees) to contributors. Only SOL actually moved into a project&apos;s reward wallet counts as budget, recorded by transaction signature. Allocations follow approved contribution points, and every payout is a verified on-chain transfer.
      </PageHeader>
      <section className="card grid grid-cols-2 gap-5 p-5 sm:grid-cols-4">
        <Stat label="Verified funding" value={`${sol(stats.funded)} ◎`} />
        <Stat label="Paid to contributors" value={`${sol(stats.paid)} ◎`} />
        <Stat label="Reward epochs" value={epochs.length} />
        <Stat label="Payout transactions" value={payouts.length} />
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Reward epochs">
          {epochs.length === 0 ? (
            <Empty title="No reward epochs yet">They appear when a project closes a funded epoch and publishes its allocation manifest.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {epochs.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span>
                    <Link href={`/rewards/${e.id}`} className="font-medium hover:text-accent-ink">${e.symbol} · epoch {e.epoch}</Link>
                    <span className="block font-mono text-[11px] text-ink-3">sha256 {e.sha.slice(0, 16)}…</span>
                  </span>
                  <span className="num text-xs text-ink-3">{e.paid_count}/{e.recipients} paid</span>
                  <span className="num">{sol(e.pot)} ◎</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Funding records">
          {fundings.length === 0 ? (
            <Empty title="No funding recorded yet">Projects record deposits into their reward wallet; each is checked against the chain.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {fundings.map((f) => (
                <li key={f.signature} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <Link href={`/t/${f.mint}`} className="hover:text-accent-ink">${f.symbol}</Link>
                  <a className="font-mono text-xs text-ink-2 hover:text-accent-ink" href={solscanTx(f.signature)} target="_blank" rel="noopener noreferrer">{short(f.signature, 6)} ↗</a>
                  <span className="text-xs text-ink-3">{f.source} · {ago(f.created_at)}</span>
                  <span className="num">+{sol(f.lamports)} ◎</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
      <Section title="Payout transactions">
        {payouts.length === 0 ? (
          <p className="text-sm text-ink-3">No payouts yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {payouts.map((p) => (
              <li key={`${p.signature}-${p.epoch_id}`} className="flex items-center justify-between gap-3 py-3 text-sm">
                <a className="font-mono text-xs hover:text-accent-ink" href={solscanTx(p.signature)} target="_blank" rel="noopener noreferrer">{short(p.signature, 8)} ↗</a>
                <Link href={`/rewards/${p.epoch_id}`} className="text-xs text-ink-3 hover:text-ink">{p.epoch_id}</Link>
                <span className="text-xs text-ink-3">{p.n} recipients · {ago(p.paid_at)}</span>
                <span className="num">{sol(p.total)} ◎</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
