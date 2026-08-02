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
import { db } from "@/db/client";
import {
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
import {
  planForClient,
  type PlanOutcome,
  type PlannedAction,
} from "./planner";
import { findPostIdByUrl, getClientWpCreds, getPostImages } from "../wp-bridge";
import { draftValue, executeAction } from "./executor";

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

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, opts.clientId))
    .limit(1);

  if (!client) {
    return empty(opts.clientId, "That client no longer exists.");
  }

  if (settings.level === "off") {
    return empty(opts.clientId, "The agent is turned off.");
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
      const needsDraft =
        action.kind === "write_title" || action.kind === "write_meta_description";

      if (needsDraft && !has(capabilities, "generate_text")) {
        skipped++;
        continue;
      }

      const draft = needsDraft
        ? await draftValue(action, {
            siteName: client.name,
            pageUrl: action.targetUrl,
            pageTitle: action.currentValue,
          })
        : ({ ok: true, value: "" } as const);

      if (!draft.ok) {
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
      else failed++;
    }

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
    await db
      .update(agentRuns)
      .set({ finishedAt: new Date(), error: message, summary: `The run failed: ${message}` })
      .where(eq(agentRuns.id, run.id));
    return {
      ...empty(opts.clientId, `The run failed: ${message}`),
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

  const issues = await db
    .select()
    .from(auditIssues)
    .where(
      and(
        eq(auditIssues.auditId, latest.id),
        eq(auditIssues.status, "new"),
        inArray(auditIssues.severity, ["critical", "high", "medium"]),
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

  const existing = await db
    .select({ sourceRef: tasks.sourceRef })
    .from(tasks)
    .where(and(eq(tasks.clientId, client.id), eq(tasks.source, "agent")));
  const already = new Set(existing.map((t) => t.sourceRef));

  let created = 0;
  for (const [type, list] of byType) {
    const ref = `agent:${type}`;
    if (already.has(ref)) continue;

    const label = humanIssueType(type);
    await db.insert(tasks).values({
      clientId: client.id,
      title:
        list.length === 1
          ? `${label} on ${shortUrl(list[0].url)}`
          : `${label} — ${list.length} pages`,
      description: list
        .slice(0, 20)
        .map((i) => `- ${i.url}\n  ${i.message}`)
        .join("\n"),
      whyItMatters: list[0].message,
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
}): string {
  const parts: string[] = [];

  if (a.applied > 0) {
    parts.push(
      `Fixed ${a.applied} thing${a.applied === 1 ? "" : "s"} on ${trimTrailingPeriod(a.client.name)}`,
    );
  }
  if (a.queued > 0) {
    parts.push(
      `${a.queued} change${a.queued === 1 ? "" : "s"} waiting for your approval`,
    );
  }
  if (a.tasksCreated > 0) {
    parts.push(`created ${a.tasksCreated} task${a.tasksCreated === 1 ? "" : "s"}`);
  }
  if (a.failed > 0) {
    parts.push(`${a.failed} couldn't be completed`);
  }

  if (parts.length === 0) {
    // Saying "nothing to do" plainly is more useful than an empty
    // summary that reads like a malfunction.
    const why = a.plan.skipped[0]?.reason;
    const name = trimTrailingPeriod(a.client.name);
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
