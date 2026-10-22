#!/usr/bin/env node
/**
 * Connectivity check for the upcoming full-app Postgres cutover.
 * Does not migrate data. See docs/POSTGRES-MIGRATION.md.
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[postgres] DATABASE_URL is not set.");
  process.exit(1);
}

const sql = postgres(url, { max: 1, idle_timeout: 5, connect_timeout: 10 });
try {
  const [{ ok }] = await sql`select 1 as ok`;
  console.log(`[postgres] ok=${ok} — ready for cutover work.`);
} catch (err) {
  console.error("[postgres] connection failed:", err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await sql.end({ timeout: 2 });
}
