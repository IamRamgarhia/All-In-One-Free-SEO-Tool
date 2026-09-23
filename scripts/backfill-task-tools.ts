/**
 * Give existing tasks the tool path they were always entitled to.
 *
 * tasks.tool_path is a new column, so every task created before it
 * existed has null and shows no button. On a real install that is the
 * entire backlog — 373 tasks here — and re-running the audit to get
 * buttons would be an absurd thing to ask.
 *
 * Two sources, both already in the row:
 *
 *   The plan generator wrote "Open: /tools/schema" into the description,
 *   which is exactly the path, just in the wrong field.
 *
 *   Audit tasks carry no finding type, but their titles come from a
 *   fixed blueprint table, so the title maps back to a type. That is a
 *   heuristic and it is applied conservatively: a title that does not
 *   clearly match one blueprint gets nothing rather than a guess.
 *
 *   pnpm exec tsx scripts/backfill-task-tools.ts [--apply]
 *
 * Dry by default. It reports what it would change and changes nothing
 * until told, because it writes to every task row in the database.
 */

import { eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { tasks } from "@/db/schema";
import { toolForFinding } from "@/lib/finding-tool-map";

const APPLY = process.argv.includes("--apply");

/**
 * Title fragments that identify a finding type, from the blueprint table
 * in audit-to-task.ts.
 *
 * Matched on a distinctive fragment rather than the whole string,
 * because titles gain an "(affects 12 pages)" suffix. Every fragment
 * here is specific enough to belong to one blueprint — "title" alone
 * would match four of them, so nothing that vague is listed.
 */
const TITLE_HINTS: [RegExp, string][] = [
  [/unreachable/i, "fetch_failed"],
  [/server error/i, "bad_status"],
  [/migrate site to https/i, "no_https"],
  [/add a <title>|add a title tag/i, "missing_title"],
  [/lengthen homepage title/i, "short_title"],
  [/shorten homepage title|trim the title/i, "long_title"],
  [/write a meta description/i, "missing_meta_description"],
  [/expand meta description/i, "short_meta_description"],
  [/trim the meta description|shorten.*meta description/i, "long_meta_description"],
  [/canonical/i, "missing_canonical"],
  [/noindex/i, "noindex_set"],
  [/robots\.txt/i, "missing_robots_txt"],
  [/sitemap/i, "missing_sitemap"],
  [/structured data|json-ld|schema/i, "missing_schema"],
  [/alt text/i, "missing_image_alt"],
  [/thin content|only \d+ words/i, "thin_content"],
  [/open graph/i, "missing_og_tags"],
  [/security header/i, "missing_security_headers"],
  [/broken link/i, "broken_link"],
  [/heading/i, "heading_order"],
  [/hreflang/i, "hreflang_not_reciprocal"],
  [/webp|avif|image format/i, "old_image_formats"],
  [/anchor text/i, "weak_anchor_text"],
];

function pathFromDescription(description: string | null): string | null {
  if (!description?.startsWith("Open: ")) return null;
  const p = description.slice("Open: ".length).trim();
  // Must look like an in-app route. Anything else is a description that
  // happens to start with the word.
  return p.startsWith("/") ? p : null;
}

function pathFromTitle(title: string): string | null {
  const hits = TITLE_HINTS.filter(([re]) => re.test(title));
  // Ambiguous is the same as unknown. Two blueprints matching means the
  // fragment was not distinctive enough, and a wrong button is worse
  // than none.
  if (hits.length !== 1) return null;
  return toolForFinding(hits[0][1]);
}

async function main() {
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
    })
    .from(tasks)
    .where(isNull(tasks.toolPath));

  let fromDesc = 0;
  let fromTitle = 0;
  const updates: { id: number; path: string; description: string | null }[] = [];

  for (const r of rows) {
    const viaDesc = pathFromDescription(r.description);
    if (viaDesc) {
      fromDesc++;
      // The description held nothing but the link, so it goes with it.
      updates.push({ id: r.id, path: viaDesc, description: null });
      continue;
    }
    const viaTitle = pathFromTitle(r.title);
    if (viaTitle) {
      fromTitle++;
      updates.push({ id: r.id, path: viaTitle, description: r.description });
    }
  }

  console.log(`${rows.length} tasks with no tool path`);
  console.log(`  ${fromDesc} recoverable from the description`);
  console.log(`  ${fromTitle} identifiable from the title`);
  console.log(`  ${rows.length - updates.length} left alone`);

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to write.");
    for (const u of updates.slice(0, 5)) console.log(`  #${u.id} → ${u.path}`);
    return;
  }

  for (const u of updates) {
    await db
      .update(tasks)
      .set({ toolPath: u.path, description: u.description })
      .where(eq(tasks.id, u.id));
  }
  console.log(`\nUpdated ${updates.length} tasks.`);
}

main().then(() => process.exit(0));
