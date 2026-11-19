/**
 * Connect a client's WordPress bridge from the command line.
 *
 * WHY THIS EXISTS: the plugin's own admin page says "Paste this into
 * SEO Tool → Settings → CMS connections", and there is no such page —
 * the fields live on the client page's Site tab. A maintainer who has
 * just installed the plugin and cannot find where it goes needs a way
 * through that does not depend on finding the right tab.
 *
 * Uses the same path as the UI: ping first and refuse to store a key
 * that does not work, encrypt at rest, log the activity.
 *
 *   pnpm exec tsx scripts/save-wp-creds.ts <creds.json> [--dry-run]
 *
 * creds.json: { "clientId": 4, "endpoint": "https://site/", "key": "…" }
 *
 * The key is read from a file so it never appears in a command line, a
 * shell history or a process listing, and this script never prints it.
 * `--dry-run` only pings, so a key can be checked before anything is
 * written.
 */
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { pingWpBridge } from "@/lib/wp-bridge";
import { encrypt } from "@/lib/crypto";
import { logActivity } from "@/lib/activity";

async function main() {
  const file = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");
  if (!file) {
    console.error("usage: tsx scripts/save-wp-creds.ts <creds.json> [--dry-run]");
    process.exit(1);
  }

  const creds = JSON.parse(readFileSync(file, "utf8")) as {
    clientId: number;
    endpoint: string;
    key: string;
  };

  // Same normalisation as the server action, so a pasted site URL, a
  // pasted /wp-json URL and the full endpoint all land in one place.
  let endpoint = creds.endpoint.replace(/\/+$/, "");
  if (!endpoint.match(/\/wp-json\/seo-tool\/v1$/)) {
    endpoint = endpoint.match(/\/wp-json\/?$/)
      ? endpoint.replace(/\/?$/, "/seo-tool/v1")
      : `${endpoint}/wp-json/seo-tool/v1`;
  }

  console.log(`Pinging ${endpoint} …`);
  const ping = await pingWpBridge({ endpoint, key: creds.key });
  if (!ping.ok) {
    console.error(`\nREFUSED — ${ping.error ?? "unknown error"}`);
    console.error("Nothing was saved.\n");
    process.exit(1);
  }
  console.log(`  the plugin answered${ping.version ? ` — version ${ping.version}` : ""}`);

  if (dryRun) {
    console.log("\n--dry-run: the key works. Nothing was written.\n");
    process.exit(0);
  }

  await db
    .update(clients)
    .set({
      wpEndpoint: endpoint,
      wpKey: encrypt(creds.key),
      updatedAt: new Date(),
    })
    .where(eq(clients.id, creds.clientId));

  await logActivity({
    kind: "client.created",
    message: "Connected WordPress bridge.",
    clientId: creds.clientId,
  }).catch(() => {
    // Bookkeeping must not fail a connection that worked.
  });

  const [row] = await db
    .select({
      id: clients.id,
      name: clients.name,
      ep: clients.wpEndpoint,
      k: clients.wpKey,
    })
    .from(clients)
    .where(eq(clients.id, creds.clientId));

  console.log(`\nSaved for client ${row.id} (${row.name})`);
  console.log(`  endpoint: ${row.ep}`);
  // By length only — never the value.
  console.log(`  key:      ${row.k ? `stored, encrypted (${row.k.length} chars)` : "MISSING"}\n`);

}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  },
);
