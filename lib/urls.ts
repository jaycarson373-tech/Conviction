/** Canonical URL for duplicate detection: lowercase host, no tracking params, no trailing slash, no fragment. */
export function canonicalUrl(raw: string): string {
  const u = new URL(raw);
  u.hash = "";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "").replace(/^mobile\./, "").replace(/^twitter\.com$/, "x.com");
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|ref|s$|t$|si$|fbclid|gclid)/i.test(k)) u.searchParams.delete(k);
  return `${u.hostname}${u.pathname.replace(/\/+$/, "")}${u.search}`;
}
