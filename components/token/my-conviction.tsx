"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "../wallet-provider.tsx";
import { api } from "@/lib/wallet-client.ts";
import { ConvictionArc } from "../conviction-arc.tsx";
import { ScoreBreakdown } from "../score-breakdown.tsx";
import type { ScoreResult } from "@/lib/scoring.ts";
import { ago, days } from "@/lib/format.ts";

interface Me {
  wallet: string | null;
  moderator?: boolean;
  score?: { score: ScoreResult; holding: { since: number | null; partial: boolean; checkedAt: number } | null };
}

export function MyConvictionCard({ mint, symbol }: { mint: string; symbol: string }) {
  const s = useSession();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showMath, setShowMath] = useState(false);

  const load = useCallback(() => api<Me>(`/api/tokens/${mint}/me`).then(setMe).catch(() => setMe({ wallet: null })), [mint]);
  useEffect(() => {
    void load();
  }, [load, s.session]);

  const join = async () => {
    setErr(null);
    setBusy(true);
    try {
      await s.ensure();
      await api(`/api/tokens/${mint}/join`, { method: "POST" });
      await load();
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const score = me?.score?.score;
  const holding = me?.score?.holding;
  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold tracking-tight">Your conviction</h2>
        {me?.moderator && <span className="pill pill-live">Reviewer</span>}
      </div>
      {!s.account ? (
        <p className="text-sm text-ink-3">Connect a wallet to see your score in ${symbol}.</p>
      ) : !me?.wallet || me.wallet !== s.account.address ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-3">Sign in with your wallet (a free signature, no transaction) to join and verify your holding.</p>
          <button className="btn btn-primary w-full" onClick={join} disabled={busy}>
            {busy ? "Verifying on-chain…" : "Sign in & join"}
          </button>
        </div>
      ) : (
        <>
          {score && (
            <div className="flex justify-center">
              <ConvictionArc parts={score.components} total={score.total} max={score.max} size={230} />
            </div>
          )}
          <div className="mt-4 rounded-lg bg-surface-2 p-3 text-xs text-ink-2">
            {holding?.since ? (
              <>
                Holding verified for <b className="text-ink">{holding.partial ? "at least " : ""}{days(holding.since)}</b> · checked {ago(holding.checkedAt)}
              </>
            ) : holding ? (
              <>No current holding found on-chain · checked {ago(holding.checkedAt)}. Holding adds reputation, but rewards never require it.</>
            ) : (
              <>Holding not verified yet.</>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <button className="btn btn-ghost flex-1" onClick={join} disabled={busy}>
              {busy ? "Reading chain…" : holding ? "Re-verify holding" : "Join & verify holding"}
            </button>
            <button className="btn btn-ghost" onClick={() => setShowMath((v) => !v)} aria-expanded={showMath}>
              {showMath ? "Hide math" : "Show math"}
            </button>
          </div>
          {showMath && score && (
            <div className="mt-3">
              <ScoreBreakdown score={score} />
            </div>
          )}
        </>
      )}
      {err && <p className="mt-3 text-xs text-bad">{err}</p>}
    </section>
  );
}
