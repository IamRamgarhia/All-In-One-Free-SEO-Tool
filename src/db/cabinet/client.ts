/**
 * PostgreSQL client for the audit cabinet.
 *
 * Legacy SEO-Tool modules keep using SQLite (`src/db/client.ts`).
 * The cabinet (clients → sites → SEOmator runs → issues → actions)
 * lives here behind DATABASE_URL.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;

if (!url) {
  console.warn(
    "[cabinet] DATABASE_URL is not set — cabinet APIs will fail until it is configured.",
  );
}

const queryClient = url
  ? postgres(url, { max: 10, idle_timeout: 20 })
  : (null as unknown as ReturnType<typeof postgres>);

export const cabinetDb = url
  ? drizzle(queryClient, { schema })
  : (null as unknown as ReturnType<typeof drizzle<typeof schema>>);

export function requireCabinetDb() {
  if (!process.env.DATABASE_URL || !cabinetDb) {
    throw new Error(
      "DATABASE_URL is required for the audit cabinet. Set it in .env (postgresql://…).",
    );
  }
  return cabinetDb;
}

export { queryClient as cabinetSql };
