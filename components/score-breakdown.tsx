import { COMPONENT_COLOR, COMPONENT_LABEL } from "@/lib/format.ts";
import type { ScoreResult } from "@/lib/scoring.ts";

/** Transparent breakdown: every component's points, the formula with real inputs, and its source. */
const SOURCE: Record<string, string> = {
  holding: "On-chain: the wallet's token-account history (time above dust floor; amount ignored)",
  participation: "Epochs with an approved contribution or a signed governance vote",
  contributions: "Reviewer-graded submissions; diminishing returns per epoch; strikes deduct",
  governance: "Wallet-signed votes; proposals reaching ≥5 voters count ×3",
  consistency: "Share of recent epochs with approved work",
};

export function ScoreBreakdown({ score }: { score: ScoreResult }) {
  return (
    <div className="divide-y divide-line">
      {score.components.map((c) => (
        <div key={c.component} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 py-3.5">
          <div className="flex items-center gap-2">
            <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: COMPONENT_COLOR[c.component] }} />
            <span className="text-sm font-medium">{COMPONENT_LABEL[c.component]}</span>
          </div>
          <span className="num text-sm">
            {c.points.toFixed(1)}
            <span className="text-ink-3"> / {c.max}</span>
          </span>
          <div className="col-span-2 h-1 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full" style={{ width: `${c.max ? (c.points / c.max) * 100 : 0}%`, background: COMPONENT_COLOR[c.component] }} />
          </div>
          <code className="col-span-2 block overflow-x-auto font-mono text-[11.5px] leading-relaxed text-ink-2">{c.explain}</code>
          <p className="col-span-2 text-xs text-ink-3">{SOURCE[c.component]}</p>
        </div>
      ))}
      <div className="flex items-center justify-between pt-3 text-xs text-ink-3">
        <span>
          Scoring model <code className="font-mono">{score.version}</code> — open formula, see Documentation
        </span>
        <span className="num text-sm text-ink">
          {score.total} <span className="text-ink-3">/ {score.max}</span>
        </span>
      </div>
    </div>
  );
}
