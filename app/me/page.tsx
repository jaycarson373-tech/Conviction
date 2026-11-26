import { sessionWallet } from "@/lib/auth.ts";
import { profile } from "@/lib/service.ts";
import { ProfileView } from "@/components/profile-view.tsx";
import { PageHeader } from "@/components/ui.tsx";
import { SignInPrompt } from "@/components/sign-in-prompt.tsx";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Conviction" };

export default async function MyConviction() {
  const wallet = await sessionWallet();
  return (
    <div>
      <PageHeader eyebrow="My Conviction" title="Your reputation, everywhere">
        One profile across every community. It moves with your wallet, so you never start from zero on a new launch.
      </PageHeader>
      {wallet ? <ProfileView p={await profile(wallet)} self /> : <SignInPrompt />}
    </div>
  );
}
