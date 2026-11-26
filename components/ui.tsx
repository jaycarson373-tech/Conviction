import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, children, actions }: { eyebrow?: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow && <p className="label mb-2">{eyebrow}</p>}
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] sm:text-[34px]">{title}</h1>
        {children && <div className="mt-2 text-[15px] leading-relaxed text-ink-2">{children}</div>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "up" | "down" | null }) {
  return (
    <div className="min-w-0">
      <p className="label">{label}</p>
      <p className={`num mt-1.5 truncate text-[20px] font-semibold tracking-tight ${tone === "up" ? "text-accent-ink" : tone === "down" ? "text-bad" : ""}`}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

export function Section({ title, aside, children, className = "" }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-5 sm:p-6 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {aside && <div className="text-xs text-ink-3">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="mx-auto mt-1.5 max-w-md text-sm text-ink-3">{children}</div>}
    </div>
  );
}

export function TokenAvatar({ src, symbol, size = 36 }: { src?: string | null; symbol: string; size?: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full bg-surface-3 object-cover" style={{ width: size, height: size }} loading="lazy" referrerPolicy="no-referrer" />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-full bg-surface-3 text-[11px] font-semibold text-ink-2" style={{ width: size, height: size }}>
      {symbol.slice(0, 3)}
    </span>
  );
}

export function StatusPill({ status }: { status: "live" | "not-configured" | "planned" | string }) {
  if (status === "live") return <span className="pill pill-live">● Live</span>;
  if (status === "not-configured") return <span className="pill pill-warn">Not configured</span>;
  return <span className="pill">Planned</span>;
}
