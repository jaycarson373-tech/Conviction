"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, connect, disconnect, listWallets, onWalletsChange, signMessage, type StdAccount, type StdWallet } from "@/lib/wallet-client.ts";
import { siwsMessage } from "@/lib/siws.ts";

interface Ctx {
  wallets: StdWallet[];
  wallet: StdWallet | null;
  account: StdAccount | null;
  /** Wallet with a valid signed-in session on the server. */
  session: string | null;
  moderates: string[];
  busy: boolean;
  error: string | null;
  choose: (w: StdWallet) => Promise<void>;
  signIn: () => Promise<string>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const WalletCtx = createContext<Ctx | null>(null);
const LAST = "cp:last-wallet";

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<StdWallet[]>([]);
  const [wallet, setWallet] = useState<StdWallet | null>(null);
  const [account, setAccount] = useState<StdAccount | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [moderates, setModerates] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const me = await api<{ address: string | null; moderates?: string[] }>("/api/auth/me").catch(() => ({ address: null, moderates: [] }));
    setSession(me.address);
    setModerates(me.moderates ?? []);
  }, []);

  useEffect(() => {
    const update = () => setWallets(listWallets());
    update();
    const off = onWalletsChange(update);
    void refresh();
    return off;
  }, [refresh]);

  // Silent reconnect to the last wallet used, if it is installed.
  useEffect(() => {
    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST);
    } catch {}
    const w = last ? wallets.find((x) => x.name === last) : null;
    if (w && !wallet) connect(w, true).then((a) => (setWallet(w), setAccount(a))).catch(() => {});
  }, [wallets, wallet]);

  // Follow account switches inside the wallet.
  useEffect(() => {
    const ev = wallet?.features["standard:events"];
    if (!ev) return;
    return ev.on("change", ({ accounts }: { accounts?: StdAccount[] }) => {
      if (accounts) setAccount(accounts[0] ?? null);
    });
  }, [wallet]);

  const choose = useCallback(async (w: StdWallet) => {
    setError(null);
    setBusy(true);
    try {
      const a = await connect(w);
      setWallet(w);
      setAccount(a);
      try {
        localStorage.setItem(LAST, w.name);
      } catch {}
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  const signIn = useCallback(async () => {
    if (!wallet || !account) throw new Error("Connect a wallet first");
    setBusy(true);
    setError(null);
    try {
      const n = await api<{ nonce: string; issuedAt: string; expiresAt: string; domain: string }>("/api/auth/nonce");
      const message = siwsMessage({ domain: n.domain, address: account.address, nonce: n.nonce, issuedAt: n.issuedAt, expiresAt: n.expiresAt });
      const signature = await signMessage(wallet, account, message);
      const r = await api<{ address: string }>("/api/auth/verify", { method: "POST", json: { message, signature } });
      await refresh();
      return r.address;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }, [wallet, account, refresh]);

  const signOut = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    if (wallet) await disconnect(wallet).catch(() => {});
    try {
      localStorage.removeItem(LAST);
    } catch {}
    setWallet(null);
    setAccount(null);
    setSession(null);
    setModerates([]);
  }, [wallet]);

  const value = useMemo(() => ({ wallets, wallet, account, session, moderates, busy, error, choose, signIn, signOut, refresh }), [wallets, wallet, account, session, moderates, busy, error, choose, signIn, signOut, refresh]);
  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}

export function useWallet() {
  const c = useContext(WalletCtx);
  if (!c) throw new Error("useWallet outside WalletProvider");
  return c;
}

/** Signed-in wallet for actions; prompts connect/sign-in as needed. */
export function useSession() {
  const w = useWallet();
  const ensure = useCallback(async () => {
    if (w.session && w.account && w.session === w.account.address) return w.session;
    if (!w.account) throw new Error("Connect your wallet first");
    return w.signIn();
  }, [w]);
  return { ...w, ensure, ready: !!w.session && !!w.account && w.session === w.account.address };
}
