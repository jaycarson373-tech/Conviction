import { test } from "node:test";
import assert from "node:assert/strict";
import { compact, usd } from "../lib/format.ts";
import { canonicalUrl } from "../lib/urls.ts";
import { parseSiws, siwsMessage } from "../lib/siws.ts";

test("tiny prices use zero subscripts, never fake precision", () => {
  assert.equal(usd(0.00000159), "$0.0₅159");
  assert.equal(usd(0.0034), "$0.00340");
  assert.equal(usd(71.35), "$71.35");
  assert.equal(usd(18_030_000), "$18.03M");
  assert.equal(usd(null), "—");
  assert.equal(compact(969_457_812), "969.46M");
  assert.equal(compact(null), "—");
});

test("canonical URLs catch duplicates with tracking params / www / trailing slash", () => {
  assert.equal(canonicalUrl("https://www.Example.com/a/b/?utm_source=x#frag"), canonicalUrl("https://example.com/a/b"));
  assert.equal(canonicalUrl("https://twitter.com/u/status/1?s=20"), canonicalUrl("https://x.com/u/status/1"));
  assert.notEqual(canonicalUrl("https://example.com/a?id=1"), canonicalUrl("https://example.com/a?id=2"));
});

test("SIWS message round-trips and rejects tampering", () => {
  const f = { domain: "convictionpad.xyz", address: "8iePZ4VGjt51pR2HG212PYHysPciEiFgXM4MVGoodR6J", nonce: "abc.123.def", issuedAt: "2026-11-26T00:00:00.000Z", expiresAt: "2026-11-26T00:10:00.000Z" };
  const m = siwsMessage(f);
  assert.deepEqual(parseSiws(m), f);
  assert.equal(parseSiws(m.replace("Sign in to ConvictionPad.", "Sign in to Evil.")), null);
  assert.equal(parseSiws(m + "\nextra"), null);
});
