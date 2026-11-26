import { notFound } from "next/navigation";
import { profile } from "@/lib/service.ts";
import { ProfileView } from "@/components/profile-view.tsx";
import { PageHeader } from "@/components/ui.tsx";
import { short } from "@/lib/format.ts";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ wallet: string }> }) {
  return { title: `Conviction · ${short((await params).wallet)}` };
}

export default async function PublicProfile({ params }: { params: Promise<{ wallet: string }> }) {
  const wallet = (await params).wallet;
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) notFound();
  const p = await profile(wallet);
  return (
    <div>
      <PageHeader eyebrow="Conviction profile" title={short(wallet, 6)}>
        Reputation built across every ConvictionPad community, from on-chain history and public reviews.
      </PageHeader>
      <ProfileView p={p} />
    </div>
  );
}
