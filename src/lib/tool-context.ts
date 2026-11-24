/**
 * The client a tool was opened for, read from its address.
 *
 * A tool opened from a task, a finding or a client's file arrives at
 * `/tools/<slug>?clientId=2&url=https://site/page&task=41&finding=missing_title`.
 * The page is pre-filled from `url`; the banner above the tool says whose
 * file this is, leads back to it, and lets the reader add a task or close
 * the one they came from — so the work done in the tool lands in the
 * client's file instead of on a page nobody sees again.
 *
 * `client=` is read too, as a synonym of `clientId=` (the name every
 * existing link and `ClientIdField` use).
 *
 * The parser is pure. The check that the reader may see that client is
 * `resolveToolContext`, given the visible ids so it can be tested without
 * a database: a client they cannot see is treated as no client at all,
 * not as an error — 404, not 403, as everywhere else (client-scope.ts).
 */

import { safeHttpUrl } from "./finding-tool-map";

export type ToolContextParams = {
  clientId: number | null;
  url: string | null;
  taskId: number | null;
  finding: string | null;
};

type ParamSource =
  | URLSearchParams
  | { get(name: string): string | null }
  | Record<string, string | string[] | undefined>;

function read(source: ParamSource, name: string): string | null {
  if (typeof (source as URLSearchParams).get === "function") {
    return (source as URLSearchParams).get(name);
  }
  const v = (source as Record<string, string | string[] | undefined>)[name];
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function positiveInt(raw: string | null): number | null {
  if (!raw || !/^\d{1,9}$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 ? n : null;
}

/** What the address says, cleaned: a bad id or a non-http(s) URL is dropped. */
export function parseToolContext(source: ParamSource): ToolContextParams {
  const finding = read(source, "finding");
  return {
    clientId: positiveInt(read(source, "clientId")) ?? positiveInt(read(source, "client")),
    url: safeHttpUrl(read(source, "url") ?? ""),
    taskId: positiveInt(read(source, "task")),
    finding: finding && /^[a-z0-9_:.-]{1,120}$/i.test(finding) ? finding : null,
  };
}

export type ContextClient = { id: number; name: string; url: string };
export type ContextTask = {
  id: number;
  clientId: number;
  title: string;
  status: string;
  /** `audit:<type>`, `seomator:…`, `geo:…` for a task made from a finding. */
  sourceRef?: string | null;
};

export type ResolvedToolContext = {
  client: ContextClient;
  /** The page from the address, or the client's site when none was given. */
  url: string;
  /** "/contact", "/" … for display. */
  pagePath: string;
  /** The task the tool was opened from, when it belongs to this client. */
  task: ContextTask | null;
  finding: string | null;
};

/**
 * The context to show, or null.
 *
 * `visibleIds` is `scopedClientIds()`: null means every client. A client
 * outside it, or unknown, gives null. A task of another client is
 * dropped, not trusted: the banner would otherwise close somebody else's
 * task from this client's file.
 */
export async function resolveToolContext(
  params: ToolContextParams,
  deps: {
    visibleIds: number[] | null;
    loadClient: (id: number) => Promise<ContextClient | null>;
    loadTask: (id: number) => Promise<ContextTask | null>;
  },
): Promise<ResolvedToolContext | null> {
  const { clientId } = params;
  if (clientId === null) return null;
  if (deps.visibleIds !== null && !deps.visibleIds.includes(clientId)) return null;
  const client = await deps.loadClient(clientId);
  if (!client) return null;

  let task: ContextTask | null = null;
  if (params.taskId !== null) {
    const t = await deps.loadTask(params.taskId);
    task = t && t.clientId === client.id ? t : null;
  }

  const url = params.url ?? safeHttpUrl(client.url) ?? client.url;
  return { client, url, pagePath: pagePathOf(url), task, finding: params.finding };
}

/** The path of a URL for display, with its query; the URL itself when it does not parse. */
export function pagePathOf(url: string): string {
  try {
    const u = new URL(url);
    const path = `${u.pathname || "/"}${u.search}`;
    return path.length > 80 ? `${path.slice(0, 77)}…` : path;
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------
// What the tool writes into the client's file
// ---------------------------------------------------------------------

/** A catalogue title without the star some carry for "recommended". */
export function cleanToolName(title: string | null | undefined, fallback: string): string {
  const t = (title ?? "").replace(/\s*⭐\s*/g, " ").trim();
  return t || fallback;
}

export type ToolTaskInput = {
  toolPath: string;
  title: string;
  priority: "high" | "medium" | "low";
};

/**
 * The row of a task added from a tool: the client's, about the page the
 * tool was opened on, with the tool to go back to (without the query, so
 * the task row adds the context of its own), and the finding it came
 * from when there was one (finding-tool-map.ts `findingFromSourceRef`).
 */
export function toolTaskValues(ctx: ResolvedToolContext, input: ToolTaskInput) {
  const toolPath = input.toolPath.split(/[?#]/)[0];
  return {
    clientId: ctx.client.id,
    title: input.title.trim().slice(0, 200),
    priority: input.priority,
    status: "todo" as const,
    toolPath,
    source: "tool",
    // `tool:<slug>` or `tool:<slug>|<finding>`. Never `audit:` / `seomator:`:
    // the next audit rewrites and prunes the tasks it generated under those
    // prefixes, and this one is the reader's own.
    sourceRef: `tool:${toolPath.replace(/^\/tools\//, "")}${ctx.finding ? `|${ctx.finding}` : ""}`,
    pages: [{ url: ctx.url, done: false }],
  };
}

const NBSP = " ";

/** The journal line, in both languages (logActivity keeps the workspace's). */
export function toolActivityMessages(
  what: "task_added" | "task_completed" | "fix_checked",
  p: {
    toolNameEn: string;
    toolNameFr: string;
    pagePath: string;
    title: string;
    titleFr?: string;
    /** fix_checked / task_completed after a check: pages confirmed fixed, pages still wrong. */
    resolved?: number;
    stillPresent?: number;
  },
): { message: string; messageFr: string } {
  const titleFr = p.titleFr ?? p.title;
  const en = `Tool ${p.toolNameEn} used on ${p.pagePath}`;
  const fr = `Outil ${p.toolNameFr} utilisé sur ${p.pagePath}${NBSP}:`;
  // French takes the singular for 0 and 1.
  const sFr = (n: number) => (n > 1 ? "s" : "");
  const sEn = (n: number) => (n === 1 ? "" : "s");
  const r = p.resolved ?? 0;
  const still = p.stillPresent ?? 0;
  const checked =
    p.resolved !== undefined
      ? {
          en: `checked on the site, ${r} page${sEn(r)} confirmed fixed, ${still} still to fix`,
          fr: `vérifié sur le site, ${r}${NBSP}page${sFr(r)} confirmée${sFr(r)} corrigée${sFr(r)}, ${still}${NBSP}encore à corriger`,
        }
      : null;
  if (what === "task_added") {
    return {
      message: `${en}: task added (“${p.title}”)`,
      messageFr: `${fr} tâche ajoutée («${NBSP}${titleFr}${NBSP}»)`,
    };
  }
  if (what === "fix_checked") {
    return {
      message: `${en}: ${checked?.en ?? "checked on the site"} (“${p.title}”)`,
      messageFr: `${fr} ${checked?.fr ?? "vérifié sur le site"} («${NBSP}${titleFr}${NBSP}»)`,
    };
  }
  return {
    message: `${en}: task completed${checked ? `, ${checked.en}` : ""} (“${p.title}”)`,
    messageFr: `${fr} tâche terminée${checked ? `, ${checked.fr}` : ""} («${NBSP}${titleFr}${NBSP}»)`,
  };
}
