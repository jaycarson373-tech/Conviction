"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Keypair } from "@solana/web3.js";
import { useSession } from "./wallet-provider.tsx";
import { api } from "@/lib/wallet-client.ts";
import { signAndSendLaunch } from "@/lib/tx-client.ts";
import { solscanTx } from "@/lib/format.ts";

type Venue = { id: string; label: string; status: "live" | "not-configured" | "planned"; detail: string };

const STEPS = ["Sign in", "Upload metadata", "Build transaction", "Sign in wallet", "Confirm on-chain", "Register"];

export function LaunchForm({ venues }: { venues: Venue[] }) {
  const s = useSession();
  const router = useRouter();
  const live = venues.filter((v) => v.status === "live");
  const [venue, setVenue] = useState(live[0]?.id ?? "pumpfun");
  const [f, setF] = useState({ name: "", symbol: "", description: "", website: "", twitter: "", telegram: "", devBuySol: 0 });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [step, setStep] = useState(-1);
  const [tick, setTick] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ mint: string; sig: string } | null>(null);
  const [ack, setAck] = useState(false);

  const selected = venues.find((v) => v.id === venue);
  const launch = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      if (!file) throw new Error("Add an image");
      setStep(0);
      await s.ensure();
      if (!s.wallet || !s.account) throw new Error("Connect a wallet");
      setStep(1);
      const form = new FormData();
      form.append("file", file);
      for (const k of ["name", "symbol", "description", "website", "twitter", "telegram"] as const) if (f[k]) form.append(k, String(f[k]));
      const { uri } = await api<{ uri: string }>("/api/launch/metadata", { method: "POST", body: form });
      setStep(2);
      const mint = Keypair.generate(); // lives only in this tab; signs the mint creation once
      const built = await api<{ transaction: string }>("/api/launch/build", { method: "POST", json: { venue, mint: mint.publicKey.toBase58(), name: f.name, symbol: f.symbol, uri, devBuySol: f.devBuySol } });
      setStep(3);
      const sig = await signAndSendLaunch(s.wallet, s.account, built.transaction, mint, (t) => {
        setTick(t);
        if (t.startsWith("Broadcasting") || t.startsWith("Confirming")) setStep(4);
      });
      setStep(5);
      setTick("Verifying the launch on-chain…");
      await api("/api/launch/confirm", { method: "POST", json: { mint: mint.publicKey.toBase58(), signature: sig } });
      setDone({ mint: mint.publicKey.toBase58(), sig });
      setTick(null);
      setStep(6);
      setTimeout(() => router.push(`/t/${mint.publicKey.toBase58()}`), 1200);
    } catch (e) {
      setErr((e as Error).message);
      setTick(null);
    }
  };

  const running = step >= 0 && step < 6 && !err;
  return (
    <form onSubmit={launch} className="card space-y-5 p-5 sm:p-6">
      <div>
        <p className="label mb-2">Launchpad</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {venues.map((v) => (
            <button
              type="button"
              key={v.id}
              disabled={v.status !== "live"}
              onClick={() => setVenue(v.id)}
              className={`rounded-xl border p-3 text-left transition-colors ${venue === v.id ? "border-accent bg-accent-deep/30" : "border-line hover:border-line-strong"} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <span className="block text-sm font-medium">{v.label}</span>
              <span className="mt-0.5 block text-[11px] text-ink-3">{v.status === "live" ? "Available" : v.status === "not-configured" ? "Not configured" : "Planned"}</span>
            </button>
          ))}
        </div>
        {selected && <p className="mt-2 text-xs text-ink-3">{selected.detail}</p>}
      </div>

      <div className="grid gap-5 sm:grid-cols-[132px_1fr]">
        <label className="group relative grid aspect-square cursor-pointer place-items-center overflow-hidden rounded-2xl border border-dashed border-line-strong bg-surface-2 text-center text-xs text-ink-3 hover:border-accent">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Token image preview" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <span className="px-3">Image<br />PNG · JPG · GIF<br />≤ 2 MB</span>
          )}
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="sr-only"
            onChange={(e) => {
              const x = e.target.files?.[0] ?? null;
              if (x && x.size > 2_000_000) return setErr("Image must be under 2 MB");
              setFile(x);
              setPreview(x ? URL.createObjectURL(x) : null);
            }}
          />
        </label>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
            <input className="input" placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={32} />
            <input className="input uppercase" placeholder="Symbol" value={f.symbol} onChange={(e) => setF({ ...f, symbol: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} required maxLength={10} />
          </div>
          <textarea className="input" rows={3} placeholder="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={500} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <input className="input" placeholder="Website https://" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} type="url" />
        <input className="input" placeholder="X / Twitter https://" value={f.twitter} onChange={(e) => setF({ ...f, twitter: e.target.value })} type="url" />
        <input className="input" placeholder="Telegram https://" value={f.telegram} onChange={(e) => setF({ ...f, telegram: e.target.value })} type="url" />
      </div>
      {venue === "pumpfun" && (
        <label className="block text-sm text-ink-2">
          Optional dev buy (SOL), bundled into the create transaction
          <input className="input mt-1 w-40" type="number" min={0} max={50} step={0.01} value={f.devBuySol} onChange={(e) => setF({ ...f, devBuySol: Number(e.target.value) })} />
        </label>
      )}
      <label className="flex items-start gap-2 text-sm text-ink-2">
        <input type="checkbox" className="mt-1 accent-[var(--color-accent)]" checked={ack} onChange={(e) => setAck(e.target.checked)} required />
        I understand this creates a real token on Solana mainnet, paid from my wallet, and that ConvictionPad is reputation software, not an investment product.
      </label>

      {step >= 0 && (
        <ol className="grid gap-1.5 rounded-xl bg-surface-2 p-3 text-xs sm:grid-cols-3">
          {STEPS.map((label, i) => (
            <li key={label} className={`flex items-center gap-2 ${i < step ? "text-accent-ink" : i === step && !err ? "text-ink" : "text-ink-3"}`}>
              <span className="num">{i < step ? "✓" : i + 1}</span>
              {label}
            </li>
          ))}
        </ol>
      )}
      {tick && <p className="text-xs text-ink-2">{tick}</p>}
      {err && <p className="text-sm text-bad">{err}</p>}
      {done && (
        <p className="text-sm text-accent-ink">
          Launched. <a className="underline" href={solscanTx(done.sig)} target="_blank" rel="noopener noreferrer">View transaction</a>. Opening the token page…
        </p>
      )}
      <button className="btn btn-primary h-11 w-full text-[15px]" disabled={running || !live.some((v) => v.id === venue)}>
        {running ? "Working…" : `Launch on ${selected?.label ?? ""}`}
      </button>
    </form>
  );
}

export function ImportForm() {
  const s = useSession();
  const router = useRouter();
  const [mint, setMint] = useState("");
  const [launchlab, setLaunchlab] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          await s.ensure();
          const r = await api<{ mint: string }>("/api/tokens", { method: "POST", json: { mint, venue: launchlab ? "raydium-launchlab" : undefined } });
          router.push(`/t/${r.mint}`);
        } catch (e) {
          setErr((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <input className="input font-mono text-xs" placeholder="Mint address" value={mint} onChange={(e) => setMint(e.target.value.trim())} required />
      <label className="flex items-center gap-2 text-xs text-ink-2">
        <input type="checkbox" className="accent-[var(--color-accent)]" checked={launchlab} onChange={(e) => setLaunchlab(e.target.checked)} />
        Launched on Raydium LaunchLab
      </label>
      <button className="btn btn-ghost w-full" disabled={busy || mint.length < 32}>{busy ? "Reading chain…" : "Import"}</button>
      {err && <p className="text-xs text-bad">{err}</p>}
    </form>
  );
}
