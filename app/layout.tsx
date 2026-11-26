import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/components/wallet-provider.tsx";
import { Nav } from "@/components/nav.tsx";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-face", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3200"),
  title: { default: "ConvictionPad — Prove your conviction", template: "%s · ConvictionPad" },
  description: "A Solana launchpad built around Proof of Conviction: transparent, portable reputation for the people who actually build token communities.",
  openGraph: { title: "ConvictionPad", description: "Prove your conviction.", type: "website" },
};

export const viewport: Viewport = { themeColor: "#0c0d0f", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-dvh">
        <WalletProvider>
          <Nav />
          <main className="mx-auto w-full max-w-[1200px] px-4 pb-24 pt-6 sm:px-6 lg:px-8">{children}</main>
          <footer className="mx-auto max-w-[1200px] px-4 pb-10 text-xs text-ink-3 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-2 border-t border-line pt-6 sm:flex-row sm:justify-between">
              <span>ConvictionPad — Prove your conviction.</span>
              <span>Scores are reputation, not investment advice. Rewards come only from verified, disclosed project budgets.</span>
            </div>
          </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
