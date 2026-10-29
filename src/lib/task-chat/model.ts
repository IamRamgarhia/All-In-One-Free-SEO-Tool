/**
 * Which Claude model, and how hard it thinks, for the task chats.
 *
 * Two workspace settings. "default" passes nothing, so Claude Code keeps
 * using whatever the person has set up for it; anything else is handed to
 * `claude --model` / `--effort` on the next turn. A turn already running
 * is not touched.
 */

import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { workspaceSettings } from "@/db/schema";

export const CHAT_MODELS = ["default", "fable", "opus", "sonnet", "haiku"] as const;
export const CHAT_EFFORTS = ["default", "low", "medium", "high", "xhigh", "max"] as const;

export type ChatModel = (typeof CHAT_MODELS)[number];
export type ChatEffort = (typeof CHAT_EFFORTS)[number];

export type ChatModelSettings = { model: ChatModel; effort: ChatEffort };

function pick<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export function normalizeChatModel(input: { model?: unknown; effort?: unknown }): ChatModelSettings {
  return {
    model: pick(CHAT_MODELS, input.model, "default"),
    effort: pick(CHAT_EFFORTS, input.effort, "default"),
  };
}

/** Synchronous, like the rest of the runner's database reads. */
export function readChatModel(): ChatModelSettings {
  try {
    const rows = db
      .select()
      .from(workspaceSettings)
      .where(inArray(workspaceSettings.key, ["task_chat.model", "task_chat.effort"]))
      .all();
    const val = (k: string) => rows.find((r) => r.key === k)?.value;
    return normalizeChatModel({ model: val("task_chat.model"), effort: val("task_chat.effort") });
  } catch {
    return { model: "default", effort: "default" };
  }
}

export function saveChatModel(input: { model?: unknown; effort?: unknown }): ChatModelSettings {
  const next = normalizeChatModel(input);
  for (const [key, value] of [
    ["task_chat.model", next.model],
    ["task_chat.effort", next.effort],
  ] as const) {
    db.insert(workspaceSettings)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: workspaceSettings.key, set: { value, updatedAt: new Date() } })
      .run();
  }
  return next;
}

/** The command-line flags for these settings. */
export function chatModelArgs(s: ChatModelSettings = readChatModel()): string[] {
  return [
    ...(s.model !== "default" ? ["--model", s.model] : []),
    ...(s.effort !== "default" ? ["--effort", s.effort] : []),
  ];
}
