/**
 * The step that was missing: after a fix is applied, prove it on the
 * live page, close the finding, and close the task.
 *
 * WHAT THE AGENT DID BEFORE THIS, measured on the maintainer's own
 * install on 19 Nov 2026:
 *
 *   60 agent runs · 59 actions planned · 3 applied · 42 queued
 *   115 tasks at `todo` · 0 ever completed
 *
 * Zero completed tasks, ever. Even the 3 applied changes left their
 * audit finding at `new` and their task at `todo`, so the audit score
 * never moved, the task list never shrank, and the monthly report had
 * nothing to show. From the user's side the tool finds work forever and
 * finishes none of it — which is exactly how it feels to use, and why
 * the queue aged 68 days.
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
 * class of bug this codebase has: the score improves, the task closes,
 * the report says fixed, and Google still sees the old title. Nothing
 * throws. Instead the finding is resolved only once `recheckUrl` agrees
 * that the problem is gone from the live HTML, and when the live page
 * still disagrees that is recorded in plain words rather than retried
 * silently.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { agentActions, auditIssues, audits, tasks } from "@/db/schema";
import { recheckUrl } from "@/lib/audit";
import type { AuditFindingType } from "@/lib/audit-finding-types";
import { logActivity } from "@/lib/activity";

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
 * Close the loop for one applied action.
 *
 * Safe to call more than once: an issue already `resolved` is left
 * alone, so a re-run of a run does not double-log.
 */
export async function closeLoopForAction(actionId: number): Promise<LoopOutcome> {
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
      note: "No such action.",
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
      note: `Action is ${action.status}, so there is nothing to confirm yet.`,
    };
  }

  const issueId = await findIssueForAction(action);
  if (!issueId) {
    return {
      actionId,
      issueId: null,
      result: "no_issue_linked",
      note: "Applied, but not traceable to an audit finding, so nothing to close.",
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
      note: "The audit finding this came from no longer exists.",
    };
  }

  if (issue.status === "resolved") {
    return {
      actionId,
      issueId,
      result: "resolved",
      note: "Already confirmed fixed.",
    };
  }

  const url = action.targetUrl ?? issue.url;
  if (!url) {
    return {
      actionId,
      issueId,
      result: "no_issue_linked",
      note: "No URL to re-check.",
    };
  }

  // The same opt-in the executor's read-back uses, deliberately rather
  // than a second switch.
  //
  // guardedFetch refuses private addresses, which is right for a URL a
  // stranger pasted into the public grader and wrong for a page on the
  // client's own site that this tool just crawled. Without it, every
  // self-hosted or LAN staging site would report "could not be fetched
  // to confirm it" on every applied change — a warning about nothing,
  // forever, and findings that can never close.
  //
  // Found by running this against a loopback fixture: all six
  // confirmation cases came back `unreachable`, because 127.0.0.1 is
  // exactly what the guard exists to block.
  const recheck = await recheckUrl(url, {
    allowPrivateHosts: process.env.SEO_ALLOW_PRIVATE_WP_ENDPOINT === "1",
  });
  if (!recheck) {
    // NOT resolved. A site that will not answer tells us nothing about
    // whether the fix worked, and this is the branch where it would be
    // easiest to quietly assume success.
    return {
      actionId,
      issueId,
      result: "unreachable",
      note: `Applied, but ${url} could not be fetched to confirm it. Leaving the finding open.`,
    };
  }

  const stillThere = recheck.findings.some(
    (f) => f.type === issue.type && sameUrl(f.url, url),
  );

  if (stillThere) {
    await db
      .update(agentActions)
      .set({
        verifyNote:
          `Written and read back from the CMS, but the live page still ` +
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
    });

    return {
      actionId,
      issueId,
      result: "still_present",
      note: `Applied, but the live page still shows ${issue.type} — likely a cache.`,
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
  });

  return {
    actionId,
    issueId,
    result: "resolved",
    note: `Confirmed on the live page: ${issue.type} is gone.`,
  };
}

/**
 * Which audit finding an action came from.
 *
 * `agentActions` has no issue column — the link lives on `PlannedAction`
 * and is lost once the row is written. Rather than add a migration for
 * it (which would leave every existing row null anyway, including the 14
 * queued here), this matches on the pair that identifies a finding: the
 * issue type implied by the action kind, and the URL.
 *
 * Deliberately conservative. If the match is ambiguous it returns null
 * and the caller reports "not traceable to a finding" — which is honest
 * — rather than resolving whichever row happened to sort first.
 */
async function findIssueForAction(action: {
  clientId: number;
  kind: string;
  targetUrl: string | null;
}): Promise<number | null> {
  const types = ISSUE_TYPES_FOR_KIND[action.kind];
  if (!types || !action.targetUrl) return null;

  // Resolved findings are INCLUDED, which is the opposite of the first
  // version.
  //
  // That version excluded them with ne(status, "resolved"), and the
  // effect was that calling this twice for the same action reported
  // "not traceable to an audit finding" the second time — because the
  // finding it had just resolved was now filtered out. Worse, it made
  // the `issue.status === "resolved"` early-return in the caller
  // unreachable: dead code that read as the idempotency guard.
  //
  // Found by running the second call and reading the answer, not by
  // reading the code.
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

  // Prefer the newest still-open finding. Ids ascend with insertion, so
  // max id is newest, and a regression picked up by a later audit gets a
  // higher id than the resolved row it replaced — so a fix that came
  // undone is re-checked rather than treated as already done.
  const open = matches.filter((r) => r.status !== "resolved");
  const pool = open.length > 0 ? open : matches;
  return pool.reduce((a, b) => (b.id > a.id ? b : a)).id;
}

/**
 * Action kind → the audit finding types it fixes.
 *
 * Only the kinds whose effect is checkable by re-fetching the page. An
 * action whose result cannot be re-checked must not appear here: it
 * would mark a finding resolved on no evidence, which is the thing this
 * module exists to prevent.
 */
/**
 * Exported so close-loop.test.ts can check the real value.
 *
 * It first read this out of the source with a regex, which broke the
 * moment the declaration's type annotation changed — and a guard that
 * fails because it cannot find what it guards is a guard that could
 * equally have passed while finding nothing.
 */
export const ISSUE_TYPES_FOR_KIND: Record<string, AuditFindingType[]> = {
  write_title: ["long_title", "short_title", "missing_title", "duplicate_title"],
  write_meta_description: [
    "missing_meta_description",
    "long_meta_description",
    "short_meta_description",
    "duplicate_meta_description",
  ],
  write_canonical: ["missing_canonical"],
  write_alt_text: ["missing_image_alt"],
  write_robots_txt: ["invalid_robots_txt", "missing_robots_txt"],
};

/*
 * EVERY ONE of these names was wrong in the first version of this file,
 * and the bug it caused is the exact one the module exists to prevent.
 *
 * I wrote "title_too_long", "meta_description_too_long",
 * "image_missing_alt", "robots_blocks_everything" — plausible names that
 * the crawler has never emitted. It emits `long_title`,
 * `long_meta_description`, `missing_image_alt`, `invalid_robots_txt`.
 *
 * The effect: the "is the problem still on the live page?" test compared
 * the finding's type against a string no finding ever has, so
 * `stillThere` was always false, and EVERY applied action resolved its
 * finding regardless of what the page actually served. The one branch
 * written to stop the tool lying was the branch doing the lying.
 *
 * It typechecked, every unit test passed, and the source-reading tests
 * confirmed the refusal was "present in the code". Caught by running it
 * against a page serving a title that was still too long and watching it
 * report "Confirmed on the live page: the problem is gone."
 *
 * The type is now AuditFindingType rather than string, so a name that is
 * not a real finding type will not compile — and close-loop.test.ts
 * checks the map against AUDIT_FINDING_TYPES as well, because a union
 * can be widened by a careless edit while a test cannot be satisfied by
 * one.
 */

/** Same page, ignoring trailing slash and scheme. */
function sameUrl(a: string | null, b: string | null): boolean {
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
 * The agent groups unfixable findings into one task per issue type, with
 * `sourceRef = "agent:<type>"`. So a task is done when no open finding
 * of that type is left for its client — which is a question about the
 * findings, not about the task, and is why nothing was ever closing it:
 * the two were never compared.
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
        `client is resolved and confirmed on the live pages, so the task ` +
        `the agent created for it is done.`,
    });
  }

  return closed;
}
