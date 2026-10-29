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
 * Claude is not asked for permission mid-run (headless has nobody to ask).
 * It gets a fixed set instead: read anything, edit files in the folder,
 * a few read-only git commands and the project's own build/lint/test, and
 * the seo-tool MCP to read and update the task. Anything else is refused
 * by Claude and reported back as a denial in the result.
 *
 * The prompt goes in on stdin and the folder is the process's cwd, so
 * nothing the browser sent is ever part of a command line.
 */

import { HOST_AGENT_OFF_MESSAGE, isHostAgentEnabled } from "@/lib/host-agent";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { taskChatEvents, taskChats } from "@/db/schema";
import { parseStreamLine, type ChatEvent } from "./events";
import { chatModelArgs } from "./model";
import { DRAFTS_DIR } from "./drafts";
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
  // Read-only: fetch a public page, search the web. Nothing here can ask
  // for approval, so a tool that is not listed is simply refused.
  "WebFetch",
  "WebSearch",
  "mcp__seo-tool__*",
];

const SYSTEM_NOTE =
  "You are running inside the SEO tool's task panel, with no one to approve prompts. " +
  "Work only inside this folder, apart from attached draft files, which you may read and edit. If a tool is refused, say so and carry on without it. " +
  "When the task is finished, call update_task on the seo-tool MCP to mark it done. " +
  "If a seo-tool call answers 429 (too many requests), wait the number of seconds it names, then try the same call again; do not give up on the task. " +
  "Never add Co-Authored-By trailers, \"Generated with\" lines or any other attribution to commits, pull requests or files.";

/**
 * Some tasks produce work that is not part of the site: email drafts, lists
 * of link prospects, reports, research notes. Those must not land in the
 * client's repository, where they would be committed, built and deployed
 * (previews included).
 */
function workingFilesNote(taskId: number): string {
  return (
    `If the task's result is a document and not a change to the site (email drafts, prospect lists, reports, research notes, audits), ` +
    `write it to ${path.join(DRAFTS_DIR, `task-${taskId}`)} and not into the project folder, and never commit it. ` +
    `Only files that belong to the site itself go in the project. Tell the person where the file is when you finish.`
  );
}

const TURN_TIMEOUT_MS = 30 * 60_000;

export type LiveMessage =
  | { type: "event"; id: number; kind: string; data: Record<string, unknown> }
  | { type: "status"; status: "idle" | "running" | "error" };

type Listener = (m: LiveMessage) => void;

// Tasks whose process was killed on purpose, so the exit is not an error.
const stopped = new Set<number>();

export type TurnEnd = "done" | "error" | "stopped";

type Registry = {
  procs: Map<number, ChildProcess>;
  listeners: Map<number, Set<Listener>>;
  onEnd: ((taskId: number, how: TurnEnd) => void) | null;
};

// Next may load this module more than once (one copy per route bundle);
// the processes must be shared, so they live on globalThis.
const g = globalThis as unknown as { __taskChat?: Registry };
const reg: Registry = (g.__taskChat ??= { procs: new Map(), listeners: new Map(), onEnd: null });

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
    record(taskId, {
      kind: "error",
      data: { text: "The run was interrupted (the app restarted). Send a message to continue." },
    });
    setStatus(taskId, "idle");
  }
}

function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (k === "NODE_ENV" || k === "PORT" || k === "HOSTNAME" || k.startsWith("SEO_")) delete env[k];
  }
  return env;
}

export function startTurn(
  taskId: number,
  dir: string,
  message: string,
  workflow: Workflow,
): { ok: true } | { ok: false; error: string } {
  if (!isHostAgentEnabled()) return { ok: false, error: HOST_AGENT_OFF_MESSAGE };
  if (reg.procs.has(taskId)) return { ok: false, error: "Claude is already working on this task." };

  const [chat] = db.select().from(taskChats).where(eq(taskChats.taskId, taskId)).all();
  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--prompt-suggestions",
    ...chatModelArgs(),
    "--permission-mode",
    "acceptEdits",
    "--allowedTools",
    ...ALLOWED_TOOLS,
    ...extraAllowedTools(workflow),
    ...(alwaysDenied(workflow).length ? ["--disallowedTools", ...alwaysDenied(workflow)] : []),
    "--add-dir",
    DRAFTS_DIR,
    "--append-system-prompt",
    [SYSTEM_NOTE, workingFilesNote(taskId), workflowNote(workflow, taskId)]
      .filter(Boolean)
      .join("\n\n"),
    ...(chat?.sessionId ? ["--resume", chat.sessionId] : []),
  ];

  let child: ChildProcess;
  try {
    child = spawn(process.platform === "win32" ? "claude.exe" : "claude", args, {
      cwd: dir,
      env: cleanEnv(),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
  } catch (err) {
    return { ok: false, error: `Could not start Claude Code: ${(err as Error).message}` };
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

  const finish = (error: string | null, wasStopped = false) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    reg.procs.delete(taskId);
    if (buffer.trim()) handleLine(buffer);
    if (error && !gotResult) record(taskId, { kind: "error", data: { text: error } });
    setStatus(taskId, error && !gotResult ? "error" : "idle", sessionId);
    try {
      reg.onEnd?.(taskId, wasStopped ? "stopped" : error && !gotResult ? "error" : "done");
    } catch {
      // the queue must never break a finished turn
    }
  };

  const timer = setTimeout(() => {
    stopTurn(taskId);
    finish("Stopped after 30 minutes without finishing.");
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
    finish(
      missing
        ? "Claude Code was not found. Install it and make sure `claude` works in a terminal."
        : `Claude Code failed to start: ${err.message}`,
    );
  });
  child.on("close", (code) => {
    if (stopped.delete(taskId)) {
      if (!finished) record(taskId, { kind: "error", data: { text: "Stopped." } });
      finish(null, true);
      return;
    }
    finish(code === 0 ? null : `Claude stopped with exit code ${code}.${stderr ? ` ${stderr.trim()}` : ""}`);
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
  stopped.add(taskId);
  if (process.platform === "win32" && child.pid) {
    // claude starts helpers; take the whole tree down.
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" }).unref();
  } else {
    child.kill();
  }
  return true;
}
