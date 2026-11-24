import { describe, expect, it } from "vitest";
import { describeTool, parseStreamLine } from "./events";

const line = (o: unknown) => JSON.stringify(o);

describe("parseStreamLine", () => {
  it("ignores lines that are not JSON and noise events", () => {
    expect(parseStreamLine("not json")).toBeNull();
    expect(parseStreamLine(line({ type: "rate_limit_event" }))).toBeNull();
  });

  it("keeps the session id from an init line", () => {
    const r = parseStreamLine(line({ type: "system", subtype: "init", session_id: "abc" }));
    expect(r).toEqual({ sessionId: "abc", events: [] });
  });

  it("reads assistant text and tool calls", () => {
    const r = parseStreamLine(
      line({
        type: "assistant",
        session_id: "s",
        message: {
          content: [
            { type: "text", text: "On it." },
            { type: "tool_use", name: "Edit", input: { file_path: "src/a.astro" } },
          ],
        },
      }),
    );
    expect(r?.events).toEqual([
      { kind: "text", data: { text: "On it." } },
      { kind: "tool", data: { name: "Edit", summary: "Edit src/a.astro" } },
    ]);
  });

  it("flattens tool results and flags errors", () => {
    const r = parseStreamLine(
      line({
        type: "user",
        message: {
          content: [{ type: "tool_result", is_error: true, content: [{ text: "boom" }] }],
        },
      }),
    );
    expect(r?.events[0]).toEqual({ kind: "tool_result", data: { isError: true, text: "boom" } });
  });

  it("turns the final result into one event with denied tools", () => {
    const r = parseStreamLine(
      line({
        type: "result",
        is_error: false,
        result: "Done",
        total_cost_usd: 0.04,
        num_turns: 3,
        permission_denials: [{ tool_name: "Bash", tool_input: { command: "rm -rf x" } }],
      }),
    );
    expect(r?.events[0]).toEqual({
      kind: "result",
      data: { ok: true, text: "Done", costUsd: 0.04, turns: 3, denied: ["Bash rm -rf x"] },
    });
  });

  it("trims very long output", () => {
    const r = parseStreamLine(
      line({ type: "assistant", message: { content: [{ type: "text", text: "x".repeat(20_000) }] } }),
    );
    expect(String(r?.events[0].data.text).length).toBeLessThan(8_100);
  });
});

describe("prompt suggestions", () => {
  it("turns the predicted next prompt into a suggestion event", () => {
    const r = parseStreamLine(
      line({ type: "prompt_suggestion", suggestion: "  cat hello.txt ", session_id: "s1" }),
    );
    expect(r?.events).toEqual([{ kind: "suggestion", data: { text: "cat hello.txt" } }]);
  });

  it("ignores an empty one", () => {
    expect(parseStreamLine(line({ type: "prompt_suggestion", suggestion: "  " }))).toBeNull();
  });
});

describe("describeTool", () => {
  it("falls back to the bare name", () => {
    expect(describeTool("Glob", {})).toBe("Glob");
  });
});
