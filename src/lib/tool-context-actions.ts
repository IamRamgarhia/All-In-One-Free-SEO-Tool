"use server";

/**
 * The server side of the client banner on tool pages
 * (components/tools/client-context.tsx): what to show, and the two things
 * the reader can do from there — add a task to the client, or close the
 * task they came from. Both land in the client's activity journal, which
 * the client's page reads back as "Work done".
 *
 * The context is always rebuilt here from the tool's address, never taken
 * from what the browser says it resolved: a client id the reader may not
 * see, or a task of another client, is dropped the same way as on display.
 */

import { revalidatePath } from "next/cache";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { auditIssues, audits, clients, tasks } from "@/db/schema";
import { isPageRecheckable } from "@/lib/audit";
import { verifyIssuesFixed } from "@/app/audits/issue-actions";
import { requireSignedIn } from "@/lib/action-guard";
import { logActivity } from "@/lib/activity";
import { currentUser, requireClientAccess, userMayEdit } from "@/lib/auth";
import { scopedClientIds } from "@/lib/client-scope";
import { findingFromSourceRef, toolSlug } from "@/lib/finding-tool-map";
import {
  cleanToolName,
  parseToolContext,
  resolveToolContext,
  toolActivityMessages,
  toolTaskValues,
  type ResolvedToolContext,
} from "@/lib/tool-context";
import { setTaskPageDone, setTaskStatus } from "@/app/tasks/actions";
import { taskTitle } from "@/lib/issue-display";
import { getLocale } from "next-intl/server";
import catalogEn from "../../messages/tools-catalog.en.json";
import catalogFr from "../../messages/tools-catalog.fr.json";

type Catalog = Record<string, { title?: string } | undefined>;

async function contextFrom(query: string): Promise<ResolvedToolContext | null> {
  const params = parseToolContext(new URLSearchParams(query.slice(0, 4096)));
  return resolveToolContext(params, {
    visibleIds: await scopedClientIds(),
    loadClient: async (id) =>
      (await db
        .select({ id: clients.id, name: clients.name, url: clients.url })
        .from(clients)
        .where(eq(clients.id, id))
        .get()) ?? null,
    loadTask: async (id) =>
      (await db
        .select({
          id: tasks.id,
          clientId: tasks.clientId,
          title: tasks.title,
          status: tasks.status,
          sourceRef: tasks.sourceRef,
        })
        .from(tasks)
        .where(eq(tasks.id, id))
        .get()) ?? null,
  });
}

function toolNames(toolPath: string): { en: string; fr: string; slug: string } | null {
  const slug = toolSlug(toolPath);
  if (!slug) return null;
  return {
    slug,
    en: cleanToolName((catalogEn as Catalog)[slug]?.title, slug),
    fr: cleanToolName((catalogFr as Catalog)[slug]?.title, slug),
  };
}

/**
 * The open findings a task was made from, in the client's latest audit
 * that has them — when the live page can confirm them one by one
 * (lib/audit.ts `isPageRecheckable`). Empty otherwise: a site-wide or
 * cross-page finding has no single page to re-fetch, and the banner then
 * offers the plain "mark done" instead of a check it cannot make.
 */
async function checkableFindings(
  ctx: ResolvedToolContext,
): Promise<{ type: string; auditId: number; ids: number[] } | null> {
  const type = findingFromSourceRef(ctx.task?.sourceRef);
  if (!ctx.task || !type || !isPageRecheckable(type)) return null;
  const rows = await db
    .select({ id: auditIssues.id, auditId: auditIssues.auditId })
    .from(auditIssues)
    .innerJoin(audits, eq(auditIssues.auditId, audits.id))
    .where(and(eq(audits.clientId, ctx.client.id), eq(auditIssues.type, type), ne(auditIssues.status, "resolved")))
    .orderBy(desc(auditIssues.auditId));
  if (rows.length === 0) return null;
  const auditId = rows[0].auditId;
  return { type, auditId, ids: rows.filter((r) => r.auditId === auditId).map((r) => r.id) };
}

export type ToolContextView = {
  client: { id: number; name: string };
  url: string;
  pagePath: string;
  task: { id: number; title: string; done: boolean } | null;
  /** The task's findings can be re-checked on the live site ("Check on the site"). */
  canVerify: boolean;
  /** Whether the reader may add or close tasks for this client. */
  canEdit: boolean;
};

/** What the banner shows, or null: no client, an unknown one, or one the reader cannot see. */
export async function loadToolContext(query: string): Promise<ToolContextView | null> {
  // Signed out: throws, and the banner keeps the plain way back.
  await requireSignedIn();
  const ctx = await contextFrom(query);
  if (!ctx) return null;
  return {
    client: { id: ctx.client.id, name: ctx.client.name },
    url: ctx.url,
    pagePath: ctx.pagePath,
    task: ctx.task
      ? { id: ctx.task.id, title: taskTitle(ctx.task.title, await getLocale()), done: ctx.task.status === "done" }
      : null,
    canEdit: userMayEdit(await currentUser()),
    canVerify: ctx.task !== null && ctx.task.status !== "done" && (await checkableFindings(ctx)) !== null,
  };
}

export type ToolActionResult = { ok: true; taskId: number } | { ok: false; error: "context" | "denied" | "title" };

/** "Add to <client>'s tasks", from a tool. */
export async function addTaskFromTool(input: {
  query: string;
  toolPath: string;
  title: string;
  priority: "high" | "medium" | "low";
}): Promise<ToolActionResult> {
  await requireSignedIn();
  const names = toolNames(input.toolPath);
  const ctx = await contextFrom(input.query);
  if (!ctx || !names) return { ok: false, error: "context" };
  try {
    await requireClientAccess(ctx.client.id, { edit: true });
  } catch {
    return { ok: false, error: "denied" };
  }
  const title = input.title.trim();
  if (title.length < 2) return { ok: false, error: "title" };
  const priority = ["high", "medium", "low"].includes(input.priority) ? input.priority : "medium";

  const values = toolTaskValues(ctx, { toolPath: `/tools/${names.slug}`, title, priority });
  const [row] = await db.insert(tasks).values(values).returning({ id: tasks.id });

  await logActivity({
    kind: "tool.task_added",
    ...toolActivityMessages("task_added", {
      toolNameEn: names.en,
      toolNameFr: names.fr,
      pagePath: ctx.pagePath,
      title: values.title,
    }),
    clientId: ctx.client.id,
    entityType: "task",
    entityId: row.id,
    dedupe: false,
  });

  revalidatePath("/tasks");
  revalidatePath(`/clients/${ctx.client.id}`);
  revalidatePath("/");
  return { ok: true, taskId: row.id };
}

/** "Mark the task done", from the tool the task sent the reader to. */
export async function completeTaskFromTool(input: {
  query: string;
  toolPath: string;
}): Promise<ToolActionResult> {
  await requireSignedIn();
  const names = toolNames(input.toolPath);
  const ctx = await contextFrom(input.query);
  if (!ctx || !ctx.task || !names) return { ok: false, error: "context" };
  try {
    await requireClientAccess(ctx.client.id, { edit: true });
  } catch {
    return { ok: false, error: "denied" };
  }
  if (ctx.task.status !== "done") {
    // The tasks page's own action: same rights check, same "who finished
    // it", same next occurrence for a recurring task.
    await setTaskStatus(ctx.task.id, "done");
    await logActivity({
      kind: "tool.task_completed",
      ...toolActivityMessages("task_completed", {
        toolNameEn: names.en,
        toolNameFr: names.fr,
        pagePath: ctx.pagePath,
        title: ctx.task.title,
        titleFr: taskTitle(ctx.task.title, "fr"),
      }),
      level: "success",
      clientId: ctx.client.id,
      entityType: "task",
      entityId: ctx.task.id,
      dedupe: false,
    });
  }
  revalidatePath(`/clients/${ctx.client.id}`);
  return { ok: true, taskId: ctx.task.id };
}

export type VerifyFromToolResult =
  | { ok: true; resolved: number; stillPresent: number; unverifiable: number; taskDone: boolean }
  | { ok: false; error: "context" | "denied" | "not_checkable" };

/**
 * "Check on the site", from the tool a finding's task sent the reader to.
 *
 * The audit page's own "I fixed it, check" (audits/issue-actions.ts,
 * lib/agent/close-loop.ts): each page is re-fetched and a finding is
 * resolved only where the problem is gone from the live HTML. Then the
 * task's pages confirmed fixed are ticked, which closes the task once
 * they all are — on evidence, not on a click.
 */
export async function verifyTaskFromTool(input: {
  query: string;
  toolPath: string;
}): Promise<VerifyFromToolResult> {
  await requireSignedIn();
  const names = toolNames(input.toolPath);
  const ctx = await contextFrom(input.query);
  if (!ctx || !ctx.task || !names) return { ok: false, error: "context" };
  try {
    await requireClientAccess(ctx.client.id, { edit: true });
  } catch {
    return { ok: false, error: "denied" };
  }
  const found = await checkableFindings(ctx);
  if (!found) return { ok: false, error: "not_checkable" };

  const outcome = await verifyIssuesFixed(found.auditId, found.ids);
  if (!outcome.ok) return { ok: false, error: outcome.reason === "gone" ? "context" : "not_checkable" };

  // Tick the task's pages whose finding is now resolved.
  const nowResolved = await db
    .select({ url: auditIssues.url })
    .from(auditIssues)
    .where(and(eq(auditIssues.auditId, found.auditId), eq(auditIssues.type, found.type), eq(auditIssues.status, "resolved")));
  const resolvedUrls = new Set(nowResolved.map((r) => r.url));
  const task = await db
    .select({ pages: tasks.pages, status: tasks.status })
    .from(tasks)
    .where(eq(tasks.id, ctx.task.id))
    .get();
  let status = task?.status ?? ctx.task.status;
  for (const page of task?.pages ?? []) {
    if (!page.done && resolvedUrls.has(page.url)) {
      const r = await setTaskPageDone(ctx.task.id, page.url, true);
      if (r.ok) status = r.status;
    }
  }
  // A task without pages is done when no open finding of its type is left.
  if (status !== "done" && (task?.pages?.length ?? 0) === 0 && (await checkableFindings(ctx)) === null) {
    await setTaskStatus(ctx.task.id, "done");
    status = "done";
  }
  const taskDone = status === "done" && ctx.task.status !== "done";

  const msg = toolActivityMessages(taskDone ? "task_completed" : "fix_checked", {
    toolNameEn: names.en,
    toolNameFr: names.fr,
    pagePath: ctx.pagePath,
    title: ctx.task.title,
    titleFr: taskTitle(ctx.task.title, "fr"),
    resolved: outcome.resolved,
    stillPresent: outcome.stillPresent.length,
  });
  await logActivity({
    kind: taskDone ? "tool.task_completed" : "tool.fix_checked",
    ...msg,
    level: taskDone ? "success" : "info",
    clientId: ctx.client.id,
    entityType: "task",
    entityId: ctx.task.id,
    dedupe: false,
  });
  revalidatePath(`/clients/${ctx.client.id}`);
  revalidatePath("/tasks");
  return {
    ok: true,
    resolved: outcome.resolved,
    stillPresent: outcome.stillPresent.length,
    unverifiable: outcome.unverifiable,
    taskDone,
  };
}
