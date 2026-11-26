"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useWallet } from "./wallet-provider.tsx";
import { short } from "@/lib/format.ts";

export function WalletButton() {
  const w = useWallet();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  const signedIn = !!w.session && w.account?.address === w.session;
  return (
    <div className="relative" ref={ref}>
      {w.account ? (
        <button className="btn btn-ghost h-9 min-w-[132px] px-3" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className={`h-1.5 w-1.5 rounded-full ${signedIn ? "bg-accent" : "bg-warn"}`} aria-hidden />
          <span className="num font-mono text-[13px]">{short(w.account.address)}</span>
        </button>
      ) : (
        <button className="btn btn-primary h-9 min-w-[132px] px-4" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          Connect wallet
        </button>
      )}
      {open && (
        <div className="card fade-up absolute right-0 top-11 z-50 w-72 p-2 shadow-2xl shadow-black/50" role="menu">
          {!w.account ? (
            <>
              <p className="px-2 pb-2 pt-1 text-xs text-ink-3">Choose a Solana wallet</p>
              {w.wallets.length === 0 && (
                <div className="space-y-2 px-2 pb-2 text-sm text-ink-2">
                  <p>No wallet detected in this browser.</p>
                  <div className="flex gap-2">
                    <a className="btn btn-ghost h-8 flex-1 text-xs" href={`https://phantom.app/ul/browse/${typeof window === "undefined" ? "" : encodeURIComponent(window.location.href)}`}>Open in Phantom</a>
                    <a className="btn btn-ghost h-8 flex-1 text-xs" href={`https://solflare.com/ul/v1/browse/${typeof window === "undefined" ? "" : encodeURIComponent(window.location.href)}`}>Open in Solflare</a>
                  </div>
                </div>
              )}
              {w.wallets.map((x) => (
                <button key={x.name} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-surface-2" onClick={() => w.choose(x).then(() => setOpen(false))} disabled={w.busy}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={x.icon} alt="" width={22} height={22} className="rounded-md" />
                  {x.name}
                </button>
              ))}
            </>
          ) : (
            <div className="space-y-1">
              <div className="px-2 pb-2 pt-1">
                <p className="font-mono text-xs text-ink-2 break-all">{w.account.address}</p>
                <p className="mt-1 text-xs text-ink-3">{signedIn ? "Signed in — actions are tied to this wallet" : "Connected. Sign in to contribute, vote or manage a token."}</p>
              </div>
              {!signedIn && (
                <button className="btn btn-primary w-full" onClick={() => w.signIn().then(() => setOpen(false)).catch(() => {})} disabled={w.busy}>
                  {w.busy ? "Check your wallet…" : "Sign in (free, no transaction)"}
                </button>
              )}
              <Link href="/me" className="block rounded-lg px-2 py-2 text-sm hover:bg-surface-2" onClick={() => setOpen(false)}>
                My Conviction
              </Link>
              <button className="block w-full rounded-lg px-2 py-2 text-left text-sm text-ink-2 hover:bg-surface-2" onClick={() => navigator.clipboard.writeText(w.account!.address)}>
                Copy address
              </button>
              <button className="block w-full rounded-lg px-2 py-2 text-left text-sm text-ink-2 hover:bg-surface-2" onClick={() => w.signOut().then(() => setOpen(false))}>
                Disconnect
              </button>
            </div>
          )}
          {w.error && <p className="px-2 pt-2 text-xs text-bad">{w.error}</p>}
        </div>
      )}
    </div>
  );
}
