/** Apply lib/schema.sql to DATABASE_URL (idempotent). The app also applies it on first use. */
import fs from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL");
const sql = postgres(url, { prepare: false, max: 1 });
await sql.unsafe(fs.readFileSync(new URL("../lib/schema.sql", import.meta.url), "utf8"));
const tables = await sql`select table_name from information_schema.tables where table_schema='public' order by 1`;
console.log("schema applied:", tables.map((t) => t.table_name).join(", "));
await sql.end();
