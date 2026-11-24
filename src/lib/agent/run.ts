/**
 * One autonomous cycle for one client.
 *
 * detect capabilities -> plan -> draft -> apply or queue -> verify ->
 * turn what's left into tasks -> write a plain-language summary.
 *
 * The last two steps matter as much as the middle ones. An agent that
 * only reports what it managed to change leaves the user with no idea
 * what it *couldn't* — and the things it can't fix automatically are
 * usually the ones that need a human most. So everything the agent
 * declines to touch becomes a task with the reason attached, and every
 * run ends with a paragraph the user can read in five seconds.
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { contextForPrompt, getClientContext } from "@/lib/client-knowledge";
import { withoutInfrastructure } from "@/lib/infrastructure-urls";
import { findingsToTasks } from "@/lib/audit-to-task";
import { getReportLocale } from "@/lib/report-i18n";
import { RUN_SUMMARY_FR } from "./planner.fr";
import { agentTaskWanted, untouched } from "@/lib/task-dedupe";
import { db } from "@/db/client";
import {
  agentActions,
  agentRuns,
  auditIssues,
  audits,
  clients,
  tasks,
  type Client,
} from "@/db/schema";
import { logActivity } from "../activity";
import { getAgentSettings, willAutoApply, type AgentSettings } from "./autonomy";
import { detectCapabilities, has } from "./capabilities";
import { closeLoopForRun } from "./close-loop";
import { taskDescriptionFor } from "@/lib/dev-ticket";
import {
  planForClient,
  type PlanOutcome,
  type PlannedAction,
} from "./planner";
import { findPostIdByUrl, getClientWpCreds, getPostImages } from "../wp-bridge";
import {
  draftValue,
  executeAction,
  requiresDraft,
  requiresModel,
} from "./executor";

/**
 * Record a change the agent decided not to make, and why.
 *
 * A refusal is a result. The most common one is the model returning
 * copy that breaks a rule — a replacement title still over the display
 * limit — and that is the agent working correctly. Counting it into
 * `failed` and dropping it left the run log saying "2 couldn't be
 * completed" with no way to find out which two or why.
 */
async function recordFailedDraft(opts: {
  runId: number | null;
  clientId: number;
  action: PlannedAction;
  error: string;
}): Promise<void> {
  await db.insert(agentActions).values({
    runId: opts.runId,
    clientId: opts.clientId,
    kind: opts.action.kind,
    targetUrl: opts.action.targetUrl,
    targetRef: opts.action.targetRef ?? null,
    reason: opts.action.reason,
    risk: opts.action.risk,
    beforeValue: opts.action.currentValue ?? null,
    status: "failed",
    error: opts.error,
  });
}

/**
 * Record work the agent has decided on but cannot write the words for.
 *
 * Status is "proposed", which the rest of the system already understands
 * as "waiting for a human". The difference is afterValue is null: the
 * decision is made, the text is not written. list_proposed_fixes over
 * MCP picks these up so the user own assistant can supply it.
 *
 * beforeValue is captured here for the same reason executeAction
 * captures it: without a previous value there is no undo, and a change
 * we cannot reverse is not one worth making.
 */
async function recordAwaitingText(opts: {
  runId: number | null;
  clientId: number;
  action: PlannedAction;
}): Promise<void> {
  await db.insert(agentActions).values({
    runId: opts.runId,
    clientId: opts.clientId,
    kind: opts.action.kind,
    targetUrl: opts.action.targetUrl,
    targetRef: opts.action.targetRef ?? null,
    reason: opts.action.reason,
    risk: opts.action.risk,
    beforeValue: opts.action.currentValue ?? null,
    afterValue: null,
    status: "proposed",
    error: null,
  });
}

export type AgentRunResult = {
  runId: number | null;
  clientId: number;
  planned: number;
  applied: number;
  queued: number;
  skipped: number;
  failed: number;
  summary: string;
  tasksCreated: number;
};

export async function runAgentForClient(opts: {
  clientId: number;
  trigger?: "scheduled" | "manual";
  /** Override the stored setting — used by the "dry run" button. */
  settings?: AgentSettings;
}): Promise<AgentRunResult> {
  const settings = opts.settings ?? (await getAgentSettings());
  const trigger = opts.trigger ?? "scheduled";
  const startedAt = new Date();
  // The summary is stored and logged: written in the workspace language.
  const fr = (await getReportLocale().catch(() => "en")) === "fr";

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, opts.clientId))
    .limit(1);

  if (!client) {
    return empty(opts.clientId, fr ? RUN_SUMMARY_FR.noClient : "That client no longer exists.");
  }

  // What the business is, read once for the whole run rather than per
  // action. A run rewriting forty titles would otherwise hit the same
  // two tables forty times for an answer that cannot change mid-run.
  //
  // Read only. The agent is not permitted to write here from inside a
  // drafting loop: concluding something about the business while
  // rewriting an image's alt text is exactly the kind of inference that
  // should not become a stored fact.
  const businessContext = contextForPrompt(
    await getClientContext(opts.clientId, { researchLimit: 0 }),
  );

  if (settings.level === "off") {
    return empty(opts.clientId, fr ? RUN_SUMMARY_FR.off : "The agent is turned off.");
  }

  // `settings.level` is narrowed to the three acting levels here — the
  // "off" case returned above.
  const mode = settings.level;

  const [run] = await db
    .insert(agentRuns)
    .values({ clientId: opts.clientId, mode, trigger, startedAt })
    .returning({ id: agentRuns.id });

  try {
    const capabilities = await detectCapabilities(opts.clientId);
    const plan = await planForClient({
      clientId: opts.clientId,
      capabilities,
      settings,
    });

    // Alt text is written per attachment, not per page, so one finding
    // becomes one action per image. Done here rather than in the planner
    // because it needs CMS credentials and a network call, and the
    // planner is deliberately pure — it reads findings and decides, it
    // doesn't talk to anyone's website.
    plan.actions = await expandImageActions(
      opts.clientId,
      plan.actions,
      settings.maxActionsPerRun,
    );

    let applied = 0;
    let queued = 0;
    let failed = 0;
    let skipped = 0;

    for (const action of plan.actions) {
      // Anything that needs new wording needs a model. Without one we
      // can still tell the user what's wrong — which is what the task
      // pass below does — but we can't propose the replacement.
      //
      // requiresDraft is asked rather than restated. This was an inline
      // list of two kinds, and the two it omitted — alt text and schema
      // — went straight to the executor with an empty value, wrote
      // nothing, verified cleanly against the unchanged field, and were
      // reported as fixed.
      const needsDraft = requiresDraft(action.kind);

      if (requiresModel(action.kind) && !has(capabilities, "generate_text")) {
        // No model of our own — which does not mean nothing can be done.
        //
        // This used to just skip. The work vanished: no row, no record,
        // nothing for anyone to act on. So a user who connected their
        // Claude or ChatGPT subscription instead of buying an API key
        // got an agent that planned everything and did none of it,
        // silently — the exact failure shape this codebase keeps
        // finding.
        //
        // Now it records the proposal with the text still missing. The
        // MCP tools (list_proposed_fixes / apply_fix) hand it to the
        // user own model, which writes the words. We still validate
        // them against the same rules, write, verify by reading back,
        // and record the undo. Only where the words come from changes.
        if (capabilities.canWrite) {
          await recordAwaitingText({
            runId: run.id,
            clientId: opts.clientId,
            action,
          });
          queued++;
        } else {
          skipped++;
        }
        continue;
      }

      const draft = needsDraft
        ? await draftValue(action, {
            siteName: client.name,
            pageUrl: action.targetUrl,
            pageTitle: action.currentValue,
            business: businessContext,
          })
        : ({ ok: true, value: "" } as const);

      if (!draft.ok) {
        // Record the refusal. Counting it and moving on left the run
        // saying "2 couldn't be completed" with nothing anywhere to say
        // which two or why — so a user whose model kept returning
        // over-length titles had no way to find that out.
        await recordFailedDraft({
          runId: run.id,
          clientId: opts.clientId,
          action,
          error: draft.error,
        });
        failed++;
        continue;
      }

      const shouldApply =
        willAutoApply(settings.level, action.risk) && capabilities.canWrite;

      const outcome = await executeAction({
        runId: run.id,
        clientId: opts.clientId,
        action,
        newValue: draft.value,
        apply: shouldApply,
        siteName: client.name,
      });

      if (outcome.status === "verified" || outcome.status === "applied") applied++;
      else if (outcome.status === "queued" || outcome.status === "proposed") queued++;
      // "Nothing to do here after all" is not a failure. The page was
      // left alone on purpose — usually the phrase was already linked —
      // and reporting that as failed would inflate the failure count
      // with correct behaviour, which is how people learn to ignore it.
      else if (outcome.status === "skipped") skipped++;
      else failed++;
    }

    // Close the loop on whatever actually reached the site: re-fetch each
    // fixed page and resolve the finding only if the problem is gone from
    // the live HTML. The executor's CMS read-back proves the field was
    // stored; it does not prove a crawler sees it, and a page cache
    // between the two is what makes "verified" and "actually fixed"
    // different things. Runs before task creation on purpose, so work
    // just confirmed done is not raised again as a task. (Upstream
    // 155d48f.)
    const loop = await closeLoopForRun(run.id);

    // Everything we couldn't act on becomes a task. This is the bit that
    // makes the agent useful on a site it has no write access to at all:
    // it still turns a wall of audit findings into a prioritised list of
    // things to do, each with the reason attached.
    const tasksCreated = await createTasksFromUnfixable(client, plan);

    const summary = writeSummary({
      client,
      settings,
      plan,
      applied,
      queued,
      failed,
      skipped,
      tasksCreated,
      capabilities: capabilities.gaps,
      fr,
      confirmed: loop.resolved,
      notLive: loop.stillPresent,
      tasksClosed: loop.tasksClosed,
    });

    await db
      .update(agentRuns)
      .set({
        finishedAt: new Date(),
        planned: plan.actions.length,
        applied,
        queued,
        skipped,
        failed,
        summary,
      })
      .where(eq(agentRuns.id, run.id));

    if (applied > 0 || queued > 0 || tasksCreated > 0) {
      await logActivity({
        kind: "task.created",
        message: summary,
        clientId: opts.clientId,
        level: failed > 0 ? "warning" : "success",
        dedupe: false,
      });
    }

    return {
      runId: run.id,
      clientId: opts.clientId,
      planned: plan.actions.length,
      applied,
      queued,
      skipped,
      failed,
      summary,
      tasksCreated,
    };
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    const failedSummary = fr ? RUN_SUMMARY_FR.runFailed(message) : `The run failed: ${message}`;
    await db
      .update(agentRuns)
      .set({ finishedAt: new Date(), error: message, summary: failedSummary })
      .where(eq(agentRuns.id, run.id));
    return {
      ...empty(opts.clientId, failedSummary),
      runId: run.id,
    };
  }
}

/**
 * Turn audit findings the agent can't fix itself into tasks.
 *
 * CLAUDE.md lists "automatic task generation from audit findings" as a
 * differentiator, and it was never built — findings sat in a list and
 * the user had to transcribe them by hand. This closes that, and it is
 * the part of the agent that works with no CMS connection, no AI key and
 * no Search Console.
 *
 * Deliberately capped and deduped: generating ninety tasks from a first
 * crawl is not help, it is a second problem.
 */
async function createTasksFromUnfixable(
  client: Client,
  _plan: PlanOutcome,
): Promise<number> {
  // desc, not asc. This read `.orderBy(audits.id)` and therefore picked
  // the OLDEST audit while the planner used the newest — so on a client
  // with any history the agent planned fixes against today's crawl and
  // generated tasks from a crawl that might be months old, describing
  // problems already solved. Nothing errored; the task list was just
  // quietly about the wrong site.
  const [latest] = await db
    .select({ id: audits.id })
    .from(audits)
    .where(eq(audits.clientId, client.id))
    .orderBy(desc(audits.id))
    .limit(1);
  if (!latest) return 0;

  // Infrastructure rows out. An audit saved before the crawler learned to
  // skip them still holds them, and this pass turned a Cloudflare
  // email-protection link into "Bad status on /cdn-cgi/l/email-protection".
  const issues = withoutInfrastructure(
    await db
      .select()
      .from(auditIssues)
      .where(
        and(
          eq(auditIssues.auditId, latest.id),
          eq(auditIssues.status, "new"),
          inArray(auditIssues.severity, ["critical", "high", "medium"]),
        ),
      ),
  );

  if (issues.length === 0) return 0;

  // One task per issue TYPE, not per URL. "Add meta descriptions to 34
  // pages" is a job someone can pick up; thirty-four separate tasks is a
  // backlog nobody opens twice.
  const byType = new Map<string, typeof issues>();
  for (const i of issues) {
    byType.set(i.type, [...(byType.get(i.type) ?? []), i]);
  }

  const all = await db
    .select({
      id: tasks.id,
      source: tasks.source,
      sourceRef: tasks.sourceRef,
      title: tasks.title,
      status: tasks.status,
      actualMinutes: tasks.actualMinutes,
      assignedUserId: tasks.assignedUserId,
    })
    .from(tasks)
    .where(eq(tasks.clientId, client.id));
  const others = all.filter((t) => t.source !== "agent");
  const mine = all.filter((t) => t.source === "agent");

  // Earlier runs repeated the audit's tasks: drop those nobody touched.
  const repeats = mine.filter(
    (t) => untouched(t) && t.sourceRef && !agentTaskWanted(t.sourceRef.slice("agent:".length), others),
  );
  if (repeats.length > 0) {
    await db.delete(tasks).where(inArray(tasks.id, repeats.map((t) => t.id)));
  }
  const already = new Set(mine.map((t) => t.sourceRef));

  const locale = (await getReportLocale().catch(() => "en")) === "fr" ? "fr" : "en";
  let created = 0;
  for (const [type, list] of byType) {
    const ref = `agent:${type}`;
    if (already.has(ref)) continue;
    // Only what the audit, the engine and the templates left out.
    if (!agentTaskWanted(type, others)) continue;

    // The audit's own words for the problem, in the workspace language.
    const [text] = findingsToTasks(
      list.map((i) => ({ type: i.type, severity: i.severity, message: i.message, url: i.url })),
      locale,
    );
    const label = humanIssueType(type);
    await db.insert(tasks).values({
      clientId: client.id,
      title:
        text?.title ??
        (list.length === 1
          ? `${label} on ${shortUrl(list[0].url)}`
          : `${label} — ${list.length} pages`),
      // The finding's own written guidance, not a bare URL list: these
      // are precisely the findings the agent CANNOT fix, so the task is
      // all the user gets out of them. See lib/dev-ticket.ts.
      description: taskDescriptionFor(
        type,
        list.map((i) => ({ type, severity: i.severity, url: i.url, message: i.message })),
        locale,
      ),
      whyItMatters: text?.whyItMatters ?? list[0].message,
      priority: list.some((i) => i.severity === "critical") ? "high" : "medium",
      status: "todo",
      source: "agent",
      sourceRef: ref,
    });
    created++;
    // Ten is enough to fill a working day. More would be a wall.
    if (created >= 10) break;
  }

  return created;
}

/**
 * "missing_ai_crawler_policy" -> "Add missing AI crawler policy".
 *
 * The acronym pass exists because the naive version produced "Add
 * missing ai crawler policy" and "Add missing h1", which appear in the
 * user's task list every day and read as carelessness.
 */
const ACRONYMS: Record<string, string> = {
  ai: "AI",
  h1: "H1",
  h2: "H2",
  url: "URL",
  urls: "URLs",
  html: "HTML",
  css: "CSS",
  js: "JS",
  ssl: "SSL",
  http: "HTTP",
  https: "HTTPS",
  seo: "SEO",
  cta: "CTA",
  gsc: "Search Console",
  faq: "FAQ",
  eeat: "E-E-A-T",
  cwv: "Core Web Vitals",
  lcp: "LCP",
  cls: "CLS",
  txt: "txt",
};

function humanIssueType(type: string): string {
  const words = type
    .split("_")
    .map((w) => ACRONYMS[w.toLowerCase()] ?? w);
  const phrase = words.join(" ");
  return phrase
    .replace(/^\w/, (c) => c.toUpperCase())
    .replace(/^Missing /, "Add missing ");
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
 * The paragraph the user actually reads.
 *
 * Written by code, not by a model. An LLM-written summary of what an
 * LLM-driven agent did is two layers of plausible narration over one
 * set of facts, and the failure mode — a confident summary of work that
 * didn't happen — is the exact thing this project keeps finding.
 */
function writeSummary(a: {
  client: Client;
  settings: AgentSettings;
  plan: PlanOutcome;
  applied: number;
  queued: number;
  failed: number;
  skipped: number;
  tasksCreated: number;
  capabilities: string[];
  /** Written in French (planner.fr.ts) when the workspace is French. */
  fr?: boolean;
  /**
   * What the loop-closing step confirmed. Reported separately from
   * `applied` because "written to the CMS" and "gone from the live page"
   * are different claims.
   */
  confirmed?: number;
  notLive?: number;
  tasksClosed?: number;
}): string {
  const parts: string[] = [];
  const F = a.fr ? RUN_SUMMARY_FR : null;

  if (a.applied > 0) {
    parts.push(
      F ? F.fixed(a.applied, trimTrailingPeriod(a.client.name)) :
      `Fixed ${a.applied} thing${a.applied === 1 ? "" : "s"} on ${trimTrailingPeriod(a.client.name)}`,
    );
  }
  if (a.confirmed && a.confirmed > 0) {
    parts.push(
      F ? F.confirmed(a.confirmed) :
      `confirmed ${a.confirmed} fix${a.confirmed === 1 ? "" : "es"} gone from the live pages`,
    );
  }
  if (a.notLive && a.notLive > 0) {
    parts.push(
      F ? F.notLive(a.notLive) :
      `${a.notLive} applied but still showing on the live page (usually a cache)`,
    );
  }
  if (a.tasksClosed && a.tasksClosed > 0) {
    parts.push(
      F ? F.tasksClosed(a.tasksClosed) :
      `closed ${a.tasksClosed} task${a.tasksClosed === 1 ? "" : "s"}`,
    );
  }
  if (a.queued > 0) {
    parts.push(
      F ? F.queued(a.queued) :
      `${a.queued} change${a.queued === 1 ? "" : "s"} waiting for your approval`,
    );
  }
  if (a.tasksCreated > 0) {
    parts.push(F ? F.tasks(a.tasksCreated) : `created ${a.tasksCreated} task${a.tasksCreated === 1 ? "" : "s"}`);
  }
  if (a.failed > 0) {
    parts.push(F ? F.failed(a.failed) : `${a.failed} couldn't be completed`);
  }

  if (parts.length === 0) {
    // Saying "nothing to do" plainly is more useful than an empty
    // summary that reads like a malfunction.
    const why = a.plan.skipped[0]?.reason;
    const name = trimTrailingPeriod(a.client.name);
    if (F) return why ? F.nothingWhy(name, why) : F.nothing(name);
    return why
      ? `Nothing to do on ${name}. ${why}`
      : `Checked ${name} — nothing needed changing.`;
  }

  let out = parts.join(", ") + ".";

  if (a.capabilities.length > 0) {
    out += ` ${a.capabilities[0]}`;
  }

  return out;
}

/**
 * "Acme Coffee Co." followed by our own full stop reads as "Acme Coffee
 * Co..". Abbreviated company names are common enough that this is worth
 * one line — a summary the user reads every day should not look sloppy.
 */
function trimTrailingPeriod(name: string): string {
  return name.replace(/\.$/, "");
}

function empty(clientId: number, summary: string): AgentRunResult {
  return {
    runId: null,
    clientId,
    planned: 0,
    applied: 0,
    queued: 0,
    skipped: 0,
    failed: 0,
    summary,
    tasksCreated: 0,
  };
}

/** Every active client, one after another. Wired into the scheduler. */
export async function runAgentForAllClients(
  trigger: "scheduled" | "manual" = "scheduled",
): Promise<AgentRunResult[]> {
  const settings = await getAgentSettings();
  if (settings.level === "off") return [];

  const all = await db.select({ id: clients.id }).from(clients);
  const results: AgentRunResult[] = [];
  // Sequential: each client's run may launch a browser or call an API,
  // and this is specified to run on a $5 VPS.
  for (const c of all) {
    results.push(
      await runAgentForClient({ clientId: c.id, trigger, settings }),
    );
  }
  return results;
}

/**
 * Turn "this page has images with no alt text" into one action per image.
 *
 * The audit reports per page; WordPress writes alt text per attachment.
 * Without this expansion the agent would have one action, one value, and
 * no way to say which of five images it applied to.
 *
 * Kept out of the planner on purpose. The planner reads findings and
 * decides — it never touches anyone's website. This needs credentials
 * and a network call per page, so it belongs on the execution side of
 * that line.
 *
 * Bounded by the same per-run cap as everything else: a gallery page
 * with sixty un-alt-texted images must not turn one planned action into
 * sixty writes and blow through the blast-radius limit the user set.
 */
async function expandImageActions(
  clientId: number,
  actions: PlannedAction[],
  maxActions: number,
): Promise<PlannedAction[]> {
  const imageActions = actions.filter((a) => a.kind === "write_image_alt");
  if (imageActions.length === 0) return actions;

  const others = actions.filter((a) => a.kind !== "write_image_alt");
  const creds = await getClientWpCreds(clientId);
  // No credentials means capability detection should already have
  // filtered these out. Drop them rather than carry actions that would
  // certainly fail.
  if (!creds) return others;

  const expanded: PlannedAction[] = [];
  const budget = Math.max(0, maxActions - others.length);

  for (const action of imageActions) {
    if (expanded.length >= budget) break;

    const postId = await findPostIdByUrl(creds, action.targetUrl);
    if (postId === null) continue;

    const result = await getPostImages(creds, postId);
    if (!result.ok) continue;

    for (const image of result.images) {
      if (expanded.length >= budget) break;
      // Only images we can actually reach, and only ones that need it.
      // Re-checking `alt` here rather than trusting the audit matters:
      // the crawl may be hours old and someone may have fixed these by
      // hand this morning.
      if (!image.fixable || image.attachmentId === null) continue;
      if (image.alt.trim().length > 0) continue;

      expanded.push({
        ...action,
        targetRef: String(image.attachmentId),
        imageSrc: image.src,
        currentValue: "",
        reason:
          "This image has no alt text, so it's invisible to screen readers and to image search.",
      });
    }
  }

  return [...others, ...expanded];
}
