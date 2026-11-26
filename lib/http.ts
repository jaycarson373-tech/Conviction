import { NextResponse } from "next/server";
import { HttpError } from "./auth.ts";

/** JSON route wrapper: typed errors → status codes, bigint-safe serialization, no stack leaks. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  return async (...args: A) => {
    try {
      const out = await fn(...args);
      if (out instanceof Response) return out;
      return new NextResponse(JSON.stringify(out, (_k, v) => (typeof v === "bigint" ? v.toString() : v)), {
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 400;
      const message = e instanceof Error ? e.message : "Request failed";
      if (!(e instanceof HttpError)) console.error("[api]", message);
      return NextResponse.json({ error: message.slice(0, 300) }, { status });
    }
  };
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  const text = await req.text();
  if (text.length > 200_000) throw new HttpError(413, "Request too large");
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}

const buckets = new Map<string, number[]>();
/** Sliding-window limiter (per server instance). */
export function limit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) throw new HttpError(429, "Too many requests. Slow down and try again shortly.");
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 50_000) buckets.clear();
}

export function str(v: unknown, label: string, max = 200, min = 1): string {
  if (typeof v !== "string") throw new HttpError(400, `${label} is required`);
  const s = v.trim();
  if (s.length < min || s.length > max) throw new HttpError(400, `${label} must be ${min}–${max} characters`);
  return s;
}

export function httpsUrl(v: unknown, label: string): string {
  const s = str(v, label, 500);
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new HttpError(400, `${label} must be a valid URL`);
  }
  if (u.protocol !== "https:") throw new HttpError(400, `${label} must use https`);
  return u.toString();
}

export { canonicalUrl } from "./urls.ts";
