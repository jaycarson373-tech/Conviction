export const short = (a: string | null | undefined, n = 4) => (a ? `${a.slice(0, n)}…${a.slice(-n)}` : "—");

export function sol(lamports: string | number | bigint | null | undefined, digits = 3): string {
  if (lamports === null || lamports === undefined) return "—";
  const n = Number(lamports) / 1e9;
  if (n === 0) return "0";
  if (n < 0.001) return n.toPrecision(2);
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

const SUB = "₀₁₂₃₄₅₆₇₈₉";
/** $0.0₅159 style for tiny prices (= 0.00000159): the subscript counts the zeros after the decimal point. */
function tiny(v: number): string {
  const [, frac = ""] = v.toFixed(20).split(".");
  const zeros = frac.match(/^0*/)![0].length;
  const digits = frac.slice(zeros, zeros + 3).replace(/0+$/, "") || "0";
  if (zeros < 4) return `$${v.toPrecision(3)}`;
  return `$0.0${String(zeros).split("").map((d) => SUB[Number(d)]).join("")}${digits}`;
}

export function usd(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (v === 0) return "$0";
  if (Math.abs(v) < 0.01) return tiny(Math.abs(v));
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e4) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export function pct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

export function compact(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function int(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return Number(v).toLocaleString("en-US");
}

export function ago(t: string | number | Date | null | undefined): string {
  if (!t) return "—";
  const s = (Date.now() - new Date(t).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function days(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  const d = (Date.now() - ms) / 86_400_000;
  if (d < 1) return "<1 day";
  return `${Math.floor(d)} day${Math.floor(d) === 1 ? "" : "s"}`;
}

export const solscanTx = (sig: string) => `https://solscan.io/tx/${sig}`;
export const solscanAccount = (a: string) => `https://solscan.io/account/${a}`;

export const VENUE_LABEL: Record<string, string> = {
  pumpfun: "Pump.fun",
  "meteora-dbc": "Meteora DBC",
  "raydium-launchlab": "Raydium LaunchLab",
  other: "Imported",
};

export const COMPONENT_LABEL: Record<string, string> = {
  holding: "Holding",
  participation: "Participation",
  contributions: "Contributions",
  governance: "Governance",
  consistency: "Consistency",
};

export const COMPONENT_COLOR: Record<string, string> = {
  holding: "var(--color-c-holding)",
  participation: "var(--color-c-participation)",
  contributions: "var(--color-c-contributions)",
  governance: "var(--color-c-governance)",
  consistency: "var(--color-c-consistency)",
};
