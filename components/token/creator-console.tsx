"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "../wallet-provider.tsx";
import { api } from "@/lib/wallet-client.ts";
import { sendPayout } from "@/lib/tx-client.ts";
import { COMPONENTS, type ScoringConfig } from "@/lib/scoring.ts";
import { COMPONENT_LABEL, short, sol, solscanTx } from "@/lib/format.ts";

interface Current {
  scoring: ScoringConfig;
  epochDays: number;
  rewardCommitmentBps: number;
  rewardCapBps: number;
  minWalletAgeDays: number;
  reviewers: string[];
  rewardWallet: string | null;
  minHoldRaw: string;
}

interface Preview {
  id: string;
  epoch: number;
  pot: string;
  manifestSha256: string;
  allocations: { wallet: string; points: number; lamports: string; shareBps: number }[];
  excluded: { wallet: string; reason: string }[];
  unallocated: string;
  preview: boolean;
}

export function CreatorConsole({ mint, current, currentEpoch }: { mint: string; decimals: number; current: Current; currentEpoch: number }) {
  const s = useSession();
  const router = useRouter();
  const [me, setMe] = useState<{ creator?: boolean; moderator?: boolean; wallet: string | null } | null>(null);
  const [tab, setTab] = useState<"settings" | "rewards" | "safety">("rewards");
  useEffect(() => {
    api(`/api/tokens/${mint}/me`).then(setMe).catch(() => setMe(null));
  }, [mint, s.session]);
  if (!me?.moderator) return null;
  const isCreator = !!me.creator;
  return (
    <section className="card border-accent-deep p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold tracking-tight">{isCreator ? "Creator console" : "Reviewer tools"}</h2>
        <span className="pill pill-live">{isCreator ? "Verified creator" : "Reviewer"}</span>
      </div>
      <div className="mb-4 flex gap-1">
        {(isCreator ? (["rewards", "settings", "safety"] as const) : (["safety"] as const)).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-xs capitalize ${tab === t || (!isCreator && t === "safety") ? "bg-surface-3" : "text-ink-3 hover:text-ink"}`}>
            {t}
          </button>
        ))}
      </div>
      {isCreator && tab === "settings" && <Settings mint={mint} current={current} onSaved={() => router.refresh()} />}
      {isCreator && tab === "rewards" && <Rewards mint={mint} current={current} currentEpoch={currentEpoch} onChange={() => router.refresh()} />}
      {(tab === "safety" || !isCreator) && <Safety mint={mint} />}
    </section>
  );
}

function useAction() {
  const s = useSession();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await s.ensure();
      const r = await fn();
      if (r) setMsg({ ok: true, text: r });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return { busy, msg, run, setMsg };
}

function Msg({ m }: { m: { ok: boolean; text: string } | null }) {
  return m ? <p className={`text-xs ${m.ok ? "text-accent-ink" : "text-bad"}`}>{m.text}</p> : null;
}

function Settings({ mint, current, onSaved }: { mint: string; current: Current; onSaved: () => void }) {
  const a = useAction();
  const [w, setW] = useState({ ...current.scoring.weights });
  const [f, setF] = useState({
    epochDays: current.epochDays,
    commitment: current.rewardCommitmentBps / 100,
    cap: current.rewardCapBps / 100,
    minAge: current.minWalletAgeDays,
    rewardWallet: current.rewardWallet ?? "",
    reviewers: current.reviewers.join("\n"),
    minHoldRaw: current.minHoldRaw,
  });
  const total = COMPONENTS.reduce((s, c) => s + Number(w[c] || 0), 0);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        a.run(async () => {
          await api(`/api/tokens/${mint}/settings`, {
            method: "PUT",
            json: {
              scoring: { ...current.scoring, weights: Object.fromEntries(COMPONENTS.map((c) => [c, Number(w[c])])) },
              epochDays: Number(f.epochDays),
              rewardCommitmentBps: Math.round(Number(f.commitment) * 100),
              rewardCapBps: Math.round(Number(f.cap) * 100),
              minWalletAgeDays: Number(f.minAge),
              rewardWallet: f.rewardWallet.trim() || null,
              reviewers: f.reviewers.split(/\s+/).filter(Boolean),
              minHoldRaw: f.minHoldRaw,
            },
          });
          onSaved();
          return "Saved. The change is recorded in the public audit log.";
        });
      }}
    >
      <div>
        <p className="label mb-2">Component weights (must total 1000)</p>
        <div className="grid grid-cols-2 gap-2">
          {COMPONENTS.map((c) => (
            <label key={c} className="flex items-center justify-between gap-2 text-xs text-ink-2">
              {COMPONENT_LABEL[c]}
              <input className="input h-8 w-20 text-right" type="number" min={0} max={1000} value={w[c]} onChange={(e) => setW({ ...w, [c]: Number(e.target.value) })} />
            </label>
          ))}
        </div>
        <p className={`num mt-1 text-xs ${total === 1000 ? "text-ink-3" : "text-bad"}`}>Total {total}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs text-ink-2">
        <label>Epoch length (days)<input className="input mt-1 h-8" type="number" min={1} max={90} value={f.epochDays} onChange={(e) => setF({ ...f, epochDays: Number(e.target.value) })} /></label>
        <label>Disclosed reward pledge (%)<input className="input mt-1 h-8" type="number" min={0} max={100} step={0.1} value={f.commitment} onChange={(e) => setF({ ...f, commitment: Number(e.target.value) })} /></label>
        <label>Per-wallet cap (%)<input className="input mt-1 h-8" type="number" min={1} max={100} value={f.cap} onChange={(e) => setF({ ...f, cap: Number(e.target.value) })} /></label>
        <label>Min wallet age (days)<input className="input mt-1 h-8" type="number" min={0} max={365} value={f.minAge} onChange={(e) => setF({ ...f, minAge: Number(e.target.value) })} /></label>
      </div>
      <label className="block text-xs text-ink-2">
        Reward wallet (holds and pays the reward budget; a dedicated wallet is recommended)
        <input className="input mt-1 h-8 font-mono text-xs" value={f.rewardWallet} onChange={(e) => setF({ ...f, rewardWallet: e.target.value })} placeholder="wallet address" />
      </label>
      <label className="block text-xs text-ink-2">
        Dust floor for holding (raw token units). Holding below this counts as not holding; amounts above it never add points.
        <input className="input mt-1 h-8 font-mono text-xs" value={f.minHoldRaw} onChange={(e) => setF({ ...f, minHoldRaw: e.target.value })} />
      </label>
      <label className="block text-xs text-ink-2">
        Reviewers (one wallet per line)
        <textarea className="input mt-1 font-mono text-xs" rows={3} value={f.reviewers} onChange={(e) => setF({ ...f, reviewers: e.target.value })} />
      </label>
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={a.busy || total !== 1000}>{a.busy ? "Saving…" : "Save settings"}</button>
        <Msg m={a.msg} />
      </div>
    </form>
  );
}

function Rewards({ mint, current, currentEpoch, onChange }: { mint: string; current: Current; currentEpoch: number; onChange: () => void }) {
  const s = useSession();
  const fund = useAction();
  const close = useAction();
  const pay = useAction();
  const [sig, setSig] = useState("");
  const [epoch, setEpoch] = useState(Math.max(0, currentEpoch - 1));
  const [budget, setBudget] = useState(1);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [epochs, setEpochs] = useState<{ id: string; epoch: number; recipients: string; paid_count: string }[]>([]);
  const [tick, setTick] = useState<string | null>(null);

  const loadEpochs = () => api(`/api/tokens/${mint}`).then((d) => setEpochs(d.rewards.epochs)).catch(() => {});
  useEffect(() => {
    void loadEpochs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mint]);

  const runClose = (commit: boolean) =>
    close.run(async () => {
      const r = await api<Preview>("/api/rewards/epoch", { method: "POST", json: { mint, epoch, budgetSol: budget, commit } });
      setPreview(r);
      if (commit) {
        await loadEpochs();
        onChange();
        return `Epoch ${epoch} closed. Manifest sha256 ${r.manifestSha256.slice(0, 12)}… is now public.`;
      }
    });

  const payEpoch = (id: string) =>
    pay.run(async () => {
      if (!s.wallet || !s.account) throw new Error("Connect the reward wallet");
      if (s.account.address !== current.rewardWallet) throw new Error(`Switch your wallet to the reward wallet ${short(current.rewardWallet)} to sign payouts`);
      const e = await api<{ allocations: { wallet: string; lamports: string; status: string }[]; memo: string }>(`/api/rewards/epoch/${id}`);
      const pending = e.allocations.filter((x) => x.status === "pending");
      let n = 0;
      for (let i = 0; i < pending.length; i += 10) {
        const chunk = pending.slice(i, i + 10);
        const signature = await sendPayout(s.wallet, s.account, e.memo, chunk, setTick);
        const r = await api<{ paid: string[] }>(`/api/rewards/epoch/${id}`, { method: "POST", json: { signature } });
        n += r.paid.length;
      }
      setTick(null);
      await loadEpochs();
      onChange();
      return `Paid ${n} contributor${n === 1 ? "" : "s"}; every transfer verified on-chain.`;
    });

  return (
    <div className="space-y-6">
      {!current.rewardWallet && <p className="rounded-lg bg-surface-2 p-3 text-xs text-warn">Set a reward wallet in Settings before funding or closing epochs.</p>}
      <div className="space-y-2">
        <p className="label">1 · Record funding</p>
        <p className="text-xs text-ink-3">Paste a confirmed transaction that moved SOL into the reward wallet (a creator-fee claim or a transfer). Only the verified increase is counted.</p>
        <div className="flex gap-2">
          <input className="input h-9 font-mono text-xs" placeholder="transaction signature" value={sig} onChange={(e) => setSig(e.target.value.trim())} />
          <button className="btn btn-ghost h-9" disabled={fund.busy || !sig} onClick={() => fund.run(async () => {
            const r = await api<{ lamports: number; source: string }>("/api/rewards/fund", { method: "POST", json: { mint, signature: sig } });
            setSig("");
            onChange();
            return `Recorded +${sol(r.lamports)} ◎ (${r.source}).`;
          })}>Verify</button>
        </div>
        <Msg m={fund.msg} />
      </div>

      <div className="space-y-2">
        <p className="label">2 · Close an epoch</p>
        <p className="text-xs text-ink-3">Allocations use only that epoch&apos;s approved, unpaid-promo contribution points. Sybil-flagged, project and too-new wallets are excluded. Preview first.</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-ink-2">Epoch<input className="input mt-1 h-9 w-20" type="number" min={0} max={Math.max(0, currentEpoch - 1)} value={epoch} onChange={(e) => setEpoch(Number(e.target.value))} /></label>
          <label className="text-xs text-ink-2">Budget (SOL)<input className="input mt-1 h-9 w-28" type="number" min={0.001} step={0.01} value={budget} onChange={(e) => setBudget(Number(e.target.value))} /></label>
          <button className="btn btn-ghost h-9" disabled={close.busy || currentEpoch === 0} onClick={() => runClose(false)}>Preview</button>
          {preview?.preview && preview.epoch === epoch && preview.allocations.length > 0 && (
            <button className="btn btn-primary h-9" disabled={close.busy} onClick={() => runClose(true)}>Publish allocations</button>
          )}
        </div>
        {currentEpoch === 0 && <p className="text-xs text-ink-3">The first epoch is still running; it can be closed after it ends.</p>}
        {preview && (
          <div className="rounded-lg bg-surface-2 p-3 text-xs">
            <p className="num">Pot {sol(preview.pot)} ◎ · {preview.allocations.length} recipients · unallocated {sol(preview.unallocated)} ◎</p>
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
              {preview.allocations.map((x) => (
                <li key={x.wallet} className="flex justify-between font-mono">
                  <span>{short(x.wallet)}</span>
                  <span className="num">{x.points} pts</span>
                  <span className="num">{sol(x.lamports, 4)} ◎</span>
                </li>
              ))}
              {preview.excluded.map((x) => (
                <li key={x.wallet} className="flex justify-between text-ink-3">
                  <span className="font-mono">{short(x.wallet)}</span>
                  <span>excluded: {x.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <Msg m={close.msg} />
      </div>

      <div className="space-y-2">
        <p className="label">3 · Pay out</p>
        <p className="text-xs text-ink-3">Signed by the reward wallet in your browser. Each transaction carries the epoch memo and is verified transfer-by-transfer before it&apos;s marked paid.</p>
        {epochs.length === 0 ? (
          <p className="text-xs text-ink-3">No closed epochs yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {epochs.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
                <span>Epoch {e.epoch}</span>
                <span className="num text-xs text-ink-3">{e.paid_count}/{e.recipients} paid</span>
                {Number(e.paid_count) < Number(e.recipients) ? (
                  <button className="btn btn-primary h-8 px-3 text-xs" disabled={pay.busy} onClick={() => payEpoch(e.id)}>Pay pending</button>
                ) : (
                  <a className="text-xs text-accent-ink" href={`/rewards/${e.id}`}>Complete ↗</a>
                )}
              </li>
            ))}
          </ul>
        )}
        {tick && <p className="text-xs text-ink-2">{tick}</p>}
        <Msg m={pay.msg} />
      </div>
    </div>
  );
}

function Safety({ mint }: { mint: string }) {
  const a = useAction();
  const [wallet, setWallet] = useState("");
  const [reason, setReason] = useState("");
  const [flags, setFlags] = useState<{ wallet: string; reason: string }[]>([]);
  const load = () => api<{ flags: { wallet: string; reason: string }[] }>(`/api/sybil?mint=${mint}`).then((r) => setFlags(r.flags)).catch(() => {});
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mint]);
  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-3">Flag wallets you believe are Sybil clusters or coordinated farms. Flags exclude a wallet from rewards (not from reputation) and are public.</p>
      <input className="input h-9 font-mono text-xs" placeholder="wallet address" value={wallet} onChange={(e) => setWallet(e.target.value.trim())} />
      <input className="input h-9" placeholder="Reason (evidence)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex items-center gap-3">
        <button className="btn btn-ghost h-9" disabled={a.busy || !wallet || reason.length < 6} onClick={() => a.run(async () => {
          await api("/api/sybil", { method: "POST", json: { mint, wallet, reason } });
          setWallet("");
          setReason("");
          await load();
          return "Flagged.";
        })}>Flag wallet</button>
        <Msg m={a.msg} />
      </div>
      {flags.length > 0 && (
        <ul className="space-y-1 border-t border-line pt-2 text-xs">
          {flags.map((f) => (
            <li key={f.wallet} className="flex items-center justify-between gap-2">
              <span className="font-mono">{short(f.wallet)}</span>
              <span className="truncate text-ink-3">{f.reason}</span>
              <button className="text-ink-3 hover:text-ink" onClick={() => a.run(async () => {
                await api("/api/sybil", { method: "POST", json: { mint, wallet: f.wallet, clear: true } });
                await load();
                return "Cleared.";
              })}>clear</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

