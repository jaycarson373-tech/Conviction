import Link from "next/link";
import { notFound } from "next/navigation";
import crypto from "node:crypto";
import { db } from "@/lib/db.ts";
import { PageHeader, Section, Stat } from "@/components/ui.tsx";
import { memoFor } from "@/lib/rewards.ts";
import { short, sol, solscanTx } from "@/lib/format.ts";

export const dynamic = "force-dynamic";

export default async function EpochPage({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const d = await db();
  const e = (await d.query<{ id: string; mint: string; epoch: number; pot: string; manifest: string; sha: string; closed_by: string; created_at: Date; symbol: string }>(
    "select e.id, e.mint, e.epoch, e.pot_lamports::text as pot, e.manifest, e.manifest_sha256 as sha, e.closed_by, e.created_at, t.symbol from reward_epochs e join tokens t on t.mint=e.mint where e.id=$1",
    [id],
  ))[0];
  if (!e) notFound();
  const rows = await d.query<{ wallet: string; points: number; lamports: string; status: string; signature: string | null }>(
    "select wallet, points, lamports::text, status, signature from reward_allocations where epoch_id=$1 order by lamports desc",
    [id],
  );
  const recomputed = crypto.createHash("sha256").update(e.manifest).digest("hex");
  const paid = rows.filter((r) => r.status === "paid");
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`$${e.symbol} rewards`} title={`Epoch ${e.epoch}`}>
        Published {new Date(e.created_at).toLocaleString()} by <Link className="font-mono hover:text-accent-ink" href={`/u/${e.closed_by}`}>{short(e.closed_by)}</Link>. Payouts carry the memo <code className="font-mono text-ink">{memoFor(e.id)}</code>.
      </PageHeader>
      <section className="card grid grid-cols-2 gap-5 p-5 sm:grid-cols-4">
        <Stat label="Allocated" value={`${sol(e.pot)} ◎`} />
        <Stat label="Recipients" value={rows.length} />
        <Stat label="Paid" value={`${paid.length}/${rows.length}`} />
        <Stat label="Manifest" value={recomputed === e.sha ? "Verified" : "Mismatch"} hint={`sha256 ${e.sha.slice(0, 12)}…`} tone={recomputed === e.sha ? "up" : "down"} />
      </section>
      <Section title="Allocations" aside="weights = approved contribution points in this epoch">
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left">
                <th className="label px-2 py-2">Wallet</th>
                <th className="label px-2 py-2 text-right">Points</th>
                <th className="label px-2 py-2 text-right">Amount</th>
                <th className="label px-2 py-2 text-right">Payout</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.wallet} className="border-t border-line">
                  <td className="px-2 py-2.5"><Link className="font-mono text-[13px] hover:text-accent-ink" href={`/u/${r.wallet}`}>{short(r.wallet, 5)}</Link></td>
                  <td className="num px-2 py-2.5 text-right">{r.points}</td>
                  <td className="num px-2 py-2.5 text-right">{sol(r.lamports, 6)} ◎</td>
                  <td className="px-2 py-2.5 text-right">
                    {r.signature ? (
                      <a className="font-mono text-xs text-accent-ink" href={solscanTx(r.signature)} target="_blank" rel="noopener noreferrer">{short(r.signature, 5)} ↗</a>
                    ) : (
                      <span className="text-xs text-ink-3">pending</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="Manifest" aside="anyone can recompute the hash">
        <pre className="max-h-64 overflow-auto rounded-lg bg-surface-2 p-3 font-mono text-[11px] text-ink-2">{e.manifest}</pre>
      </Section>
    </div>
  );
}
