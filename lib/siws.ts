/**
 * Sign-In With Solana + signed actions (pure; works in browser and server).
 * The exact message text is shown in the wallet, so it must stay human-readable.
 */

export interface SiwsFields {
  domain: string;
  address: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
}

export function siwsMessage(f: SiwsFields): string {
  return [
    `${f.domain} wants you to sign in with your Solana account:`,
    f.address,
    "",
    "Sign in to ConvictionPad. This request costs nothing and does not authorize any transaction.",
    "",
    `URI: https://${f.domain}`,
    "Version: 1",
    "Chain: solana:mainnet",
    `Nonce: ${f.nonce}`,
    `Issued At: ${f.issuedAt}`,
    `Expiration Time: ${f.expiresAt}`,
  ].join("\n");
}

export function parseSiws(message: string): SiwsFields | null {
  const lines = message.split("\n");
  const m = /^(.+) wants you to sign in with your Solana account:$/.exec(lines[0] ?? "");
  if (!m || lines.length !== 11) return null;
  const field = (i: number, key: string) => (lines[i]?.startsWith(`${key}: `) ? lines[i].slice(key.length + 2) : null);
  const domain = m[1];
  const address = lines[1];
  const nonce = field(8, "Nonce");
  const issuedAt = field(9, "Issued At");
  const expiresAt = field(10, "Expiration Time");
  if (!nonce || !issuedAt || !expiresAt) return null;
  if (siwsMessage({ domain, address, nonce, issuedAt, expiresAt }) !== message) return null;
  return { domain, address, nonce, issuedAt, expiresAt };
}

/** Governance vote message: signed by the wallet, stored with the vote so anyone can verify it. */
export function voteMessage(v: { mint: string; proposalId: string; title: string; choice: number; label: string; address: string; at: string }): string {
  return [
    "ConvictionPad governance vote",
    `Token: ${v.mint}`,
    `Proposal: ${v.proposalId}`,
    `Title: ${v.title}`,
    `Choice: ${v.choice} — ${v.label}`,
    `Wallet: ${v.address}`,
    `Signed At: ${v.at}`,
  ].join("\n");
}
