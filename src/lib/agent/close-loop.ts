/**
 * The step that was missing: after a fix is applied, prove it on the
 * live page, close the finding, and close the task.
 *
 * Ported from the original project (155d48f, then 9702570 for the manual
 * path) and adapted to this fork: the finding types an action may close
 * come from the planner's own FIXABLE table rather than a second list,
 * only page-level checks can be confirmed, and every sentence is written
 * in the workspace language.
 *
 * THE DISTINCTION THIS MODULE EXISTS FOR
 *
 * `executeAction` already reads the field back out of the CMS and marks
 * the action `verified`. That proves the CMS stored the value. It does
 * NOT prove a crawler sees it: a full-page cache, a CDN, a theme
 * override or an SEO plugin templating the title will all keep serving
 * the old one.
 *
 * So resolving the finding on the CMS read-back alone would be the worst
 * class of bug here: the score improves, the task closes, the report
 * says fixed, and Google still sees the old title. Nothing throws.
 * Instead the finding is resolved only once `recheckUrl` agrees that the
 * problem is gone from the live HTML, and when the live page still
 * disagrees that is recorded in plain words rather than retried
 * silently.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { agentActions, auditIssues, audits, tasks } from "@/db/schema";
import { isPageRecheckable, isTechPageCheck, recheckUrl, type RecheckResult } from "@/lib/audit";
import type { AuditFindingType } from "@/lib/audit-finding-types";
import { logActivity } from "@/lib/activity";
import { getReportLocale } from "@/lib/report-i18n";
import { FIXABLE } from "./planner";

export type LoopOutcome = {
  actionId: number;
  /** The audit issue this action came from, when it came from one. */
  issueId: number | null;
  /**
   * What happened, as a state rather than a boolean — "not resolved" has
   * three genuinely different causes and collapsing them is how a user
   * ends up unable to tell a cache from a failure.
   */
  result:
    | "resolved"
    | "still_present"
    | "unreachable"
    | "no_issue_linked"
    | "not_applied";
  /** One line for the activity log and the run summary. */
  note: string;
};

/**
 * Action kind → the finding types it may close.
 *
 * Read off the planner's FIXABLE table (one entry per finding type, so a
 * type can never be claimed by two kinds), keeping only the types the
 * live page can confirm on its own. A cross-page finding such as
 * `duplicate_title` is left out: re-fetching one page never produces it,
 * so it would always look "gone" and resolve on no evidence.
 *
 * Exported so close-loop.test.ts checks the real value.
 */
export const ISSUE_TYPES_FOR_KIND: Record<string, AuditFindingType[]> = (() => {
  const out: Record<string, AuditFindingType[]> = {};
  for (const [type, spec] of Object.entries(FIXABLE)) {
    if (!isPageRecheckable(type)) continue;
    (out[spec.kind] ??= []).push(type as AuditFindingType);
  }
  return out;
})();

/**
 * guardedFetch refuses private addresses, which is right for a URL a
 * stranger pasted into the public grader and wrong for a page on the
 * client's own site that this tool just crawled. The same documented
 * opt-in as the executor's read-back, deliberately not a second switch.
 */
function allowPrivateHosts(): boolean {
  return process.env.SEO_ALLOW_PRIVATE_WP_ENDPOINT === "1";
}

async function isFrench(): Promise<boolean> {
  return (await getReportLocale().catch(() => "en")) === "fr";
}

/**
 * Close the loop for one applied action.
 *
 * Safe to call more than once: an issue already `resolved` is left
 * alone, so a re-run of a run does not double-log.
 */
export async function closeLoopForAction(actionId: number): Promise<LoopOutcome> {
  const fr = await isFrench();
  const [action] = await db
    .select()
    .from(agentActions)
    .where(eq(agentActions.id, actionId))
    .limit(1);

  if (!action) {
    return {
      actionId,
      issueId: null,
      result: "not_applied",
      note: fr ? "Action introuvable." : "No such action.",
    };
  }

  // Only a change that reached the site can have fixed anything. A
  // queued action has not been applied, and resolving its finding would
  // be a straight falsehood.
  if (action.status !== "verified" && action.status !== "applied") {
    return {
      actionId,
      issueId: null,
      result: "not_applied",
      note: fr
        ? `L’action est au statut « ${action.status} » : rien à confirmer pour l’instant.`
        : `Action is ${action.status}, so there is nothing to confirm yet.`,
    };
  }

  const issueId = await findIssueForAction(action);
  if (!issueId) {
    return {
      actionId,
      issueId: null,
      result: "no_issue_linked",
      note: fr
        ? "Appliquée, mais rattachée à aucun constat d’audit : rien à clore."
        : "Applied, but not traceable to an audit finding, so nothing to close.",
    };
  }

  const [issue] = await db
    .select()
    .from(auditIssues)
    .where(eq(auditIssues.id, issueId))
    .limit(1);

  if (!issue) {
    return {
      actionId,
      issueId,
      result: "no_issue_linked",
      note: fr
        ? "Le constat d’audit d’origine n’existe plus."
        : "The audit finding this came from no longer exists.",
    };
  }

  if (issue.status === "resolved") {
    return {
      actionId,
      issueId,
      result: "resolved",
      note: fr ? "Correction déjà confirmée." : "Already confirmed fixed.",
    };
  }

  const url = action.targetUrl ?? issue.url;
  if (!url) {
    return {
      actionId,
      issueId,
      result: "no_issue_linked",
      note: fr ? "Aucune adresse à revérifier." : "No URL to re-check.",
    };
  }

  const recheck = await recheckUrl(url, { allowPrivateHosts: allowPrivateHosts() });
  const verdict = readRecheck(recheck, issue.type, url);
  if (verdict !== "gone" && verdict !== "present") {
    // NOT resolved. A site that will not answer tells us nothing about
    // whether the fix worked, and this is the branch where it would be
    // easiest to quietly assume success.
    return {
      actionId,
      issueId,
      result: "unreachable",
      note: fr
        ? `Appliquée, mais ${url} n’a pas pu être relue pour le confirmer. Le constat reste ouvert.`
        : `Applied, but ${url} could not be fetched to confirm it. Leaving the finding open.`,
    };
  }

  if (verdict === "present") {
    await db
      .update(agentActions)
      .set({
        verifyNote: fr
          ? `Écrit et relu dans le CMS, mais la page en ligne présente toujours « ${issue.type} ». ` +
            `En général, un cache de page ou un thème/une extension qui remplace ce champ.`
          : `Written and read back from the CMS, but the live page still ` +
            `shows "${issue.type}". Usually a page cache or a theme/plugin ` +
            `that overrides this field.`,
      })
      .where(eq(agentActions.id, action.id));

    await logActivity({
      kind: "agent.fix_not_live",
      clientId: action.clientId,
      level: "warning",
      entityType: "audit_issue",
      entityId: issueId,
      message:
        `Applied but not live yet on ${shortUrl(url)}: ${issue.type} is ` +
        `still in the HTML served from ${url}, after the change was ` +
        `written and read back from the CMS. The finding stays open — ` +
        `clear the page cache and it should close on the next run.`,
      messageFr:
        `Appliquée mais pas encore en ligne sur ${shortUrl(url)} : ${issue.type} figure ` +
        `toujours dans le HTML servi par ${url}, alors que la modification a été écrite ` +
        `et relue dans le CMS. Le constat reste ouvert : videz le cache de la page, ` +
        `il devrait se clore à la prochaine exécution.`,
    });

    return {
      actionId,
      issueId,
      result: "still_present",
      note: fr
        ? `Appliquée, mais la page en ligne présente toujours ${issue.type} : probablement un cache.`
        : `Applied, but the live page still shows ${issue.type} — likely a cache.`,
    };
  }

  // Confirmed on the live page. Now, and only now, the finding closes.
  await db
    .update(auditIssues)
    .set({ status: "resolved", updatedAt: new Date() })
    .where(eq(auditIssues.id, issueId));

  await logActivity({
    kind: "agent.fix_confirmed",
    clientId: action.clientId,
    level: "success",
    entityType: "audit_issue",
    entityId: issueId,
    message:
      `Confirmed fixed: ${issue.type} on ${shortUrl(url)}. The agent ` +
      `applied the change, read it back from the CMS, then re-fetched ` +
      `the page and found the problem gone from the live HTML.`,
    messageFr:
      `Correction confirmée : ${issue.type} sur ${shortUrl(url)}. L’agent a appliqué ` +
      `la modification, l’a relue dans le CMS, puis a rechargé la page : le problème ` +
      `a disparu du HTML en ligne.`,
  });

  return {
    actionId,
    issueId,
    result: "resolved",
    note: fr
      ? `Confirmé sur la page en ligne : ${issue.type} a disparu.`
      : `Confirmed on the live page: ${issue.type} is gone.`,
  };
}

/**
 * What a re-fetch says about one finding on one page.
 *
 *  - `gone`         the page was served, at that address, and the check
 *                   that produces this finding ran without producing it
 *  - `present`      it is still there
 *  - `unreachable`  no answer at all
 *  - `error_page`   an error status: an error page has no title to be
 *                   too long, and reading "gone" off it would be false
 *  - `moved`        the address now redirects to another page, so this
 *                   page was not the one checked
 *  - `unchecked`    the check that finds this type did not run
 */
export type RecheckVerdict = "gone" | "present" | "unreachable" | "error_page" | "moved" | "unchecked";

export function readRecheck(
  recheck: RecheckResult | null,
  type: string,
  url: string,
): RecheckVerdict {
  if (!recheck) return "unreachable";
  if (!isPageRecheckable(type)) return "unchecked";
  if (isTechPageCheck(type) && !recheck.techChecked) return "unchecked";
  const present = recheck.findings.some((f) => f.type === type && sameUrl(f.url, url));
  if (present) return "present";
  // The status findings are the only ones an error page can answer.
  if (recheck.status >= 400 && type !== "bad_status" && type !== "soft_404") return "error_page";
  if (!sameUrl(recheck.finalUrl, url)) return "moved";
  return "gone";
}

/**
 * Which audit finding an action came from.
 *
 * `agentActions` has no issue column, so this matches on the pair that
 * identifies a finding: the issue types the action kind can close, and
 * the URL. Deliberately conservative: no match returns null and the
 * caller says "not traceable to a finding", rather than resolving
 * whichever row sorted first.
 */
async function findIssueForAction(action: {
  clientId: number;
  kind: string;
  targetUrl: string | null;
}): Promise<number | null> {
  const types = ISSUE_TYPES_FOR_KIND[action.kind];
  if (!types || !action.targetUrl) return null;

  // Resolved findings are INCLUDED: excluding them made a second call
  // report "not traceable" and left the already-resolved guard in the
  // caller unreachable.
  const rows = await db
    .select({
      id: auditIssues.id,
      url: auditIssues.url,
      type: auditIssues.type,
      status: auditIssues.status,
    })
    .from(auditIssues)
    .innerJoin(audits, eq(auditIssues.auditId, audits.id))
    .where(
      and(
        eq(audits.clientId, action.clientId),
        inArray(auditIssues.type, types as string[]),
      ),
    );

  const matches = rows.filter((r) => sameUrl(r.url, action.targetUrl));
  if (matches.length === 0) return null;

  // Prefer the newest still-open finding: a regression picked up by a
  // later audit has a higher id than the resolved row it replaced, so a
  // fix that came undone is re-checked rather than treated as done.
  const open = matches.filter((r) => r.status !== "resolved");
  const pool = open.length > 0 ? open : matches;
  return pool.reduce((a, b) => (b.id > a.id ? b : a)).id;
}

/** Same page, ignoring scheme, trailing slash and case. */
export function sameUrl(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const norm = (u: string) =>
    u.replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();
  return norm(a) === norm(b);
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname === "/" ? u.hostname : u.pathname;
  } catch {
    return url;
  }
}

/**
 * Close the loop for every applied action in a run, then close any task
 * whose findings are now all resolved.
 */
export async function closeLoopForRun(runId: number): Promise<{
  resolved: number;
  stillPresent: number;
  unreachable: number;
  tasksClosed: number;
  outcomes: LoopOutcome[];
}> {
  const applied = await db
    .select({ id: agentActions.id })
    .from(agentActions)
    .where(
      and(
        eq(agentActions.runId, runId),
        inArray(agentActions.status, ["applied", "verified"]),
      ),
    );

  const outcomes: LoopOutcome[] = [];
  for (const a of applied) {
    outcomes.push(await closeLoopForAction(a.id));
  }

  const resolved = outcomes.filter((o) => o.result === "resolved").length;
  const tasksClosed = resolved > 0 ? await closeFinishedAgentTasks() : 0;

  return {
    resolved,
    stillPresent: outcomes.filter((o) => o.result === "still_present").length,
    unreachable: outcomes.filter((o) => o.result === "unreachable").length,
    tasksClosed,
    outcomes,
  };
}

/**
 * Close agent-created tasks whose findings are all resolved.
 *
 * The agent groups findings it cannot fix into one task per issue type,
 * with `sourceRef = "agent:<type>"`. So a task is done when no open
 * finding of that type is left for its client — a question about the
 * findings, not about the task, which is why nothing was closing it.
 */
export async function closeFinishedAgentTasks(): Promise<number> {
  const open = await db
    .select({
      id: tasks.id,
      clientId: tasks.clientId,
      sourceRef: tasks.sourceRef,
      title: tasks.title,
    })
    .from(tasks)
    .where(and(eq(tasks.source, "agent"), eq(tasks.status, "todo")));

  let closed = 0;
  for (const t of open) {
    const type = t.sourceRef?.startsWith("agent:")
      ? t.sourceRef.slice("agent:".length)
      : null;
    if (!type) continue;

    const remaining = await db
      .select({ id: auditIssues.id })
      .from(auditIssues)
      .innerJoin(audits, eq(auditIssues.auditId, audits.id))
      .where(
        and(
          eq(audits.clientId, t.clientId),
          eq(auditIssues.type, type),
          eq(auditIssues.status, "new"),
        ),
      )
      .limit(1);

    if (remaining.length > 0) continue;

    await db
      .update(tasks)
      .set({ status: "done", updatedAt: new Date() })
      .where(eq(tasks.id, t.id));
    closed++;

    await logActivity({
      kind: "task.completed",
      clientId: t.clientId,
      level: "success",
      entityType: "task",
      entityId: t.id,
      message:
        `Task completed: ${t.title}. Every "${type}" finding for this ` +
        `client is resolved, so the task the agent created for it is done.`,
      messageFr:
        `Tâche terminée : ${t.title}. Tous les constats « ${type} » de ce client ` +
        `sont résolus : la tâche créée par l’agent pour eux est donc close.`,
    });
  }

  return closed;
}

// ── The manual path: "I fixed this — check it" ──────────────────────────

/** What re-checking one page of a finding found. */
export type PageVerdict = {
  issueId: number;
  url: string;
  verdict: "resolved" | "still_present" | "unreachable" | "error_page" | "moved" | "unchecked";
};

export type VerifyFindingsResult = {
  /**
   * `not_checkable`: a finding about the whole site, or one that compares
   * pages with each other, has no single page to re-fetch — nothing was
   * re-checked and nothing was resolved.
   * `gone`: the findings no longer exist (a later crawl replaced them).
   * `checked`: pages were re-fetched; see `pages`.
   */
  result: "checked" | "not_checkable" | "gone";
  type: string | null;
  /** The open pages re-checked by this call. */
  pages: PageVerdict[];
  /** Pages of this finding already confirmed fixed earlier (not re-checked). */
  alreadyResolved: number;
  /** Open pages beyond VERIFY_MAX_PAGES, left for the next click. */
  remaining: number;
  /** Agent tasks closed as a consequence. */
  tasksClosed: number;
};

/** Pages re-checked at most per click, so the button answers in seconds. */
export const VERIFY_MAX_PAGES = 25;

/**
 * "I fixed this — check it for me", for one finding type on one audit.
 *
 * Marking a finding resolved by hand takes the user's word for it. This
 * re-fetches each affected page and resolves a finding ONLY where the
 * problem is genuinely gone from the live HTML — the same check the agent
 * runs on its own work, available to every user with no plugin, no API
 * key and no Google account. The user makes the change however they like
 * (CMS, editor, developer) and the tool checks rather than believes.
 *
 * Adapted from the original, which re-checked only the first page of a
 * group: here every affected page is checked (up to VERIFY_MAX_PAGES),
 * and each page is resolved or left open on its own evidence.
 */
export async function verifyFindingsFixed(issueIds: number[]): Promise<VerifyFindingsResult> {
  const ids = [...new Set(issueIds.filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) return { result: "gone", type: null, pages: [], alreadyResolved: 0, remaining: 0, tasksClosed: 0 };

  const rows = await db
    .select({
      id: auditIssues.id,
      type: auditIssues.type,
      url: auditIssues.url,
      status: auditIssues.status,
      clientId: audits.clientId,
    })
    .from(auditIssues)
    .innerJoin(audits, eq(auditIssues.auditId, audits.id))
    .where(inArray(auditIssues.id, ids));

  if (rows.length === 0) return { result: "gone", type: null, pages: [], alreadyResolved: 0, remaining: 0, tasksClosed: 0 };
  const type = rows[0].type;
  // One type per call; a mixed list is not something the page sends.
  const same = rows.filter((r) => r.type === type);

  if (!isPageRecheckable(type) || same.every((r) => !r.url)) {
    return { result: "not_checkable", type, pages: [], alreadyResolved: 0, remaining: 0, tasksClosed: 0 };
  }

  const pages: PageVerdict[] = [];
  const withUrl = same.filter((r) => r.url);
  const alreadyResolved = withUrl.filter((r) => r.status === "resolved").length;
  // Open pages first, in the order the page lists them, so a second
  // click moves on to the pages the first one did not reach.
  const allOpen = withUrl.filter((r) => r.status !== "resolved");
  const open = allOpen.slice(0, VERIFY_MAX_PAGES);
  const todo = open;

  // Technologies detected once per site, not once per page.
  let techNames: string[] | undefined;
  if (isTechPageCheck(type) && open.length > 0) {
    try {
      const { detectTechStack } = await import("@/lib/tech-detect");
      const origin = new URL(open[0].url).origin + "/";
      techNames = (await detectTechStack(origin, allowPrivateHosts())).technologies.map((t) => t.name);
    } catch {
      techNames = undefined;
    }
  }

  // A few pages at a time: fast enough to answer while the user waits,
  // gentle enough on their server.
  const queue = [...open];
  const worker = async () => {
    for (let r = queue.shift(); r; r = queue.shift()) {
      const recheck = await recheckUrl(r.url, { allowPrivateHosts: allowPrivateHosts(), techNames });
      const v = readRecheck(recheck, type, r.url);
      if (v === "gone") {
        await db
          .update(auditIssues)
          .set({ status: "resolved", updatedAt: new Date() })
          .where(eq(auditIssues.id, r.id));
        pages.push({ issueId: r.id, url: r.url, verdict: "resolved" });
      } else {
        pages.push({ issueId: r.id, url: r.url, verdict: v === "present" ? "still_present" : v });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));

  const resolved = pages.filter((p) => p.verdict === "resolved");
  const still = pages.filter((p) => p.verdict === "still_present");
  const clientId = same[0].clientId;

  if (resolved.length > 0) {
    await logActivity({
      kind: "agent.fix_confirmed",
      clientId,
      level: "success",
      entityType: "audit_issue",
      entityId: resolved[0].issueId,
      dedupe: false,
      message:
        `Confirmed fixed on request by re-fetching ${resolved.length} page(s): "${type}" ` +
        `is gone from the live HTML. Marked resolved on evidence rather than on a claim.`,
      messageFr:
        `Correction confirmée à la demande en rechargeant ${resolved.length} page(s) : « ${type} » ` +
        `a disparu du HTML en ligne. Marqué résolu sur preuve, et non sur simple déclaration.`,
    });
  }
  if (still.length > 0) {
    await logActivity({
      kind: "agent.fix_not_live",
      clientId,
      level: "warning",
      entityType: "audit_issue",
      entityId: still[0].issueId,
      dedupe: false,
      message:
        `Checked on request: "${type}" is still on ${still.length} page(s) (e.g. ${still[0].url}). ` +
        `If the change was made, a page cache or a theme override may be serving the old version.`,
      messageFr:
        `Vérifié à la demande : « ${type} » est toujours présent sur ${still.length} page(s) ` +
        `(par exemple ${still[0].url}). Si la modification a été faite, un cache de page ou un ` +
        `thème peut encore servir l’ancienne version.`,
    });
  }

  // The findings drive the tasks, so a confirmed fix may finish one.
  const tasksClosed = resolved.length > 0 ? await closeFinishedAgentTasks() : 0;

  // Keep the order the user sees on the page.
  const order = new Map(todo.map((r, i) => [r.id, i]));
  pages.sort((a, b) => (order.get(a.issueId) ?? 0) - (order.get(b.issueId) ?? 0));

  return {
    result: "checked",
    type,
    pages,
    alreadyResolved,
    remaining: allOpen.length - open.length,
    tasksClosed,
  };
}
