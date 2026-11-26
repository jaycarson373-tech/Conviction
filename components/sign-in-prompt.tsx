"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useWallet } from "./wallet-provider.tsx";

export function SignInPrompt() {
  const w = useWallet();
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (w.session) router.refresh();
  }, [w.session, router]);
  return (
    <div className="card mx-auto max-w-lg p-8 text-center">
      <p className="text-lg font-semibold">Connect to see your conviction</p>
      <p className="mt-2 text-sm text-ink-3">Signing in is a free message signature. It proves you control the wallet and never authorizes a transaction.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {!w.account ? (
          w.wallets.length ? (
            w.wallets.map((x) => (
              <button key={x.name} className="btn btn-ghost" onClick={() => w.choose(x)} disabled={w.busy}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={x.icon} alt="" width={18} height={18} className="rounded" /> {x.name}
              </button>
            ))
          ) : (
            <p className="text-sm text-ink-2">No Solana wallet found in this browser. Install Phantom, Solflare or Backpack, or open this page in their in-app browser.</p>
          )
        ) : (
          <button className="btn btn-primary" onClick={() => w.signIn().then(() => router.refresh()).catch((e) => setErr(e.message))} disabled={w.busy}>
            {w.busy ? "Check your wallet…" : "Sign in"}
          </button>
        )}
      </div>
      {(err || w.error) && <p className="mt-3 text-xs text-bad">{err ?? w.error}</p>}
    </div>
  );
}
