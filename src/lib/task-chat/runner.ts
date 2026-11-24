/**
 * Runs Claude Code headless for one task and keeps the conversation.
 *
 * One `claude -p --output-format stream-json` process per message, in the
 * client's project folder. The thread survives because Claude hands back a
 * session id and `--resume` picks it up again, so the next message (or the
 * next day, or a server restart) continues where it stopped. What the page
 * shows is stored in task_chat_events; the live process only exists while
 * a turn is running.
 *
 * Nothing starts on its own: a turn begins because an owner or a manager
 * pressed a button (the chat, or the queue for that client), and only for
 * a client whose switch is on (lib/host-agent).
 *
 * Claude is not asked for permission mid-run (headless has nobody to ask).
 * It gets a fixed set instead: read anything, edit files in the folder,
 * a few read-only git commands and the project's own build/lint/test. With
 * a GitHub repository set, it may also branch, commit and open a pull
 * request, never push to the base branch, rewrite history or merge
 * (lib/task-chat/workflow). Anything else is refused by Claude and reported
 * back as a denial in the result.
 *
 * The prompt goes in on stdin and the folder is the process's cwd, so
 * nothing the browser sent is ever part of a command line.
 *
 * Ported from the original author's runner (a9d65df, 33929a1, 411887c,
 * 8fb6972), minus the MCP task tools, the model picker and prompt
 * suggestions: the task's full prompt is the first message instead.
 */

import { mkdirSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { taskChatEvents, taskChats } from "@/db/schema";
import { codeAgentState } from "@/lib/host-agent";
import { parseStreamLine, type ChatEvent } from "./events";
import { taskDocumentsDir, workingFilesNote } from "./documents";
import { alwaysDenied, extraAllowedTools, workflowNote, type Workflow } from "./workflow";

export const ALLOWED_TOOLS = [
  "Read",
  "Glob",
  "Grep",
  "Edit",
  "Write",
  "Bash(git status:*)",
  "Bash(git diff:*)",
  "Bash(git log:*)",
  "Bash(npm run build:*)",
  "Bash(npm run lint:*)",
  "Bash(npm test:*)",
  "Bash(pnpm build:*)",
  "Bash(pnpm lint:*)",
  "Bash(pnpm test:*)",
  // Read-only: fetch a public page, search the web.
  "WebFetch",
  "WebSearch",
];

function systemNote(locale: string): string {
  return [
    "You are running inside the SEO tool's task panel, with no one to approve prompts.",
    "Work only inside this folder, apart from the documents folder named below. If a tool is refused, say so and carry on without it.",
    "When the task is finished, say what you changed and how you checked it; a person reviews it and marks the task done in the tool.",
    "Never add Co-Authored-By trailers, \"Generated with\" lines or any other attribution to commits, pull requests or files.",
    locale.startsWith("fr") ? "Answer in French, addressing the person as « vous »." : "",
  ]
    .filter(Boolean)
    .join(" ");
}

const TURN_TIMEOUT_MS = 30 * 60_000;

/** Why a turn ended badly; the chat words it (clientCode.chat.errors). */
export type TurnErrorCode =
  | "interrupted"
  | "stopped"
  | "timeout"
  | "claude_missing"
  | "start_failed"
  | "exit"
  | "switched_off";

export type LiveMessage =
  | { type: "event"; id: number; kind: string; data: Record<string, unknown> }
  | { type: "status"; status: "idle" | "running" | "error" };

type Listener = (m: LiveMessage) => void;

export type TurnEnd = "done" | "error" | "stopped";

type Registry = {
  procs: Map<number, ChildProcess>;
  listeners: Map<number, Set<Listener>>;
  stopped: Set<number>;
  onEnd: ((taskId: number, how: TurnEnd) => void) | null;
};

// Next may load this module more than once (one copy per route bundle);
// the processes must be shared, so they live on globalThis.
const g = globalThis as unknown as { __taskChat?: Registry };
const reg: Registry = (g.__taskChat ??= {
  procs: new Map(),
  listeners: new Map(),
  stopped: new Set(),
  onEnd: null,
});

function emit(taskId: number, m: LiveMessage) {
  for (const l of reg.listeners.get(taskId) ?? []) {
    try {
      l(m);
    } catch {
      // a closed stream must not stop the others
    }
  }
}

export function subscribe(taskId: number, fn: Listener): () => void {
  let set = reg.listeners.get(taskId);
  if (!set) reg.listeners.set(taskId, (set = new Set()));
  set.add(fn);
  return () => {
    set.delete(fn);
    if (set.size === 0) reg.listeners.delete(taskId);
  };
}

export function isRunning(taskId: number): boolean {
  return reg.procs.has(taskId);
}

export function record(taskId: number, e: ChatEvent) {
  const [row] = db
    .insert(taskChatEvents)
    .values({ taskId, kind: e.kind, data: e.data })
    .returning({ id: taskChatEvents.id })
    .all();
  emit(taskId, { type: "event", id: row.id, kind: e.kind, data: e.data });
}

function recordError(taskId: number, code: TurnErrorCode, detail?: string) {
  record(taskId, { kind: "error", data: { code, ...(detail ? { detail: detail.slice(0, 600) } : {}) } });
}

function setStatus(taskId: number, status: "idle" | "running" | "error", sessionId?: string | null) {
  db.insert(taskChats)
    .values({ taskId, status, sessionId: sessionId ?? null })
    .onConflictDoUpdate({
      target: taskChats.taskId,
      set: {
        status,
        updatedAt: new Date(),
        ...(sessionId ? { sessionId } : {}),
      },
    })
    .run();
  emit(taskId, { type: "status", status });
}

/** The queue hears about every finished turn here. */
export function setTurnEndHook(fn: (taskId: number, how: TurnEnd) => void) {
  reg.onEnd = fn;
}

/** A process that died with the server leaves "running" behind. */
export function reconcile(taskId: number): void {
  const [chat] = db.select().from(taskChats).where(eq(taskChats.taskId, taskId)).all();
  if (chat?.status === "running" && !reg.procs.has(taskId)) {
    recordError(taskId, "interrupted");
    setStatus(taskId, "idle");
  }
}

function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    // The app's own settings (database path, secrets) stay out of the agent.
    if (
      k === "NODE_ENV" ||
      k === "PORT" ||
      k === "HOSTNAME" ||
      k === "APP_PASSWORD" ||
      k.startsWith("SEO_") ||
      k.startsWith("NEXT_")
    ) {
      delete env[k];
    }
  }
  return env;
}

export type TurnTarget = { clientId: number; dir: string; workflow: Workflow };

/** The command-line arguments of one turn. Exported for the tests. */
export function turnArgs(
  taskId: number,
  target: TurnTarget,
  locale: string,
  sessionId: string | null,
): string[] | null {
  const docs = workingFilesNote(taskId, target.dir);
  if (!docs) return null;
  const denied = alwaysDenied(target.workflow);
  return [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    // Only the permissions below count: no settings file is read, neither
    // the person's own nor the client's repository's (.claude/settings.json
    // in a repo we did not write could allow anything), and no MCP server
    // the repository declares is started.
    "--setting-sources",
    "",
    "--strict-mcp-config",
    "--permission-mode",
    "acceptEdits",
    "--allowedTools",
    ...ALLOWED_TOOLS,
    ...extraAllowedTools(target.workflow),
    ...(denied.length ? ["--disallowedTools", ...denied] : []),
    "--add-dir",
    taskDocumentsDir(taskId),
    "--append-system-prompt",
    [systemNote(locale), docs, workflowNote(target.workflow, taskId)].filter(Boolean).join("\n\n"),
    ...(sessionId ? ["--resume", sessionId] : []),
  ];
}

export function startTurn(
  taskId: number,
  target: TurnTarget,
  message: string,
  locale: string,
): { ok: true } | { ok: false; code: "switched_off" | "busy" | "folder_holds_documents" | "start_failed" } {
  if (!codeAgentState(target.clientId).enabled) return { ok: false, code: "switched_off" };
  if (reg.procs.has(taskId)) return { ok: false, code: "busy" };

  const [chat] = db.select().from(taskChats).where(eq(taskChats.taskId, taskId)).all();
  const args = turnArgs(taskId, target, locale, chat?.sessionId ?? null);
  if (!args) return { ok: false, code: "folder_holds_documents" };
  try {
    mkdirSync(taskDocumentsDir(taskId), { recursive: true });
  } catch {
    return { ok: false, code: "start_failed" };
  }

  let child: ChildProcess;
  try {
    child = spawn(process.platform === "win32" ? "claude.exe" : "claude", args, {
      cwd: target.dir,
      env: cleanEnv(),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
  } catch {
    return { ok: false, code: "start_failed" };
  }
  reg.procs.set(taskId, child);

  record(taskId, { kind: "user", data: { text: message } });
  setStatus(taskId, "running");

  let sessionId: string | null = chat?.sessionId ?? null;
  let gotResult = false;
  let buffer = "";
  let stderr = "";
  let finished = false;

  const handleLine = (line: string) => {
    const parsed = parseStreamLine(line);
    if (!parsed) return;
    if (parsed.sessionId) sessionId = parsed.sessionId;
    for (const e of parsed.events) {
      if (e.kind === "result") gotResult = true;
      record(taskId, e);
    }
  };

  const finish = (error: { code: TurnErrorCode; detail?: string } | null, wasStopped = false) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    reg.procs.delete(taskId);
    if (buffer.trim()) handleLine(buffer);
    const failed = Boolean(error) && !gotResult;
    if (error && (failed || error.code === "stopped")) recordError(taskId, error.code, error.detail);
    setStatus(taskId, failed && !wasStopped ? "error" : "idle", sessionId);
    try {
      reg.onEnd?.(taskId, wasStopped ? "stopped" : failed ? "error" : "done");
    } catch {
      // the queue must never break a finished turn
    }
  };

  const timer = setTimeout(() => {
    stopTurn(taskId);
    finish({ code: "timeout" });
  }, TURN_TIMEOUT_MS);

  child.stdout!.setEncoding("utf8");
  child.stdout!.on("data", (chunk: string) => {
    buffer += chunk;
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      handleLine(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
    }
  });
  child.stderr!.setEncoding("utf8");
  child.stderr!.on("data", (c: string) => {
    stderr = (stderr + c).slice(-600);
  });
  child.on("error", (err) => {
    const missing = (err as NodeJS.ErrnoException).code === "ENOENT";
    finish(missing ? { code: "claude_missing" } : { code: "start_failed", detail: err.message });
  });
  child.on("close", (code) => {
    if (reg.stopped.delete(taskId)) {
      finish({ code: "stopped" }, true);
      return;
    }
    finish(code === 0 ? null : { code: "exit", detail: `${code}${stderr ? ` — ${stderr.trim()}` : ""}` });
  });

  child.stdin!.on("error", () => {
    // the process died before reading the prompt; 'close' reports it
  });
  child.stdin!.end(message);
  return { ok: true };
}

export function stopTurn(taskId: number): boolean {
  const child = reg.procs.get(taskId);
  if (!child) return false;
  reg.stopped.add(taskId);
  if (process.platform === "win32" && child.pid) {
    // claude starts helpers; take the whole tree down.
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" }).unref();
  } else {
    child.kill();
  }
  return true;
}
