import Link from "next/link";
import { globalLeaderboard, listTokens } from "@/lib/queries.ts";
import { Empty, PageHeader, TokenAvatar } from "@/components/ui.tsx";
import { int, short } from "@/lib/format.ts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conviction Leaderboards" };

export default async function Leaderboards() {
  const [board, tokens] = await Promise.all([globalLeaderboard(), listTokens()]);
  const top = board[0]?.total ?? 0;
  return (
    <div>
      <PageHeader eyebrow="Conviction Leaderboards" title="The most committed wallets on Solana">
        Portable conviction: each wallet&apos;s strongest community counts in full, every other community adds 25%. Farming many small communities doesn&apos;t add up.
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="card p-5 sm:p-6">
          <h2 className="mb-4 text-[15px] font-semibold">Global</h2>
          {board.length === 0 ? (
            <Empty title="No conviction yet">Scores appear as members verify holdings, get contributions approved and vote.</Empty>
          ) : (
            <ol className="space-y-1">
              {board.map((r, i) => (
                <li key={r.wallet} className="grid grid-cols-[32px_1fr_auto] items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
                  <span className="num text-sm text-ink-3">{i + 1}</span>
                  <span className="min-w-0">
                    <Link href={`/u/${r.wallet}`} className="font-mono text-[13px] hover:text-accent-ink">{short(r.wallet, 5)}</Link>
                    <span className="mt-1 block h-1 overflow-hidden rounded-full bg-surface-3">
                      <span className="block h-full rounded-full bg-accent" style={{ width: `${top ? (r.total / top) * 100 : 0}%` }} />
                    </span>
                    <span className="mt-1 block truncate text-[11px] text-ink-3">{r.communities.map((c) => `$${c.symbol} ${c.score}`).join(" · ")}</span>
                  </span>
                  <span className="num text-right text-lg font-semibold">{r.total}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <aside className="card h-fit p-5">
          <h2 className="mb-3 text-[15px] font-semibold">By community</h2>
          {tokens.length === 0 ? (
            <p className="text-sm text-ink-3">No tokens listed yet.</p>
          ) : (
            <ul className="space-y-1">
              {tokens.map((t) => (
                <li key={t.mint}>
                  <Link href={`/t/${t.mint}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
                    <TokenAvatar src={t.image} symbol={t.symbol} size={28} />
                    <span className="min-w-0 flex-1 truncate text-sm">{t.name}</span>
                    <span className="num text-xs text-ink-3">{int(t.members)} members</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
