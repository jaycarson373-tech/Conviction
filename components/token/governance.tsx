"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "../wallet-provider.tsx";
import { api, signMessage } from "@/lib/wallet-client.ts";
import { voteMessage } from "@/lib/siws.ts";
import { ago } from "@/lib/format.ts";

interface Proposal {
  id: string;
  mint: string;
  title: string;
  body: string;
  options: string[];
  ends_at: string;
  created_at: string;
  tally: number[];
}

export function Governance({ mint }: { mint: string }) {
  const s = useSession();
  const router = useRouter();
  const [list, setList] = useState<Proposal[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ open: false, title: "", body: "", options: "Yes\nNo", days: 3 });
  const load = useCallback(() => api<{ proposals: Proposal[] }>(`/api/proposals?mint=${mint}`).then((r) => setList(r.proposals)).catch(() => setList([])), [mint]);
  useEffect(() => {
    void load();
  }, [load]);

  const vote = async (p: Proposal, choice: number) => {
    setErr(null);
    setBusy(p.id);
    try {
      const wallet = await s.ensure();
      if (!s.wallet || !s.account) throw new Error("Connect a wallet");
      const at = new Date().toISOString();
      const message = voteMessage({ mint, proposalId: p.id, title: p.title, choice, label: p.options[choice], address: wallet, at });
      const signature = await signMessage(s.wallet, s.account, message);
      await api(`/api/proposals/${p.id}/vote`, { method: "POST", json: { choice, at, message, signature } });
      await load();
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy("new");
    try {
      await s.ensure();
      await api("/api/proposals", { method: "POST", json: { mint, title: form.title, body: form.body, options: form.options.split("\n").map((o) => o.trim()).filter(Boolean), days: form.days } });
      setForm({ open: false, title: "", body: "", options: "Yes\nNo", days: 3 });
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight">Governance</h2>
        {s.moderates.includes(mint) && (
          <button className="btn btn-ghost h-8 px-3 text-xs" onClick={() => setForm((f) => ({ ...f, open: !f.open }))}>{form.open ? "Close" : "New proposal"}</button>
        )}
      </div>
      {form.open && (
        <form onSubmit={create} className="mb-4 space-y-3 rounded-xl border border-line p-4">
          <input className="input" placeholder="Proposal title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={6} />
          <textarea className="input" rows={3} placeholder="Context" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          <textarea className="input font-mono text-xs" rows={3} placeholder="One option per line" value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} />
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-ink-2">
              Days
              <input className="input h-8 w-16" type="number" min={1} max={14} value={form.days} onChange={(e) => setForm({ ...form, days: Number(e.target.value) })} />
            </label>
            <button className="btn btn-primary h-9" disabled={busy === "new"}>Publish</button>
          </div>
        </form>
      )}
      {list === null ? (
        <div className="skeleton h-16" />
      ) : list.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-3">No proposals yet. Votes are wallet-signed messages, so anyone can verify them.</p>
      ) : (
        <ul className="space-y-4">
          {list.map((p) => {
            const total = p.tally.reduce((a, b) => a + b, 0);
            const open = new Date(p.ends_at).getTime() > Date.now();
            return (
              <li key={p.id} className="rounded-xl border border-line p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{p.title}</p>
                  <span className={`pill shrink-0 ${open ? "pill-live" : ""}`}>{open ? `closes ${new Date(p.ends_at).toLocaleDateString()}` : `closed ${ago(p.ends_at)}`}</span>
                </div>
                {p.body && <p className="mt-1 text-sm text-ink-2">{p.body}</p>}
                <ul className="mt-3 space-y-2">
                  {p.options.map((o, i) => {
                    const share = total ? (p.tally[i] / total) * 100 : 0;
                    return (
                      <li key={i} className="flex items-center gap-3">
                        <div className="relative h-8 flex-1 overflow-hidden rounded-lg bg-surface-2">
                          <div className="absolute inset-y-0 left-0 rounded-lg bg-accent-deep" style={{ width: `${share}%` }} />
                          <span className="relative flex h-full items-center justify-between px-3 text-sm">
                            <span>{o}</span>
                            <span className="num text-ink-2">{p.tally[i]} · {share.toFixed(0)}%</span>
                          </span>
                        </div>
                        {open && (
                          <button className="btn btn-ghost h-8 px-3 text-xs" onClick={() => vote(p, i)} disabled={busy === p.id}>
                            Sign vote
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-[11px] text-ink-3">{total} signed vote{total === 1 ? "" : "s"} · holders or approved contributors may vote · one per wallet</p>
              </li>
            );
          })}
        </ul>
      )}
      {err && <p className="mt-3 text-xs text-bad">{err}</p>}
    </section>
  );
}
