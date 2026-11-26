"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "./wallet-button.tsx";

const LINKS = [
  { href: "/", label: "Discover" },
  { href: "/launch", label: "Launch" },
  { href: "/leaderboards", label: "Leaderboards" },
  { href: "/me", label: "My Conviction" },
  { href: "/contributions", label: "Contributions" },
  { href: "/rewards", label: "Rewards" },
  { href: "/docs", label: "Docs" },
];

export function Mark({ size = 22 }: { size?: number }) {
  // Open arc mark — echoes the Conviction Arc.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M6.3 19.2A9 9 0 1 1 17.7 19.2" fill="none" stroke="var(--color-line-strong)" strokeWidth="3" />
      <path d="M6.3 19.2A9 9 0 0 1 15.8 3.6" fill="none" stroke="var(--color-accent)" strokeWidth="3" />
    </svg>
  );
}

export function Nav() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
          <Mark />
          <span>ConvictionPad</span>
        </Link>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${active(l.href) ? "bg-surface-2 text-ink" : "text-ink-2 hover:text-ink"}`}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto">
          <WalletButton />
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-4 pb-2 lg:hidden" aria-label="Main mobile">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={`shrink-0 rounded-lg px-3 py-1.5 text-[13px] ${active(l.href) ? "bg-surface-2 text-ink" : "text-ink-2"}`}>
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
