"use client";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { COMPONENT_COLOR, COMPONENT_LABEL } from "@/lib/format.ts";

export interface ArcPart {
  component: string;
  points: number;
  max: number;
}

/**
 * The Conviction Arc: one open arc (no wraparound, so first and last segments never touch),
 * five segments sized by each component's max, filled by points earned.
 * Identity is never color-alone: the legend direct-labels every segment and hover reads it out.
 */
export function ConvictionArc({ parts, total, max = 1000, size = 260, label = "Conviction", compact = false, stacked = false }: { parts: ArcPart[]; total: number; max?: number; size?: number; label?: string; compact?: boolean; /** lay segments end-to-end by points (portable score) instead of fixed slots */ stacked?: boolean }) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const stroke = Math.max(6, size * 0.064);
  const r = size / 2 - stroke;
  const cx = size / 2;
  const cy = size / 2;
  const SWEEP = 280; // degrees; gap at the bottom
  const start = 90 + (360 - SWEEP) / 2; // measured clockwise from +x in SVG space
  const gapDeg = (2.4 / (2 * Math.PI * r)) * 360 * 2.2; // ~2px surface gap between segments
  const sumMax = parts.reduce((s, p) => s + p.max, 0) || 1;
  const usable = SWEEP - gapDeg * (parts.length - 1);

  const polar = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const arc = (a0: number, a1: number) => {
    const [x0, y0] = polar(a0);
    const [x1, y1] = polar(a1);
    return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  };

  let cursor = start;
  const segs = parts.map((p, i) => {
    const span = stacked ? (Math.max(0, p.points) / (max || 1)) * SWEEP : (p.max / sumMax) * usable;
    const a0 = cursor;
    const a1 = cursor + Math.max(0.001, span - (stacked && span > gapDeg ? gapDeg : 0));
    cursor = stacked ? cursor + span : a1 + gapDeg;
    return { ...p, i, d: arc(a0, a1), frac: stacked ? (p.points > 0 ? 1 : 0) : p.max > 0 ? Math.min(1, p.points / p.max) : 0 };
  });
  const track = arc(start, start + SWEEP);

  const h = hover === null ? null : segs[hover];
  return (
    <div className="flex flex-col items-center" style={{ width: compact ? size : undefined }}>
      <div className="relative" style={{ width: size, height: size * 0.92 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label} score ${total} of ${max}`} className="block">
          {stacked && <path d={track} stroke="var(--color-surface-3)" strokeWidth={stroke} fill="none" />}
          {segs.map((s) => (
            <g key={s.component} onMouseEnter={() => setHover(s.i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(s.i)} onBlur={() => setHover(null)} tabIndex={compact ? -1 : 0} style={{ cursor: "default", outline: "none" }}>
              {/* generous invisible hit target */}
              <path d={s.d} stroke="transparent" strokeWidth={stroke * 2.4} fill="none" />
              {!stacked && <path d={s.d} stroke="var(--color-surface-3)" strokeWidth={stroke} fill="none" strokeLinecap="butt" />}
              <motion.path
                d={s.d}
                stroke={COMPONENT_COLOR[s.component]}
                strokeWidth={stroke}
                fill="none"
                strokeLinecap="butt"
                initial={{ pathLength: reduce ? s.frac : 0 }}
                animate={{ pathLength: s.frac, opacity: hover === null || hover === s.i ? 1 : 0.35 }}
                transition={{ pathLength: { duration: reduce ? 0 : 1.1, delay: reduce ? 0 : 0.12 + s.i * 0.08, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: 0.15 } }}
                style={{ opacity: s.frac === 0 ? 0 : 1 }}
              />
            </g>
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" style={{ paddingBottom: size * 0.04 }}>
          {h ? (
            <>
              <span className="label" style={{ color: "var(--color-ink-2)" }}>{COMPONENT_LABEL[h.component]}</span>
              <span className="num font-semibold tracking-tight" style={{ fontSize: size * 0.2, lineHeight: 1.05 }}>
                {Math.round(h.points)}
              </span>
              <span className="num text-ink-3" style={{ fontSize: Math.max(11, size * 0.05) }}>{stacked ? "points" : `of ${h.max}`}</span>
            </>
          ) : (
            <>
              <span className="label">{label}</span>
              <motion.span className="num font-semibold tracking-tight" style={{ fontSize: size * 0.22, lineHeight: 1.05 }} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}>
                {total}
              </motion.span>
              <span className="num text-ink-3" style={{ fontSize: Math.max(11, size * 0.05) }}>of {max}</span>
            </>
          )}
        </div>
      </div>
      {!compact && (
        <ul className="mt-1 grid w-full grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2" aria-label="Score components">
          {segs.map((s) => (
            <li key={s.component} className="flex items-center justify-between gap-3 text-sm" onMouseEnter={() => setHover(s.i)} onMouseLeave={() => setHover(null)}>
              <span className="flex min-w-0 items-center gap-2 truncate text-ink-2">
                <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: COMPONENT_COLOR[s.component] }} />
                {COMPONENT_LABEL[s.component]}
              </span>
              <span className="num whitespace-nowrap text-ink">
                {Math.round(s.points)}
                {!stacked && <span className="text-ink-3"> / {s.max}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Thin horizontal stacked bar: the arc's compact form, for tables. 2px surface gaps between segments. */
export function ConvictionBar({ parts, max = 1000, width = 120 }: { parts: ArcPart[]; max?: number; width?: number }) {
  return (
    <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-3" style={{ width }} aria-hidden>
      {parts.map((p) =>
        p.points > 0 ? <span key={p.component} className="h-full" style={{ width: `${(p.points / max) * 100}%`, background: COMPONENT_COLOR[p.component], marginRight: 2 }} /> : null,
      )}
    </div>
  );
}
