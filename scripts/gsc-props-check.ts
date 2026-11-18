/**
 * Which Search Console properties can the connected Google account
 * actually see, and does each client's stored gsc_property match one?
 *
 * Written while regression-testing the MCP surface: four Search Console
 * tools came back 403 "User does not have sufficient permission for site
 * 'https://dicecodes.com/'". A 403 rather than a 401 means the token
 * works and the property string does not — which is what happens when a
 * site is verified in Search Console as a DOMAIN property
 * ("sc-domain:example.com") and the app asks for the URL-prefix form
 * ("https://example.com/"). Google has recommended domain properties
 * since 2019, so this is the common case, not the edge one.
 *
 *   npx tsx scripts/gsc-props-check.ts
 */

import { listGscProperties } from "../src/lib/google-oauth";
import { db } from "../src/db/client";
import { clients } from "../src/db/schema";

async function main() {
  let properties;
  try {
    properties = await listGscProperties();
  } catch (err) {
    console.log(`Could not list properties: ${(err as Error).message}`);
    console.log("Search Console is probably not connected at all.");
    return;
  }

  console.log(`\nProperties this Google account can see: ${properties.length}`);
  for (const p of properties) {
    console.log(`   ${p.permissionLevel.padEnd(18)} ${p.siteUrl}`);
  }

  const rows = await db
    .select({ id: clients.id, name: clients.name, url: clients.url, gsc: clients.gscProperty })
    .from(clients);

  console.log(`\nClients and the property each one asks Google for:`);
  const known = new Set(properties.map((p) => p.siteUrl));
  let mismatched = 0;
  for (const c of rows) {
    if (!c.gsc) {
      console.log(`   -        ${c.name} — no property set`);
      continue;
    }
    const ok = known.has(c.gsc);
    if (!ok) mismatched++;
    console.log(`   ${ok ? "MATCH   " : "MISMATCH"} ${c.name} -> ${c.gsc}`);
    if (!ok) {
      // Offer the property that almost certainly was meant.
      let host = c.gsc;
      try {
        host = new URL(c.gsc).hostname;
      } catch {
        host = c.gsc.replace(/^sc-domain:/, "");
      }
      const bare = host.replace(/^www\./, "");
      const suggestion = properties.find(
        (p) =>
          p.siteUrl === `sc-domain:${bare}` ||
          p.siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/^www\./, "") === bare,
      );
      console.log(
        suggestion
          ? `            should be: ${suggestion.siteUrl}`
          : `            no property for ${bare} in this account`,
      );
    }
  }

  console.log(
    mismatched === 0
      ? "\nEvery client points at a property this account holds."
      : `\n${mismatched} client(s) point at a property this account cannot read. ` +
          `Every Search Console feature returns 403 for them.`,
  );
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
