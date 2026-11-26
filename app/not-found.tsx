import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <p className="label">404</p>
      <h1 className="mt-2 text-2xl font-semibold">Not listed here</h1>
      <p className="mt-2 text-sm text-ink-3">This page or token isn&apos;t on ConvictionPad. Tokens can be imported from the Launch page.</p>
      <div className="mt-6 flex justify-center gap-2">
        <Link href="/" className="btn btn-ghost">Discover</Link>
        <Link href="/launch#import" className="btn btn-primary">Import a token</Link>
      </div>
    </div>
  );
}
