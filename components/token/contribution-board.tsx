"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "../wallet-provider.tsx";
import { api } from "@/lib/wallet-client.ts";
import { ago, short } from "@/lib/format.ts";

export interface ContributionRow {
  id: string;
  mint: string;
  wallet: string;
  type: string;
  title: string;
  url: string;
  body: string;
  paid: boolean;
  paid_by: string | null;
  status: "pending" | "approved" | "rejected";
  quality: number | null;
  reject_reason: string | null;
  strike: boolean;
  reviewer: string | null;
  review_note: string | null;
  epoch: number;
  created_at: string;
  symbol?: string;
}

const TYPE_LABEL: Record<string, string> = { artwork: "Artwork", meme: "Meme", research: "Research", education: "Education", tooling: "Tooling", translation: "Translation", community: "Community" };
const REJECT: [string, string][] = [
  ["low-effort", "Low effort"],
  ["off-topic", "Off-topic"],
  ["duplicate", "Duplicate"],
  ["spam", "Spam (strike)"],
  ["undisclosed-paid", "Undisclosed paid promo (strike)"],
  ["not-original", "Not original (strike)"],
  ["other", "Other"],
];

export function ContributionItem({ c, canReview, onDone, showToken }: { c: ContributionRow; canReview: boolean; onDone: () => void; showToken?: boolean }) {
  const s = useSession();
  const [q, setQ] = useState(3);
  const [reason, setReason] = useState("low-effort");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const review = async (decision: "approve" | "reject") => {
    setBusy(true);
    setErr(null);
    try {
      await s.ensure();
      await api(`/api/contributions/${c.id}/review`, { method: "POST", json: decision === "approve" ? { decision, quality: q } : { decision, reason } });
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="border-t border-line py-3.5 first:border-t-0">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
        <span className="pill">{TYPE_LABEL[c.type] ?? c.type}</span>
        {showToken && c.symbol && <a href={`/t/${c.mint}`} className="hover:text-ink">${c.symbol}</a>}
        <a href={`/u/${c.wallet}`} className="font-mono hover:text-ink">{short(c.wallet)}</a>
        <span>epoch {c.epoch}</span>
        <span>{ago(c.created_at)}</span>
        {c.paid && <span className="pill pill-warn" title={`Compensated by ${c.paid_by}`}>Paid · disclosed</span>}
        <span className="ml-auto">
          {c.status === "approved" ? <span className="pill pill-live">Approved · {c.quality}/5</span> : c.status === "rejected" ? <span className="pill">{c.reject_reason}{c.strike ? " · strike" : ""}</span> : <span className="pill">Pending review</span>}
        </span>
      </div>
      <a href={c.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="mt-1.5 block text-[15px] font-medium hover:text-accent-ink">
        {c.title} <span className="text-ink-3">↗</span>
      </a>
      {c.body && <p className="mt-1 line-clamp-3 text-sm text-ink-2">{c.body}</p>}
      {c.paid && <p className="mt-1 text-xs text-warn">Disclosed compensation: {c.paid_by}. Paid work counts toward reputation but never toward reward payouts.</p>}
      {c.review_note && <p className="mt-1 text-xs text-ink-3">Reviewer note: {c.review_note}</p>}
      {canReview && c.status === "pending" && s.account?.address !== c.wallet && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 p-2.5">
          <label className="flex items-center gap-1.5 text-xs text-ink-2">
            Quality
            <select className="input h-8 w-16 px-2" value={q} onChange={(e) => setQ(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary h-8 px-3 text-xs" onClick={() => review("approve")} disabled={busy}>Approve</button>
          <select className="input h-8 w-auto px-2 text-xs" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Rejection reason">
            {REJECT.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <button className="btn btn-ghost h-8 px-3 text-xs" onClick={() => review("reject")} disabled={busy}>Reject</button>
          {err && <span className="text-xs text-bad">{err}</span>}
        </div>
      )}
    </li>
  );
}

export function SubmitContribution({ mint, types, onDone }: { mint: string; types: string[]; onDone: () => void }) {
  const s = useSession();
  const [f, setF] = useState({ type: "research", title: "", url: "", body: "", paid: false, paidBy: "", original: false });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await s.ensure();
      await api("/api/contributions", { method: "POST", json: { mint, ...f } });
      setF({ ...f, title: "", url: "", body: "", paid: false, paidBy: "", original: false });
      setMsg({ ok: true, text: "Submitted. A reviewer will grade it; approval adds to your conviction." });
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-line bg-surface-2/40 p-4">
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} aria-label="Type">
          {types.map((t) => (
            <option key={t} value={t}>{TYPE_LABEL[t] ?? t}</option>
          ))}
        </select>
        <input className="input" placeholder="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required minLength={4} maxLength={120} />
      </div>
      <input className="input" placeholder="https:// link to the work (post, thread, file, repo…)" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} required type="url" />
      <textarea className="input" rows={3} placeholder="What is it, and why does it help the community? (optional)" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} maxLength={2000} />
      <label className="flex items-start gap-2 text-sm text-ink-2">
        <input type="checkbox" className="mt-1 accent-[var(--color-accent)]" checked={f.paid} onChange={(e) => setF({ ...f, paid: e.target.checked })} />
        I was paid or compensated for this (sponsored / promotional)
      </label>
      {f.paid && <input className="input" placeholder="Who compensated you? (required disclosure)" value={f.paidBy} onChange={(e) => setF({ ...f, paidBy: e.target.value })} required minLength={2} />}
      <label className="flex items-start gap-2 text-sm text-ink-2">
        <input type="checkbox" className="mt-1 accent-[var(--color-accent)]" checked={f.original} onChange={(e) => setF({ ...f, original: e.target.checked })} required />
        This is my original work (or properly credited). Undisclosed paid promotion, spam and plagiarism are rejected with a strike.
      </label>
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={busy}>{busy ? "Submitting…" : "Submit for review"}</button>
        {msg && <span className={`text-xs ${msg.ok ? "text-accent-ink" : "text-bad"}`}>{msg.text}</span>}
      </div>
    </form>
  );
}

export function ContributionBoard({ mint, symbol, types }: { mint: string; symbol: string; types: string[] }) {
  const s = useSession();
  const router = useRouter();
  const [rows, setRows] = useState<ContributionRow[] | null>(null);
  const [tab, setTab] = useState<"approved" | "pending" | "rejected">("approved");
  const [open, setOpen] = useState(false);
  const load = useCallback(() => api<{ contributions: ContributionRow[] }>(`/api/contributions?mint=${mint}`).then((r) => setRows(r.contributions)).catch(() => setRows([])), [mint]);
  useEffect(() => {
    void load();
  }, [load]);
  const canReview = s.moderates.includes(mint);
  const shown = (rows ?? []).filter((r) => r.status === tab);
  const count = (st: string) => (rows ?? []).filter((r) => r.status === st).length;
  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight">Contribution board</h2>
        <button className="btn btn-ghost h-8 px-3 text-xs" onClick={() => setOpen((o) => !o)}>{open ? "Close" : `Submit work for $${symbol}`}</button>
      </div>
      {open && (
        <div className="mb-4">
          <SubmitContribution mint={mint} types={types} onDone={() => (load(), router.refresh())} />
        </div>
      )}
      <div className="mb-2 flex gap-1" role="tablist">
        {(["approved", "pending", "rejected"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-xs capitalize ${tab === t ? "bg-surface-3 text-ink" : "text-ink-3 hover:text-ink"}`}>
            {t} <span className="num text-ink-3">{rows ? count(t) : ""}</span>
          </button>
        ))}
        {canReview && count("pending") > 0 && <span className="ml-auto self-center text-xs text-warn">{count("pending")} awaiting your review</span>}
      </div>
      {rows === null ? (
        <div className="space-y-2">
          <div className="skeleton h-14" />
          <div className="skeleton h-14" />
        </div>
      ) : shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-3">Nothing {tab} yet.</p>
      ) : (
        <ul>
          {shown.map((c) => (
            <ContributionItem key={c.id} c={c} canReview={canReview} onDone={() => (load(), router.refresh())} />
          ))}
        </ul>
      )}
    </section>
  );
}
