/**
 * Clean up what the pre-fix generators left in a real database.
 *
 * The code that produced these rows is fixed. The rows are still there,
 * and every page that reads tasks, audit findings or competitors keeps
 * showing them. Found on a real install:
 *
 *   - Audit findings on /cdn-cgi/l/email-protection — Cloudflare
 *     rewriting a mailto link, not a page — stored as "new" and
 *     "critical", and the tasks four generators made from them. Some
 *     carry the URL. Others carry only the finding's message, such as
 *     "Remove noindex from homepage robots meta", and are just as false:
 *     the only page that ever had that finding was the Cloudflare link.
 *   - The same audit task inserted once per audit run, because nothing
 *     tagged it.
 *   - A plan with the same image-format fix on consecutive days, copy
 *     telling a client a low-severity tidy-up capped their rankings, an
 *     unsourced promise to "double the traffic", and one content-brief
 *     job padded into three identical tasks.
 *   - Ten auto-suggested competitors, all wrong: US retailers for an
 *     Indian manufacturer, coupon sites for a web agency.
 *
 *   pnpm exec tsx scripts/cleanup-findings.ts [--apply]
 *
 * Dry by default: every step prints what it would change and changes
 * nothing. Nothing a person has touched is modified. A task counts as
 * untouched only while it is still "todo", has no logged time, no
 * assignee, and nothing in another table points at it.
 *
 * New wording is taken from the generator itself — the calendar,
 * summariseTopIssues, severityRationale, findingsToTasks — rather than
 * restated here, so this script cannot write a sentence the product no
 * longer uses. The old sentences are literals because they are exactly
 * what no longer exists anywhere else.
 *
 * Each step runs in its own transaction, so a failure leaves that step
 * unapplied rather than half-applied.
 */

import path from "node:path";
import Database from "better-sqlite3";
import type { AuditFinding } from "@/lib/audit";
import { findingsToTasks } from "@/lib/audit-to-task";
import { isInfrastructureUrl } from "@/lib/infrastructure-urls";
import {
  generateCalendar,
  severityRationale,
  summariseTopIssues,
} from "@/lib/seo-calendar";

const APPLY = process.argv.includes("--apply");
const dbPath = process.env.SEO_DB_PATH || path.join(process.cwd(), "data.db");
const sqlite = new Database(dbPath);
sqlite.pragma("foreign_keys = ON");

type TaskRow = {
  id: number;
  client_id: number;
  title: string;
  description: string | null;
  why_it_matters: string | null;
  priority: string;
  status: string;
  source: string | null;
  source_ref: string | null;
  actual_minutes: number | null;
  assigned_user_id: number | null;
};

type IssueRow = {
  client_id: number;
  audit_id: number;
  type: string;
  severity: string;
  message: string;
  url: string;
};

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function tablesWithColumn(column: string): string[] {
  const tables = sqlite
    .prepare(
      "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '__drizzle%'",
    )
    .all() as { name: string }[];
  return tables
    .map((t) => t.name)
    .filter((name) =>
      (sqlite.prepare(`pragma table_info("${name}")`).all() as { name: string }[]).some(
        (c) => c.name === column,
      ),
    );
}

/** Ids in `column` that some other table refers to. */
function referencedIds(column: string): Set<number> {
  const ids = new Set<number>();
  for (const table of tablesWithColumn(column)) {
    for (const row of sqlite
      .prepare(`select distinct "${column}" as id from "${table}" where "${column}" is not null`)
      .all() as { id: number }[]) {
      ids.add(row.id);
    }
  }
  return ids;
}

const taskIdsReferenced = referencedIds("task_id");

function untouched(t: TaskRow): boolean {
  return (
    t.status === "todo" &&
    t.actual_minutes == null &&
    t.assigned_user_id == null &&
    !taskIdsReferenced.has(t.id)
  );
}

/** URLs and site paths mentioned in a piece of text. */
function locationsIn(text: string | null): string[] {
  if (!text) return [];
  return [...text.matchAll(/https?:\/\/[^\s)"'<>]+|(?<![\w/.])\/[\w\-.~%/]+/g)].map((m) =>
    m[0].replace(/[.,;:]+$/, ""),
  );
}

function isInfraLocation(loc: string): boolean {
  return isInfrastructureUrl(loc.startsWith("/") ? `https://placeholder.invalid${loc}` : loc);
}

function priorityFor(severity: string): string {
  return severity === "critical" || severity === "high"
    ? "high"
    : severity === "low"
      ? "low"
      : "medium";
}

let changedSteps = 0;
function step(name: string, lines: string[], apply: () => void) {
  console.log(`\n== ${name}: ${lines.length}`);
  for (const l of lines.slice(0, 8)) console.log(`   ${l}`);
  if (lines.length > 8) console.log(`   … and ${lines.length - 8} more`);
  if (lines.length > 0) changedSteps++;
  if (APPLY && lines.length > 0) {
    sqlite.transaction(apply)();
    console.log("   applied");
  }
}

const deleteTaskStmt = sqlite.prepare("delete from tasks where id = ?");
function deleteTasks(ids: number[]) {
  for (const id of ids) deleteTaskStmt.run(id);
}

// ---------------------------------------------------------------------
// The current wording, read from the generator
// ---------------------------------------------------------------------

const reference = generateCalendar({
  clientId: 0,
  clientName: "reference",
  niche: null,
  techStack: [],
  country: "US",
  city: null,
  hasGsc: false,
  hasGbp: false,
  quickWins: [],
  topIssues: [],
});
function fromGenerator(match: (title: string) => boolean, label: string) {
  const t = reference.find((x) => match(x.title));
  if (!t) {
    throw new Error(
      `The calendar no longer produces the ${label} task, so this script does not know what to replace old copy with. Update it before running.`,
    );
  }
  return t;
}
const NEW_FALLBACK = fromGenerator((t) => t === "Audit + fix all broken meta titles", "fallback").whyItMatters;
const NEW_STRIKING = fromGenerator((t) => t.startsWith("Run keyword research"), "keyword research").whyItMatters;
const NEW_BRIEF = fromGenerator((t) => t.startsWith("Write 3 content briefs"), "content brief");

const OLD_CAP =
  /^Severity (critical|high|medium|low)\. Open issues at this level cap how much downstream work can move rankings\.$/;
const OLD_FALLBACK =
  "Quick technical wins compound — fixing these baseline issues makes every later content win 10-20% bigger.";
const OLD_STRIKING =
  "Striking-distance keywords are the highest-ROI move in SEO. Push 5 of them onto page 1 = double the traffic for one weeks' work.";
const OLD_BRIEF_TITLE = /^Write content brief #\d+ for top quick-win keyword$/;

/** Exact titles the audit blueprint used before it named the right page. */
const OLD_BLUEPRINT: Record<string, string> = {
  "Investigate why your site is unreachable": "fetch_failed",
  "Fix server error on homepage": "bad_status",
  "Migrate site to HTTPS": "no_https",
  "Add a <title> tag to your homepage": "missing_title",
  "Lengthen homepage title to 50–60 characters": "short_title",
  "Shorten homepage title to under 60 characters": "long_title",
  "Write a meta description for your homepage": "missing_meta_description",
  "Expand meta description to 120–155 characters": "short_meta_description",
  "Shorten meta description to under 160 characters": "long_meta_description",
  "Add a clear <h1> heading to your homepage": "missing_h1",
  "Add a canonical link to your homepage": "missing_canonical",
  "Add a viewport meta tag for mobile": "missing_viewport",
  "Remove noindex from homepage robots meta": "noindex_set",
  "Add a lang attribute to <html>": "missing_lang",
  "Add a favicon": "missing_favicon",
  "Add OpenGraph tags for social sharing": "missing_og_tags",
  "Add alt text to images missing it": "missing_image_alt",
};

// ---------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------

console.log(`Database: ${dbPath}`);
console.log(APPLY ? "Mode: APPLY" : "Mode: dry run (nothing will change)");

const allIssues = sqlite
  .prepare(
    "select a.client_id as client_id, a.id as audit_id, i.type as type, i.severity as severity, i.message as message, i.url as url from audit_issues i join audits a on a.id = i.audit_id",
  )
  .all() as IssueRow[];
const latestAudit = new Map(
  (
    sqlite
      .prepare("select client_id, max(id) as id from audits where status = 'completed' group by client_id")
      .all() as { client_id: number; id: number }[]
  ).map((r) => [r.client_id, r.id]),
);

const allTasks = sqlite
  .prepare(
    "select id, client_id, title, description, why_it_matters, priority, status, source, source_ref, actual_minutes, assigned_user_id from tasks",
  )
  .all() as TaskRow[];
const removed = new Set<number>();
const rewritten = new Set<number>();
const live = () => allTasks.filter((t) => !removed.has(t.id));

// ---------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------

// 1. Audit findings on infrastructure URLs.
const newInfraIssues = (
  sqlite.prepare("select id, type, url from audit_issues where status = 'new'").all() as {
    id: number;
    type: string;
    url: string;
  }[]
).filter((i) => isInfrastructureUrl(i.url));
step(
  "Audit findings on infrastructure URLs -> marked false_positive",
  newInfraIssues.map((i) => `#${i.id} ${i.type} ${i.url}`),
  () => {
    const s = sqlite.prepare("update audit_issues set status = 'false_positive' where id = ?");
    for (const i of newInfraIssues) s.run(i.id);
  },
);

// 2. Tasks that name only infrastructure URLs.
const infraTasks = live().filter((t) => {
  if (!untouched(t)) return false;
  const locs = [...locationsIn(t.title), ...locationsIn(t.description)];
  // Every place it mentions must be plumbing. A task that also names a
  // real page is real work and stays.
  return locs.length > 0 && locs.every(isInfraLocation);
});
step(
  "Tasks naming only infrastructure URLs -> deleted",
  infraTasks.map((t) => `#${t.id} [client ${t.client_id}] ${t.title}`),
  () => deleteTasks(infraTasks.map((t) => t.id)),
);
for (const t of infraTasks) removed.add(t.id);

// 3. Old audit tasks whose finding only ever existed on an
// infrastructure URL. The old generator put the finding's message in the
// description and no URL, so rule 2 cannot see them; the message can.
// A message also found on a real page means real work, and it stays.
const messageStats = new Map<string, { infra: number; real: number }>();
for (const r of allIssues) {
  const k = `${r.client_id}::${r.message.trim()}`;
  const s = messageStats.get(k) ?? { infra: 0, real: 0 };
  if (isInfrastructureUrl(r.url)) s.infra++;
  else s.real++;
  messageStats.set(k, s);
}
const phantomAuditTasks = live().filter((t) => {
  if (!untouched(t) || t.source !== null || t.source_ref !== null || !t.description) return false;
  const s = messageStats.get(`${t.client_id}::${t.description.trim()}`);
  return Boolean(s && s.real === 0 && s.infra > 0);
});
step(
  "Audit tasks whose finding was only ever on an infrastructure URL -> deleted",
  phantomAuditTasks.map((t) => `#${t.id} [client ${t.client_id}] ${t.title}`),
  () => deleteTasks(phantomAuditTasks.map((t) => t.id)),
);
for (const t of phantomAuditTasks) removed.add(t.id);

// 4 and 5. Competitors from the old suggester, and monitor tasks about them.
const junkCompetitors = sqlite
  .prepare(
    "select id, client_id, name, url from competitors where notes like 'Auto-suggested from SERP overlap%'",
  )
  .all() as { id: number; client_id: number; name: string; url: string }[];
const junkIds = new Set(junkCompetitors.map((c) => c.id));
const monitorTasks = live().filter((t) => {
  if (t.source !== "competitor_monitor" || !untouched(t)) return false;
  const id = Number(t.source_ref?.match(/^comp-(\d+)-/)?.[1]);
  return junkIds.has(id);
});
step(
  "Monitor tasks about wrongly suggested competitors -> deleted",
  monitorTasks.map((t) => `#${t.id} [client ${t.client_id}] ${t.title.slice(0, 90)}`),
  () => deleteTasks(monitorTasks.map((t) => t.id)),
);
for (const t of monitorTasks) removed.add(t.id);

const competitorChildren = tablesWithColumn("competitor_id");
step(
  "Wrongly suggested competitors -> deleted",
  junkCompetitors.map((c) => `#${c.id} [client ${c.client_id}] ${c.name} (${c.url})`),
  () => {
    for (const table of competitorChildren) {
      const s = sqlite.prepare(`delete from "${table}" where competitor_id = ?`);
      for (const c of junkCompetitors) s.run(c.id);
    }
    const s = sqlite.prepare("delete from competitors where id = ?");
    for (const c of junkCompetitors) s.run(c.id);
  },
);

// 6. The plan's "Fix:" tasks: one per finding type, titled by the
// current generator. The old calendar took audit rows one per page, so
// "Fix: 10 images use legacy formats" and "Fix: 15 images use legacy
// formats" sat on consecutive days as separate tasks for one finding.
// Only titles that are exactly an audit message are touched; anything
// else is not ours to reinterpret.
const typeByMessage = new Map<string, string>();
for (const r of allIssues) typeByMessage.set(`${r.client_id}::${r.message.trim()}`, r.type);
const fixGroups = new Map<string, TaskRow[]>();
for (const t of live()) {
  if (t.source !== "auto_calendar" || !untouched(t) || !t.title.startsWith("Fix: ")) continue;
  const type = typeByMessage.get(`${t.client_id}::${t.title.slice("Fix: ".length).trim()}`);
  if (!type) continue;
  const k = `${t.client_id}::${type}`;
  fixGroups.set(k, [...(fixGroups.get(k) ?? []), t]);
}
type FixPlan = {
  keep: TaskRow | null;
  drop: TaskRow[];
  title?: string;
  why?: string;
  priority?: string;
  lines: string[];
};
const fixPlans: FixPlan[] = [];
for (const [k, group] of fixGroups) {
  const sep = k.indexOf("::");
  const clientId = Number(k.slice(0, sep));
  const type = k.slice(sep + 2);
  const auditId = latestAudit.get(clientId);
  const rows = allIssues.filter((r) => r.audit_id === auditId && r.type === type);
  const real = rows.filter((r) => !isInfrastructureUrl(r.url));
  const sorted = [...group].sort((a, b) => a.id - b.id);

  if (real.length === 0) {
    // Found in the latest audit only on plumbing: false work. Not in the
    // latest audit at all: not this script's call, so left alone.
    if (rows.length === 0) continue;
    fixPlans.push({
      keep: null,
      drop: sorted,
      lines: sorted.map((t) => `#${t.id} deleted: "${t.title.slice(0, 60)}" was only found on an infrastructure URL`),
    });
    continue;
  }

  const [summary] = summariseTopIssues(real, 1);
  const title = `Fix: ${summary.title}`;
  const [keep, ...drop] = sorted;
  const unchanged = drop.length === 0 && keep.title === title;
  if (unchanged) continue;
  fixPlans.push({
    keep,
    drop,
    title,
    why: severityRationale(summary.severity),
    priority: priorityFor(summary.severity),
    lines: [
      `#${keep.id} "${keep.title.slice(0, 60)}" -> "${title}"`,
      ...drop.map((t) => `#${t.id} merged into #${keep.id}`),
    ],
  });
}
step(
  "Plan fix tasks -> one per finding type, worded by the current generator",
  fixPlans.flatMap((p) => p.lines),
  () => {
    const upd = sqlite.prepare("update tasks set title = ?, why_it_matters = ?, priority = ? where id = ?");
    for (const p of fixPlans) {
      if (p.keep && p.title) upd.run(p.title, p.why, p.priority, p.keep.id);
      deleteTasks(p.drop.map((t) => t.id));
    }
  },
);
for (const p of fixPlans) {
  for (const t of p.drop) removed.add(t.id);
  if (p.keep) rewritten.add(p.keep.id);
}

// 7. Duplicate tasks outside the plan.
//
// Two kinds. Identical titles; and old audit tasks for one finding type
// whose titles differ only in "(affects N pages)", because every audit
// run counted again. Keep a task somebody touched if there is one,
// otherwise the newest, which reflects the latest audit. Plan tasks are
// handled above: a recurring plan task on two dates is deliberate.
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[\s.]+$/, "").trim();
function auditTypeOf(t: TaskRow): string | null {
  if (t.source_ref?.startsWith("audit:")) return t.source_ref.slice("audit:".length);
  if (t.source !== null || t.source_ref !== null) return null;
  return OLD_BLUEPRINT[t.title.replace(/ \(affects \d+ pages\)$/, "")] ?? null;
}
const groups = new Map<string, TaskRow[]>();
for (const t of live()) {
  if (t.source === "auto_calendar") continue;
  const type = auditTypeOf(t);
  const k = type ? `${t.client_id}::audit:${type}` : `${t.client_id}::${norm(t.title)}`;
  groups.set(k, [...(groups.get(k) ?? []), t]);
}
const duplicates: TaskRow[] = [];
for (const g of groups.values()) {
  if (g.length < 2) continue;
  // Touched first, then newest.
  const [, ...rest] = [...g].sort(
    (a, b) => Number(untouched(a)) - Number(untouched(b)) || b.id - a.id,
  );
  duplicates.push(...rest.filter(untouched));
}
step(
  "Duplicate tasks -> deleted, keeping one",
  duplicates.map((t) => `#${t.id} [client ${t.client_id}] ${t.title.slice(0, 90)}`),
  () => deleteTasks(duplicates.map((t) => t.id)),
);
for (const t of duplicates) removed.add(t.id);

// 8. Content-brief padding: three identical tasks become the one job.
const briefGroups = new Map<number, TaskRow[]>();
for (const t of live()) {
  if (t.source === "auto_calendar" && untouched(t) && OLD_BRIEF_TITLE.test(t.title)) {
    briefGroups.set(t.client_id, [...(briefGroups.get(t.client_id) ?? []), t]);
  }
}
const briefKeep: TaskRow[] = [];
const briefDrop: TaskRow[] = [];
for (const g of briefGroups.values()) {
  const [keep, ...rest] = [...g].sort((a, b) => a.id - b.id);
  briefKeep.push(keep);
  briefDrop.push(...rest);
}
step(
  "Padded content-brief tasks -> merged into one per client",
  [
    ...briefKeep.map((t) => `#${t.id} kept and renamed "${NEW_BRIEF.title}"`),
    ...briefDrop.map((t) => `#${t.id} deleted`),
  ],
  () => {
    const s = sqlite.prepare(
      "update tasks set title = ?, why_it_matters = ?, estimated_minutes = ? where id = ?",
    );
    for (const t of briefKeep) s.run(NEW_BRIEF.title, NEW_BRIEF.whyItMatters, NEW_BRIEF.estimatedMinutes, t.id);
    deleteTasks(briefDrop.map((t) => t.id));
  },
);
for (const t of briefDrop) removed.add(t.id);
for (const t of briefKeep) rewritten.add(t.id);

// 9. Plan copy that overstated or invented.
type CopyFix = { id: number; why: string; priority?: string; line: string };
const copyFixes: CopyFix[] = [];
for (const t of live()) {
  if (t.source !== "auto_calendar" || !untouched(t) || rewritten.has(t.id) || !t.why_it_matters) continue;
  const cap = t.why_it_matters.match(OLD_CAP);
  if (cap) {
    const sev = cap[1];
    copyFixes.push({
      id: t.id,
      why: severityRationale(sev),
      priority: priorityFor(sev),
      line: `#${t.id} severity ${sev}: "cap … rankings" -> honest rationale`,
    });
  } else if (t.why_it_matters === OLD_FALLBACK) {
    copyFixes.push({ id: t.id, why: NEW_FALLBACK, line: `#${t.id} removed unsourced "10-20% bigger"` });
  } else if (t.why_it_matters === OLD_STRIKING) {
    copyFixes.push({ id: t.id, why: NEW_STRIKING, line: `#${t.id} removed unsourced "double the traffic"` });
  }
}
step(
  "Plan explanations that overstated or invented -> rewritten",
  copyFixes.map((c) => c.line),
  () => {
    const withPriority = sqlite.prepare("update tasks set why_it_matters = ?, priority = ? where id = ?");
    const copyOnly = sqlite.prepare("update tasks set why_it_matters = ? where id = ?");
    for (const c of copyFixes) {
      if (c.priority) withPriority.run(c.why, c.priority, c.id);
      else copyOnly.run(c.why, c.id);
    }
  },
);

// 10. Old audit tasks: tag them so the next audit does not add a second
// copy under the new title, and rename the ones that claimed the
// homepage for a finding on another page.
type BlueprintFix = { id: number; ref: string; title: string | null; line: string };
const blueprintFixes: BlueprintFix[] = [];
for (const t of live()) {
  if (t.source !== null || t.source_ref !== null) continue;
  const m = t.title.match(/^(.*?)(?: \(affects (\d+) pages\))?$/);
  const type = m ? OLD_BLUEPRINT[m[1]] : undefined;
  if (!type || !m) continue;

  let title: string | null = null;
  if (untouched(t)) {
    const pages = m[2] ? Number(m[2]) : 1;
    const urls = [...new Set(locationsIn(t.description).filter((l) => /^https?:/.test(l)))];
    const where =
      pages > 1
        ? Array.from({ length: pages }, (_, i) => `https://placeholder.invalid/page-${i}`)
        : urls.length === 1
          ? urls
          : [];
    if (where.length > 0) {
      const [generated] = findingsToTasks(
        where.map((url) => ({ type, url, severity: "high", message: "" }) as AuditFinding),
      );
      if (generated && generated.title !== t.title) title = generated.title;
    }
  }
  blueprintFixes.push({
    id: t.id,
    ref: `audit:${type}`,
    title,
    line:
      `#${t.id} [client ${t.client_id}] tagged audit:${type}` +
      (title ? `, renamed "${t.title}" -> "${title}"` : ""),
  });
}
step(
  "Old audit tasks -> tagged, and renamed where they named the wrong page",
  blueprintFixes.map((b) => b.line),
  () => {
    const tagOnly = sqlite.prepare("update tasks set source_ref = ? where id = ?");
    const tagAndRename = sqlite.prepare("update tasks set source_ref = ?, title = ? where id = ?");
    for (const b of blueprintFixes) {
      if (b.title) tagAndRename.run(b.ref, b.title, b.id);
      else tagOnly.run(b.ref, b.id);
    }
  },
);

const deletedCount = removed.size;
console.log(
  `\n${changedSteps} step${changedSteps === 1 ? "" : "s"} with changes; ${deletedCount} task${deletedCount === 1 ? "" : "s"} deleted of ${allTasks.length}.` +
    (APPLY ? " Applied." : " Dry run — re-run with --apply to write."),
);
sqlite.close();
