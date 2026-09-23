/**
 * Write, verify, undo and re-verify the Open Graph fields on a live site.
 *
 * Verification reads the RENDERED page, not the API's own answer. That
 * distinction has caught two real bugs in this plugin already: alt text
 * written to the database and never to the page, and a canonical the
 * handler accepted and ignored while answering {ok:true}.
 *
 *   pnpm exec tsx scripts/og-roundtrip-check.ts [clientId] [postId]
 *
 * Writes to a live site. It restores everything it changes, and says so
 * if a restore fails.
 */

import {
  getClientWpCreds,
  setPostSeo,
  undoRevision,
} from "@/lib/wp-bridge";

const CLIENT = Number(process.argv[2] ?? 4);
const POST = Number(process.argv[3] ?? 10591);
const PAGE = "https://dicecodes.com/test/";

/** The social tags as a browser or a crawler would see them. */
async function rendered(): Promise<Record<string, string>> {
  const html = await (
    await fetch(PAGE, { cache: "no-store" as RequestCache })
  ).text();
  const out: Record<string, string> = {};
  // property= for Open Graph, name= for Twitter, and both orders of
  // attribute appear in the wild.
  for (const re of [
    /<meta[^>]+(?:property|name)=["'](og:[a-z:]+|twitter:[a-z:]+)["'][^>]+content=["']([^"']*)["']/gi,
    /<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["'](og:[a-z:]+|twitter:[a-z:]+)["']/gi,
  ]) {
    for (const m of html.matchAll(re)) {
      const [a, b] = [m[1], m[2]];
      const key = a.startsWith("og:") || a.startsWith("twitter:") ? a : b;
      const val = key === a ? b : a;
      if (!(key in out)) out[key] = val;
    }
  }
  return out;
}

function line(label: string, tags: Record<string, string>) {
  const keys = ["og:title", "twitter:title", "og:description"];
  console.log(
    `${label.padEnd(16)} ${keys.map((k) => `${k}=${JSON.stringify(tags[k] ?? null)}`).join("  ")}`,
  );
}

async function main() {
  const creds = await getClientWpCreds(CLIENT);
  if (!creds) {
    console.log("No WordPress credentials for that client.");
    return;
  }

  const before = await rendered();
  line("BEFORE", before);

  const stamp = `OG round-trip ${Date.now()}`;
  const wrote = await setPostSeo(creds, POST, {
    ogTitle: stamp,
    twitterTitle: stamp,
  });
  console.log("WRITE            ", JSON.stringify(wrote));

  if (!wrote.ok) {
    console.log("Write refused — nothing to undo.");
    return;
  }

  await new Promise((r) => setTimeout(r, 3000));
  const after = await rendered();
  line("AFTER", after);
  console.log(
    `  og:title landed       ${after["og:title"] === stamp}`,
    `\n  twitter:title landed  ${after["twitter:title"] === stamp}`,
  );

  // Undo through the revisions the plugin recorded, which is the whole
  // point of returning them. An undo that rewrites the old value instead
  // would overwrite anything changed in between.
  for (const c of wrote.changes ?? []) {
    const u = await undoRevision(creds, c.revId);
    console.log(`  undo ${c.field} rev ${c.revId}: ${JSON.stringify(u)}`);
  }

  await new Promise((r) => setTimeout(r, 3000));
  const back = await rendered();
  line("AFTER UNDO", back);

  const restored =
    (back["og:title"] ?? null) === (before["og:title"] ?? null) &&
    (back["twitter:title"] ?? null) === (before["twitter:title"] ?? null);
  console.log(`\n  restored exactly      ${restored}`);
  if (!restored) {
    console.log(
      "  LEFT CHANGED — the site does not match what it looked like before.",
    );
  }
}

main().then(() => process.exit(0));
