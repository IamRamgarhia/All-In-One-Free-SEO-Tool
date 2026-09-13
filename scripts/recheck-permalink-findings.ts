/**
 * Re-check stored "default permalinks" findings against the live pages.
 *
 * The rule that made them matched any href containing /?p=, including
 * the <link rel='shortlink'> WordPress prints in the head of every post
 * and page, so it fired on sites whose URLs are already post-name — on a
 * real install, 14 pages of a site whose URLs look like /contact-us/,
 * each at high severity, with tasks telling the client to change their
 * permalink setting and redirect the old URLs. The rule is fixed. This
 * refetches each page a stored finding names and applies the fixed rule.
 *
 *   pnpm exec tsx scripts/recheck-permalink-findings.ts [--apply]
 *
 * Dry by default. A page the fixed rule no longer flags has its open
 * finding marked false_positive. Once a client has no open finding of
 * this type left, the tasks made from them are deleted if untouched:
 * still "todo", never edited, no logged time, no assignee, and no row in
 * another table pointing at them. A page that cannot be fetched is left
 * as it is. Other tasks that mention permalinks — a WordPress checklist
 * item, say — did not come from these findings and are only listed.
 */

import path from "node:path";
import Database from "better-sqlite3";
import { classifyTech, runTechSpecificChecks } from "@/lib/tech-audit-rules";

const APPLY = process.argv.includes("--apply");
const dbPath = process.env.SEO_DB_PATH || path.join(process.cwd(), "data.db");
const sqlite = new Database(dbPath);
sqlite.pragma("foreign_keys = ON");

const TYPE = "wp_default_permalinks";
/** The title findingsToTasks gave these before tasks were tagged. */
const OLD_UNTAGGED_TITLE = "[WordPress] Pages link to /?p=123 (default permalink)%";
const wordpress = classifyTech(["WordPress"]);

type Finding = { id: number; client_id: number; url: string | null };
type TaskRow = {
  id: number;
  client_id: number;
  title: string;
  status: string;
  created_at: number;
  updated_at: number;
  actual_minutes: number | null;
  assigned_user_id: number | null;
};

/** true: the fixed rule still flags the page. false: it does not. null: could not tell. */
async function stillFlagged(url: string): Promise<boolean | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; SeoToolBot/0.1; +https://localhost)" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    return runTechSpecificChecks({ url, html, headers: res.headers, tech: wordpress }).some(
      (f) => f.type === TYPE,
    );
  } catch {
    return null;
  }
}

/** Tables with a foreign key into tasks that hold a row for this task. */
function pointedAtBy(taskId: number): string[] {
  const tables = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all() as { name: string }[];
  const hits: string[] = [];
  for (const { name } of tables) {
    const keys = sqlite.prepare(`PRAGMA foreign_key_list("${name}")`).all() as {
      table: string;
      from: string;
    }[];
    for (const key of keys.filter((k) => k.table === "tasks")) {
      const { n } = sqlite
        .prepare(`SELECT count(*) AS n FROM "${name}" WHERE "${key.from}" = ?`)
        .get(taskId) as { n: number };
      if (n > 0) hits.push(`${name}.${key.from}`);
    }
  }
  return hits;
}

async function main() {
  console.log(`${APPLY ? "APPLYING" : "DRY RUN"} against ${dbPath}\n`);

  const findings = sqlite
    .prepare(
      `SELECT ai.id, a.client_id, ai.url
       FROM audit_issues ai JOIN audits a ON a.id = ai.audit_id
       WHERE ai.type = ? AND ai.status = 'new'`,
    )
    .all(TYPE) as Finding[];

  const urls = [...new Set(findings.map((f) => f.url).filter((u): u is string => Boolean(u)))];
  const verdict = new Map<string, boolean | null>();
  for (const url of urls) {
    const v = await stillFlagged(url);
    verdict.set(url, v);
    const label = v === false ? "no longer flagged" : v === true ? "still flagged    " : "could not fetch  ";
    console.log(`  ${label}  ${url}`);
  }

  const clear = findings.filter((f) => f.url !== null && verdict.get(f.url) === false);
  const remaining = findings.filter((f) => !clear.includes(f));
  console.log(`\n1. ${clear.length} of ${findings.length} open finding(s) → false_positive`);

  const clientsCleared = [...new Set(clear.map((f) => f.client_id))].filter(
    (c) => !remaining.some((r) => r.client_id === c),
  );
  const placeholders = clientsCleared.map(() => "?").join(",");
  const derived =
    clientsCleared.length === 0
      ? []
      : (sqlite
          .prepare(
            `SELECT id, client_id, title, status, created_at, updated_at, actual_minutes, assigned_user_id
             FROM tasks
             WHERE client_id IN (${placeholders})
               AND (source_ref IN ('audit:${TYPE}', 'agent:${TYPE}')
                    OR (source_ref IS NULL AND title LIKE ?))`,
          )
          .all(...clientsCleared, OLD_UNTAGGED_TITLE) as TaskRow[]);
  const untouched = derived.filter(
    (t) =>
      t.status === "todo" &&
      t.updated_at === t.created_at &&
      t.actual_minutes === null &&
      t.assigned_user_id === null &&
      pointedAtBy(t.id).length === 0,
  );
  console.log(`2. ${untouched.length} untouched task(s) made from them → deleted`);
  for (const t of untouched) console.log(`     #${t.id} ${t.title}`);
  for (const t of derived.filter((d) => !untouched.includes(d))) {
    console.log(`     left alone, someone has touched it: #${t.id} ${t.title}`);
  }

  const derivedIds = new Set(derived.map((t) => t.id));
  const others =
    clientsCleared.length === 0
      ? []
      : (sqlite
          .prepare(
            `SELECT id, client_id, title FROM tasks
             WHERE client_id IN (${placeholders}) AND status IN ('todo', 'in_progress')
               AND (title LIKE '%permalink%' OR description LIKE '%permalink%')`,
          )
          .all(...clientsCleared) as { id: number; client_id: number; title: string }[]).filter(
          (t) => !derivedIds.has(t.id),
        );
  console.log(`3. Not changed — permalink tasks that did not come from these findings:`);
  for (const t of others) console.log(`     #${t.id} (client ${t.client_id}) ${t.title}`);
  if (others.length === 0) console.log("     none");

  if (!APPLY) {
    console.log("\nDry run: nothing changed. Re-run with --apply.");
    return;
  }
  sqlite.transaction(() => {
    const mark = sqlite.prepare("UPDATE audit_issues SET status = 'false_positive' WHERE id = ?");
    for (const f of clear) mark.run(f.id);
    const remove = sqlite.prepare("DELETE FROM tasks WHERE id = ?");
    for (const t of untouched) remove.run(t.id);
  })();
  console.log("\nApplied.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => sqlite.close());
