/**
 * Which SEO fields actually REACH the page on a given site?
 *
 * WHY: the bridge writes social tags into the meta keys Yoast, Rank
 * Math and All in One SEO read. On a site running none of those — a
 * custom theme that renders its own og: tags, SEOPress, The SEO
 * Framework, or tags hardcoded in a template — those rows are written,
 * a revision is recorded, the API returns {"ok":true}, and the page
 * never changes.
 *
 * Measured on a real site: og:title and twitter:title both reported
 * success and neither landed. The theme was `dicecodes` with no SEO
 * plugin installed at all.
 *
 * A write that reports success and changes nothing is the failure this
 * project treats as worse than a crash, because the agent then marks
 * the finding fixed and moves on.
 *
 * This writes a unique stamp into each field in turn, re-reads the
 * rendered page, and reports per field whether it landed — then undoes
 * every change through the recorded revisions.
 *
 *   pnpm exec tsx scripts/wp-field-coverage-check.ts [clientId] [postId]
 *
 * It EDITS A LIVE SITE and puts it back. Every change is undone through
 * the plugin's own revision log, and the final state is compared with
 * the first.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import {
  findPostIdByUrl,
  getClientWpCreds,
  getPostSeo,
  setPostSeo,
  undoRevision,
} from "@/lib/wp-bridge";

const CLIENT = Number(process.argv[2] ?? 4);
const POST_ARG = process.argv[3] ? Number(process.argv[3]) : null;

/** The fields worth checking, and how to find them in rendered HTML. */
const FIELDS = [
  {
    key: "title" as const,
    label: "<title>",
    find: (h: string) => h.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? null,
  },
  {
    key: "metaDescription" as const,
    label: "meta description",
    find: (h: string) =>
      h.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] ??
      h.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)?.[1] ??
      null,
  },
  {
    key: "ogTitle" as const,
    label: "og:title",
    find: (h: string) =>
      h.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i)?.[1] ??
      null,
  },
  {
    key: "ogDescription" as const,
    label: "og:description",
    find: (h: string) =>
      h.match(
        /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i,
      )?.[1] ?? null,
  },
  {
    key: "twitterTitle" as const,
    label: "twitter:title",
    find: (h: string) =>
      h.match(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']*)["']/i)?.[1] ??
      null,
  },
];

async function fetchPage(url: string): Promise<string> {
  // Cache-bust: a CDN or page cache serving the old HTML would read as
  // "the write did not land", which is a different diagnosis entirely.
  const u = new URL(url);
  u.searchParams.set("_stb", String(Date.now()));
  const res = await fetch(u.toString(), { cache: "no-store" as RequestCache });
  return res.text();
}

async function main() {
  const creds = await getClientWpCreds(CLIENT);
  if (!creds) {
    console.log("No WordPress credentials for that client.");
    return;
  }

  let post = POST_ARG;
  if (post === null) {
    const [row] = await db
      .select({ url: clients.url })
      .from(clients)
      .where(eq(clients.id, CLIENT));
    if (!row?.url) {
      console.log("That client has no URL and no post id was given.");
      return;
    }
    post = await findPostIdByUrl(creds, row.url);
    if (!post) {
      console.log(`Could not resolve ${row.url} to a post.`);
      return;
    }
  }

  const seo = await getPostSeo(creds, post);
  if (!seo.ok || !seo.seo.url) {
    console.log(`Could not read post ${post} back from the bridge.`);
    return;
  }
  const page = seo.seo.url;
  console.log(`\nPost ${post} — ${page}\n`);

  const originalHtml = await fetchPage(page);
  const original: Record<string, string | null> = {};
  for (const f of FIELDS) original[f.key] = f.find(originalHtml);

  const landed: { label: string; ok: boolean; saw: string | null }[] = [];
  const toUndo: { field: string; revId: number }[] = [];

  for (const f of FIELDS) {
    const stamp = `stb-${f.key}-${Date.now()}`;
    const wrote = await setPostSeo(creds, post, { [f.key]: stamp });
    if (!wrote.ok) {
      landed.push({ label: f.label, ok: false, saw: `write refused: ${wrote.error}` });
      continue;
    }
    for (const c of wrote.changes ?? []) toUndo.push({ field: c.field, revId: c.revId });

    // The page is server-rendered; give WordPress a moment.
    await new Promise((r) => setTimeout(r, 2500));
    const saw = FIELDS.find((x) => x.key === f.key)!.find(await fetchPage(page));
    landed.push({ label: f.label, ok: saw === stamp, saw });
  }

  // Undo everything, newest first, through the recorded revisions.
  for (const c of toUndo.reverse()) {
    await undoRevision(creds, c.revId).catch(() => null);
  }
  await new Promise((r) => setTimeout(r, 2500));

  const backHtml = await fetchPage(page);
  console.log("Which fields reach the rendered page:\n");
  for (const r of landed) {
    const mark = r.ok ? "\x1b[32mLANDS\x1b[0m" : "\x1b[31mNO-OP\x1b[0m";
    console.log(`  ${mark}  ${r.label}`);
    if (!r.ok) console.log(`          page still shows: ${String(r.saw).slice(0, 90)}`);
  }

  let restored = true;
  for (const f of FIELDS) {
    const now = f.find(backHtml);
    if (now !== original[f.key]) {
      restored = false;
      console.log(`\n  NOT RESTORED  ${f.label}\n    was: ${original[f.key]}\n    now: ${now}`);
    }
  }
  console.log(`\n  everything put back: ${restored}`);
  if (!restored) {
    console.log("  ^ check the site by hand before trusting the agent on it.");
  }

  const noops = landed.filter((r) => !r.ok).length;
  if (noops > 0) {
    console.log(
      `\n${noops} of ${landed.length} fields reported success and did not reach the page.`,
    );
    console.log(
      "On this site that means the theme or another plugin renders those tags,\n" +
        "so the bridge's values are stored and ignored. The agent must not treat\n" +
        "those as fixed.",
    );
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  },
);
