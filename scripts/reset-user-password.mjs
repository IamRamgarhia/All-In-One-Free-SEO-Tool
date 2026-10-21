#!/usr/bin/env node
/**
 * Reset a workspace user's password (accounts mode).
 *
 * Usage (on the VPS, inside the running container):
 *   node scripts/reset-user-password.mjs admin@example.com 'NewSecurePhrase123'
 *
 * Requires SEO_DB_PATH (defaults to /data/data.db in Docker).
 */
import crypto from "node:crypto";
import { promisify } from "node:util";
import Database from "better-sqlite3";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scrypt = promisify(crypto.scrypt);

const MIN_LEN = 10;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  return `scrypt:1:${salt}:${derived.toString("hex")}`;
}

function dbPath() {
  if (process.env.SEO_DB_PATH) return process.env.SEO_DB_PATH;
  const dataDir = process.env.SEO_DATA_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "..", "data");
  return join(dataDir, "data.db");
}

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error("Usage: node scripts/reset-user-password.mjs <email> <new-password>");
  process.exit(1);
}
if (password.length < MIN_LEN) {
  console.error(`Password must be at least ${MIN_LEN} characters.`);
  process.exit(1);
}

const normalised = email.trim().toLowerCase();
const path = dbPath();
const db = new Database(path);
const row = db
  .prepare("SELECT id, email, role FROM users WHERE lower(email) = ?")
  .get(normalised);

if (!row) {
  console.error(`No user found for ${normalised} in ${path}`);
  db.close();
  process.exit(1);
}

const passwordHash = await hashPassword(password);
db.prepare("UPDATE users SET password_hash = ?, active = 1 WHERE id = ?").run(
  passwordHash,
  row.id,
);
db.close();

console.log(`Password updated for ${row.email} (id=${row.id}, role=${row.role}).`);
console.log("All existing sessions for this user are invalidated — sign in again.");
