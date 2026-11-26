/**
 * One query interface, two engines:
 *   - DATABASE_URL set → Postgres (Supabase in production) via `postgres`.
 *   - unset           → embedded PGlite in ./.data (real Postgres, for dev and tests).
 * The schema in lib/schema.sql is applied on first use.
 */
import fs from "node:fs";
import path from "node:path";

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
}

let instance: Promise<Db> | null = null;

const SCHEMA = path.join(process.cwd(), "lib", "schema.sql");

async function make(): Promise<Db> {
  const schema = fs.readFileSync(SCHEMA, "utf8");
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    const sql = postgres(url, {
      prepare: false, // required behind Supabase's transaction pooler
      max: 5,
      idle_timeout: 20,
      types: {
        bigint: postgres.BigInt,
        // Callers pass JSON as strings (same as PGlite); don't let the driver JSON-encode them a second time.
        json: { to: 3802, from: [114, 3802], serialize: (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v)), parse: (s: string) => JSON.parse(s) },
      },
    });
    const wrap = (s: typeof sql | any): Db => ({
      query: async (q, p = []) => (await s.unsafe(q, p as never[])) as never,
      tx: (fn) => s.begin((t: any) => fn(wrap(t))) as never,
    });
    await sql.unsafe(schema);
    return wrap(sql);
  }
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_EMBEDDED_DB) {
    throw new Error("DATABASE_URL is required in production (set ALLOW_EMBEDDED_DB=1 to use the embedded PGlite store).");
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  if (dir !== "memory://") fs.mkdirSync(dir, { recursive: true });
  const pg = new PGlite(dir === "memory://" ? undefined : dir);
  await pg.exec(schema);
  // PGlite runs single-user Postgres: without a checkpoint, an unclean stop leaves the data dir
  // unrecoverable. Checkpoint shortly after writes, and close cleanly on shutdown.
  let timer: ReturnType<typeof setTimeout> | null = null;
  const checkpointSoon = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      pg.exec("CHECKPOINT").catch(() => {});
    }, 300);
  };
  await pg.exec("CHECKPOINT");
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.once(sig, () => {
      pg.exec("CHECKPOINT")
        .catch(() => {})
        .finally(() => pg.close().finally(() => process.exit(0)));
    });
  }
  const wrap = (p: any, top: boolean): Db => ({
    query: async (q, params = []) => {
      const rows = (await p.query(q, params)).rows;
      if (top && !/^\s*select/i.test(q)) checkpointSoon();
      return rows;
    },
    tx: async (fn) => {
      const out = p.transaction ? await p.transaction((t: any) => fn(wrap(t, false))) : await fn(wrap(p, false));
      checkpointSoon();
      return out;
    },
  });
  return wrap(pg, true);
}

export function db(): Promise<Db> {
  if (!instance) instance = make().catch((e) => {
    instance = null;
    throw e;
  });
  return instance;
}

export async function audit(mint: string | null, actor: string, action: string, detail: Record<string, unknown> = {}) {
  await (await db()).query("insert into audit_log(mint, actor, action, detail) values ($1,$2,$3,$4)", [mint, actor, action, JSON.stringify(detail)]);
}
