"use client";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "./wallet-provider.tsx";
import { api } from "@/lib/wallet-client.ts";
import { ContributionItem, SubmitContribution, type ContributionRow } from "./token/contribution-board.tsx";
import { Empty } from "./ui.tsx";

export function ContributionsHub({ tokens, types }: { tokens: { mint: string; symbol: string; name: string }[]; types: string[] }) {
  const s = useSession();
  const [rows, setRows] = useState<ContributionRow[] | null>(null);
  const [view, setView] = useState<"feed" | "review" | "mine">("feed");
  const [mint, setMint] = useState(tokens[0]?.mint ?? "");
  const load = useCallback(() => api<{ contributions: ContributionRow[] }>("/api/contributions").then((r) => setRows(r.contributions)).catch(() => setRows([])), []);
  useEffect(() => {
    void load();
  }, [load]);
  const queue = (rows ?? []).filter((r) => r.status === "pending" && s.moderates.includes(r.mint) && r.wallet !== s.account?.address);
  const mine = (rows ?? []).filter((r) => r.wallet === s.account?.address);
  const shown = view === "review" ? queue : view === "mine" ? mine : (rows ?? []).filter((r) => r.status === "approved");
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section className="card p-5 sm:p-6">
        <div className="mb-3 flex flex-wrap gap-1" role="tablist">
          {(
            [
              ["feed", "Approved work"],
              ["mine", "My submissions"],
              ...(s.moderates.length ? ([["review", `Review queue (${queue.length})`]] as const) : []),
            ] as const
          ).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k as typeof view)} className={`rounded-lg px-3 py-1.5 text-xs ${view === k ? "bg-surface-3 text-ink" : "text-ink-3 hover:text-ink"}`}>
              {l}
            </button>
          ))}
        </div>
        {rows === null ? (
          <div className="space-y-2">
            <div className="skeleton h-16" />
            <div className="skeleton h-16" />
            <div className="skeleton h-16" />
          </div>
        ) : shown.length === 0 ? (
          <Empty title={view === "review" ? "Queue is clear" : view === "mine" ? "No submissions yet" : "No approved contributions yet"}>
            {view === "feed" ? "Approved work from every community shows up here." : null}
          </Empty>
        ) : (
          <ul>
            {shown.map((c) => (
              <ContributionItem key={c.id} c={c} canReview={s.moderates.includes(c.mint)} onDone={load} showToken />
            ))}
          </ul>
        )}
      </section>
      <aside className="space-y-4">
        <div className="card p-5">
          <h2 className="mb-3 text-[15px] font-semibold">Submit a contribution</h2>
          {tokens.length === 0 ? (
            <p className="text-sm text-ink-3">No communities to contribute to yet.</p>
          ) : (
            <>
              <select className="input mb-3" value={mint} onChange={(e) => setMint(e.target.value)} aria-label="Community">
                {tokens.map((t) => (
                  <option key={t.mint} value={t.mint}>
                    {t.name} (${t.symbol})
                  </option>
                ))}
              </select>
              <SubmitContribution mint={mint} types={types} onDone={load} />
            </>
          )}
        </div>
        <div className="card p-5 text-xs leading-relaxed text-ink-3">
          <p className="mb-2 text-sm font-medium text-ink">What counts</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>Original artwork, memes, research, explainers, tools, translations, community work.</li>
            <li>Each extra item in the same epoch is worth half the previous one, so quality beats quantity.</li>
            <li>Engagement farming, bot replies, coordinated spam and volume games earn nothing.</li>
            <li>Paid or sponsored work must be disclosed. It can build reputation but never earns reward payouts.</li>
            <li>Duplicate links (normalized) are refused automatically.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
