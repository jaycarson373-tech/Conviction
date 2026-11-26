import { listTokens } from "@/lib/queries.ts";
import { PageHeader } from "@/components/ui.tsx";
import { ContributionsHub } from "@/components/contributions-hub.tsx";
import { CONTRIBUTION_TYPES } from "@/lib/scoring.ts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contributions" };

export default async function Contributions() {
  const tokens = (await listTokens()).map((t) => ({ mint: t.mint, symbol: t.symbol, name: t.name }));
  return (
    <div>
      <PageHeader eyebrow="Contributions" title="Original work, publicly reviewed">
        Artwork, memes, research, education, tooling, translations. Each submission is graded 1–5 by the token&apos;s reviewers in public. Spam, plagiarism and undisclosed paid promotion are rejected with a strike.
      </PageHeader>
      <ContributionsHub tokens={tokens} types={[...CONTRIBUTION_TYPES]} />
    </div>
  );
}
