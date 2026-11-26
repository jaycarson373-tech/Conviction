import { venues } from "@/lib/launch.ts";
import { PageHeader } from "@/components/ui.tsx";
import { LaunchForm, ImportForm } from "@/components/launch-form.tsx";

export const dynamic = "force-dynamic";
export const metadata = { title: "Launch" };

export default function LaunchPage() {
  const v = venues();
  return (
    <div>
      <PageHeader eyebrow="Launch" title="Launch with conviction built in">
        Create a token on a supported Solana launchpad. It gets a conviction leaderboard, a contribution board, governance and a transparent reward ledger from block one. You sign everything in your own wallet; ConvictionPad never holds keys or funds.
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <LaunchForm venues={v} />
        <aside className="space-y-6">
          <div className="card p-5">
            <h2 className="mb-3 text-[15px] font-semibold">Supported launchpads</h2>
            <ul className="space-y-3 text-sm">
              {v.map((x) => (
                <li key={x.id}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{x.label}</span>
                    <span className={`pill ${x.status === "live" ? "pill-live" : x.status === "not-configured" ? "pill-warn" : ""}`}>{x.status === "live" ? "● Live" : x.status === "not-configured" ? "Not configured" : "Planned"}</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-ink-3">{x.detail}</p>
                </li>
              ))}
            </ul>
          </div>
          <div id="import" className="card scroll-mt-24 p-5">
            <h2 className="mb-1 text-[15px] font-semibold">Import an existing token</h2>
            <p className="mb-3 text-xs leading-relaxed text-ink-3">
              Any SPL or Token-2022 mint can get a conviction board. If your wallet is the on-chain creator (pump.fun curve or Meteora DBC pool), you get creator controls. Otherwise it&apos;s listed as unclaimed.
            </p>
            <ImportForm />
          </div>
        </aside>
      </div>
    </div>
  );
}
