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
  findPostIdByUrl,
  getClientWpCreds,
  getPostSeo,
  setPostSeo,
  undoRevision,
} from "@/lib/wp-bridge";

const CLIENT = Number(process.argv[2] ?? 4);
/**
 * Which post, and which page to read the tags back from.
 *
 * Both used to be hardcoded — post 10591 and
 * https://dicecodes.com/test/ — and INDEPENDENTLY, so the script
 * accepted a post id argument while still verifying a fixed, unrelated
 * URL. Point it at any other post and it would write to one page and
 * check another, then report that the tags did not land.
 *
 * Neither default existed on the site any more, so the run failed at
 * the write with "Post not found" and never reached the mismatch.
 *
 * The page is now the post's OWN permalink, read back from the bridge,
 * so the two cannot disagree. With no post id given it uses the
 * client's home page — which is the page most worth checking and, until
 * the plugin's front-page fix, the one page this could never resolve.
 */
const POST_ARG = process.argv[3] ? Number(process.argv[3]) : null;

/**
 * The social tags as a browser or a crawler would see them.
 *
 * CACHE-BUSTED with a query parameter, which is not decoration.
 * `cache: "no-store"` only tells THIS client not to cache — a CDN in
 * front of the site serves whatever it already has regardless. Measured
 * on a site behind Hostinger's CDN: without the parameter this reported
 * "og:title landed false" for a write that had landed perfectly, and
 * the obvious reading of that was "the write silently did nothing" —
 * the exact conclusion this script exists to support, reached for the
 * wrong reason.
 */
async function rendered(page: string): Promise<Record<string, string>> {
  const u = new URL(page);
  u.searchParams.set("_stb", String(Date.now()));
  const html = await (
    await fetch(u.toString(), { cache: "no-store" as RequestCache })
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

  // Resolve the post and its permalink together, so the page we read
  // back is always the page we wrote to.
  let post = POST_ARG;
  if (post === null) {
    const [{ clients }, { db }, { eq }] = await Promise.all([
      import("@/db/schema"),
      import("@/db/client"),
      import("drizzle-orm"),
    ]);
    const [row] = await db
      .select({ url: clients.url })
      .from(clients)
      .where(eq(clients.id, CLIENT));
    if (!row?.url) {
      console.log("That client has no URL, and no post id was given.");
      return;
    }
    post = await findPostIdByUrl(creds, row.url);
    if (!post) {
      console.log(
        `Could not resolve ${row.url} to a post. If this is the home page ` +
          `and the site uses a static front page, the plugin needs 0.6.2 ` +
          `or newer — older versions could not resolve it at all.`,
      );
      return;
    }
    console.log(`Resolved ${row.url} -> post ${post}`);
  }

  const seo = await getPostSeo(creds, post);
  // `url` on PostSeo is the WordPress permalink, mapped from the
  // wire's `permalink`.
  const PAGE = seo.ok && seo.seo.url ? seo.seo.url : null;
  if (!PAGE) {
    console.log(`Could not read post ${post} back from the bridge.`);
    return;
  }
  console.log(`Checking ${PAGE}\n`);

  const before = await rendered(PAGE);
  line("BEFORE", before);

  const stamp = `OG round-trip ${Date.now()}`;
  const wrote = await setPostSeo(creds, post, {
    ogTitle: stamp,
    twitterTitle: stamp,
  });
  console.log("WRITE            ", JSON.stringify(wrote));

  if (!wrote.ok) {
    console.log("Write refused — nothing to undo.");
    return;
  }

  await new Promise((r) => setTimeout(r, 3000));
  const after = await rendered(PAGE);
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
  const back = await rendered(PAGE);
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
