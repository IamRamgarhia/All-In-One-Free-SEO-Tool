/**
 * Turns one line of `claude -p --output-format stream-json --verbose` into
 * the few things the chat panel shows. Everything else Claude emits
 * (hooks, rate limits, init) is dropped here so it never reaches the
 * database or the page.
 */

export type ChatEventKind =
  | "user"
  | "text"
  | "tool"
  | "tool_result"
  | "result"
  | "error"
  | "attachment"
  | "suggestion";

export type ChatEvent = { kind: ChatEventKind; data: Record<string, unknown> };

export type ParsedLine = {
  sessionId: string | null;
  events: ChatEvent[];
};

const MAX_TEXT = 8_000;

function clip(value: unknown): string {
  const s = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}\n… (${s.length - MAX_TEXT} more characters)` : s;
}

/** One-line description of a tool call, e.g. `Edit src/pages/index.astro`. */
export function describeTool(name: string, input: unknown): string {
  const i = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const pick = (k: string) => (typeof i[k] === "string" ? (i[k] as string) : "");
  const target =
    pick("file_path") || pick("path") || pick("pattern") || pick("command") || pick("description");
  return target ? `${name} ${target}` : name;
}

export function parseStreamLine(line: string): ParsedLine | null {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
  const sessionId = typeof j.session_id === "string" ? j.session_id : null;
  const events: ChatEvent[] = [];

  if (j.type === "assistant" || j.type === "user") {
    const content = (j.message as { content?: unknown } | undefined)?.content;
    if (Array.isArray(content)) {
      for (const block of content as Record<string, unknown>[]) {
        if (j.type === "assistant" && block.type === "text" && typeof block.text === "string") {
          if (block.text.trim()) events.push({ kind: "text", data: { text: clip(block.text) } });
        } else if (j.type === "assistant" && block.type === "tool_use") {
          const name = String(block.name ?? "tool");
          events.push({
            kind: "tool",
            data: { name, summary: clip(describeTool(name, block.input)).slice(0, 300) },
          });
        } else if (j.type === "user" && block.type === "tool_result") {
          const body = Array.isArray(block.content)
            ? (block.content as { text?: string }[]).map((c) => c.text ?? "").join("\n")
            : block.content;
          events.push({
            kind: "tool_result",
            data: { isError: block.is_error === true, text: clip(body) },
          });
        }
      }
    }
  } else if (j.type === "result") {
    const denials = Array.isArray(j.permission_denials)
      ? (j.permission_denials as { tool_name?: string; tool_input?: unknown }[]).map((d) =>
          describeTool(String(d.tool_name ?? "tool"), d.tool_input),
        )
      : [];
    events.push({
      kind: "result",
      data: {
        ok: j.is_error !== true,
        text: clip(j.result ?? ""),
        costUsd: typeof j.total_cost_usd === "number" ? j.total_cost_usd : null,
        turns: typeof j.num_turns === "number" ? j.num_turns : null,
        denied: denials,
      },
    });
  }

  // With --prompt-suggestions Claude ends a turn by guessing the user's
  // next message, as the terminal does for Tab-to-accept.
  if (j.type === "prompt_suggestion" && typeof j.suggestion === "string" && j.suggestion.trim()) {
    events.push({ kind: "suggestion", data: { text: j.suggestion.trim().slice(0, 500) } });
  }

  if (!sessionId && events.length === 0) return null;
  return { sessionId, events };
}
