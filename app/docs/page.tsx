import { DEFAULT_CONFIG, SCORING_VERSION } from "@/lib/scoring.ts";
import { venues } from "@/lib/launch.ts";
import { PageHeader } from "@/components/ui.tsx";
import { COMPONENT_COLOR } from "@/lib/format.ts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Documentation" };

const W = DEFAULT_CONFIG.weights;

function H({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-24 pt-4 text-xl font-semibold tracking-tight">
      {children}
    </h2>
  );
}
function F({ children }: { children: React.ReactNode }) {
  return <code className="my-2 block overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 font-mono text-[12.5px] text-ink">{children}</code>;
}

export default function Docs() {
  const status = [
    ...venues().map((v) => ({ feature: `Launch: ${v.label}`, status: v.status, note: v.detail })),
    { feature: "Import any SPL / Token-2022 mint", status: "live", note: "Creator rights via pump.fun curve or Meteora DBC pool creator field, or a ConvictionPad launch signature." },
    { feature: "Verified holding duration", status: "live", note: "Read from the wallet's token-account history (up to 60 transactions; older holdings are shown as a lower bound “≥”)." },
    { feature: "Contribution submission & public review", status: "live", note: "Reviewer grades 1–5; strike reasons; duplicate-link detection; paid-promotion disclosure." },
    { feature: "Signed governance votes", status: "live", note: "Off-chain, wallet-signed messages, stored with their signatures. Not an on-chain program." },
    { feature: "Reward funding verification", status: "live", note: "Any confirmed tx that increased the reward wallet's SOL balance, designated by the creator." },
    { feature: "Epoch allocations + manifest hash", status: "live", note: "Pro-rata by contribution points with cap, min payout, Sybil/age exclusions." },
    { feature: "Payouts", status: "live", note: "Signed by the reward wallet in-browser; each transfer verified against the manifest." },
    { feature: "Exact holder counts", status: process.env.HELIUS_API_KEY ? "live" : "not-configured", note: "Needs HELIUS_API_KEY (DAS). Otherwise shown as “—”." },
    { feature: "SPL-token (non-SOL) reward payouts", status: "planned", note: "Rewards are SOL today." },
    { feature: "On-chain escrow / claim program for rewards", status: "planned", note: "Today payouts are direct transfers from the project wallet; nothing is custodied by ConvictionPad." },
    { feature: "Automated Sybil clustering (funding-graph analysis)", status: "planned", note: "Today: wallet-age gate, reviewer flags, one-allocation-per-wallet, per-wallet cap." },
    { feature: "Social account verification (X, Discord)", status: "planned", note: "Contributions are linked by URL and reviewed by humans." },
  ];
  return (
    <div className="grid gap-10 lg:grid-cols-[200px_1fr]">
      <nav className="hidden lg:block" aria-label="Documentation">
        <ul className="sticky top-24 space-y-1.5 text-sm text-ink-3">
          {[
            ["overview", "Overview"],
            ["score", "Proof of Conviction"],
            ["abuse", "What doesn't count"],
            ["rewards", "Conviction Rewards"],
            ["launch", "Launching"],
            ["status", "Operational vs planned"],
            ["trust", "Trust model"],
          ].map(([id, l]) => (
            <li key={id}>
              <a href={`#${id}`} className="hover:text-ink">{l}</a>
            </li>
          ))}
        </ul>
      </nav>
      <article className="min-w-0 max-w-3xl space-y-4 text-[15px] leading-relaxed text-ink-2">
        <PageHeader eyebrow="Documentation" title="How ConvictionPad works" />
        <H id="overview">Overview</H>
        <p>
          ConvictionPad is a launchpad plus a reputation layer. Every listed token gets a public leaderboard, a contribution board, wallet-signed governance and a reward ledger. A wallet&apos;s conviction is computed by an open formula from inputs anyone can audit: chain history, public review decisions and signed votes.
        </p>

        <H id="score">Proof of Conviction (model {SCORING_VERSION})</H>
        <p>Five components, each capped. Defaults below; a project can re-weight them (always totalling 1000), and every change is audit-logged.</p>
        <ul className="space-y-5">
          <li>
            <p className="font-medium text-ink"><Dot c="holding" />Holding: up to {W.holding}</p>
            <F>{`${W.holding} × ln(1 + days) / ln(1 + ${DEFAULT_CONFIG.holdingFullDays})`}</F>
            <p>Days of <em>continuous</em> holding above the project&apos;s dust floor, read from the wallet&apos;s associated token account history. The balance size is not an input: holding 1,000 tokens or 10 million scores the same. Holding builds reputation only; it is never required for rewards.</p>
          </li>
          <li>
            <p className="font-medium text-ink"><Dot c="participation" />Participation: up to {W.participation}</p>
            <F>{`${W.participation} × ln(1 + activeEpochs) / ln(1 + ${DEFAULT_CONFIG.participationFullEpochs})`}</F>
            <p>Distinct epochs with an approved contribution or a signed vote.</p>
          </li>
          <li>
            <p className="font-medium text-ink"><Dot c="contributions" />Contributions: up to {W.contributions}</p>
            <F>{`value = typeWeight × quality(1–5);  per epoch, k-th best item × 0.5^(k−1)`}</F>
            <F>{`${W.contributions} × (1 − e^(−points / ${DEFAULT_CONFIG.contributionScale})) × (1 − ${DEFAULT_CONFIG.strikePenalty} × strikes)`}</F>
            <p>
              Type weights: {Object.entries(DEFAULT_CONFIG.typeWeights).map(([k, v]) => `${k} ${v}`).join(" · ")}. Thirty one-star memes in a week are worth less than one solid research piece.
            </p>
          </li>
          <li>
            <p className="font-medium text-ink"><Dot c="governance" />Governance: up to {W.governance}</p>
            <F>{`${W.governance} × (1 − e^(−(votes + 3 × proposalsWithTurnout≥5) / ${DEFAULT_CONFIG.governanceScale}))`}</F>
            <p>Votes are wallet-signed messages. Holders or approved contributors may vote, one vote per wallet per proposal.</p>
          </li>
          <li>
            <p className="font-medium text-ink"><Dot c="consistency" />Consistency: up to {W.consistency}</p>
            <F>{`${W.consistency} × (epochsWithApprovedWork / window) × min(1, window / 3)`}</F>
            <p>Over the last {DEFAULT_CONFIG.consistencyWindow} epochs since your first approved contribution. It ramps in, so a single burst can&apos;t look consistent.</p>
          </li>
        </ul>
        <p>
          <span className="font-medium text-ink">Portable conviction.</span> Your profile score is your strongest community in full plus 25% of every other community, capped at 1000:
        </p>
        <F>{`global = min(1000, best + 0.25 × Σ others)`}</F>

        <H id="abuse">What doesn&apos;t count</H>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><span className="text-ink">Trading volume.</span> Not an input anywhere. Wash trading earns nothing.</li>
          <li><span className="text-ink">Position size.</span> Buying more never raises your score.</li>
          <li><span className="text-ink">Artificial engagement.</span> Likes, follows and reply farming aren&apos;t measured; only reviewed work is.</li>
          <li><span className="text-ink">Coordinated spam.</span> Diminishing returns per epoch, per-wallet rate limits, duplicate-link rejection and strikes.</li>
          <li><span className="text-ink">Undisclosed paid promotion.</span> Rejected with a strike. Disclosed paid work can build reputation but is excluded from reward payouts.</li>
          <li><span className="text-ink">Sybil wallets.</span> Reward eligibility needs a minimum wallet age (default {14} days, set per project); reviewers can flag clusters publicly; one allocation per wallet; per-wallet cap.</li>
        </ul>

        <H id="rewards">Conviction Rewards</H>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>The creator sets a reward wallet and may disclose a pledge (for example, 20% of creator fees). The pledge is a public statement; only verified funding is spendable.</li>
          <li>Funding: the creator designates confirmed transactions that increased the reward wallet&apos;s SOL, such as a creator-fee claim or a transfer. The verified increase is recorded with its signature.</li>
          <li>When an epoch ends, the creator publishes allocations. The pot is the budget chosen, never more than verified funding minus everything already allocated. Weights are the epoch&apos;s approved contribution points only.</li>
          <li>The canonical manifest and its sha256 are published. Anyone can recompute it on the epoch page.</li>
          <li>Payouts are SOL transfers from the reward wallet carrying the memo <code className="font-mono text-ink">convictionpad:&lt;epoch&gt;</code>. Each transfer is checked against the manifest before it&apos;s marked paid.</li>
        </ol>
        <p>
          Rewards never come from new participants&apos; deposits, and nothing on ConvictionPad promises returns. There is no staking, no buy-in and no holding requirement for rewards. A score is reputation, not a financial claim.
        </p>

        <H id="launch">Launching</H>
        <p>
          The server builds an unsigned transaction. Your browser generates the new mint key, adds its signature, and your wallet signs. The browser checks the wallet didn&apos;t alter the transaction, broadcasts it, and the server verifies the confirmed launch on-chain before the token is listed. ConvictionPad never holds a private key.
        </p>

        <H id="status">Operational vs planned</H>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left">
                <th className="label px-4 py-3">Feature</th>
                <th className="label px-4 py-3">Status</th>
                <th className="label px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {status.map((s) => (
                <tr key={s.feature} className="border-t border-line align-top">
                  <td className="px-4 py-3 text-ink">{s.feature}</td>
                  <td className="px-4 py-3">
                    <span className={`pill ${s.status === "live" ? "pill-live" : s.status === "not-configured" ? "pill-warn" : ""}`}>{s.status === "live" ? "Operational" : s.status === "not-configured" ? "Not configured" : "Planned"}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-3">{s.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <H id="trust">Trust model</H>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><span className="text-ink">Chain-verified:</span> holding periods, launch transactions, creator identity, funding, payouts.</li>
          <li><span className="text-ink">Signature-verified:</span> sign-in, votes.</li>
          <li><span className="text-ink">Human-reviewed, public:</span> contribution grades, rejections, Sybil flags. Every decision is attributed to a reviewer wallet in the audit log.</li>
          <li>The ConvictionPad server is trusted to run the published formula; the inputs and formula are public, so any result can be recomputed.</li>
        </ul>
      </article>
    </div>
  );
}

function Dot({ c }: { c: string }) {
  return <span aria-hidden className="mr-2 inline-block h-2.5 w-2.5 rounded-[3px] align-middle" style={{ background: COMPONENT_COLOR[c] }} />;
}
