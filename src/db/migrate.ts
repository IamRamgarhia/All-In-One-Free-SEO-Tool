import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { db, sqlite } from "./client";

const migrationsFolder = path.join(process.cwd(), "src", "db", "migrations");

console.log(`Running migrations from ${migrationsFolder}…`);
migrate(db, { migrationsFolder });
sqlite.close();
console.log("Migrations complete.");
