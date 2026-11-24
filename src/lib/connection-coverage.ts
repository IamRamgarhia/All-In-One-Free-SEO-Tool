/**
 * Which tools each connection unlocks, by name.
 *
 * The screens explaining a key versus a chat subscription stated a count
 * and stopped ("the 33 AI tools in this app"). That answers the wrong
 * question: someone deciding what to connect wants to know whether the
 * tool they came for is in the list. And the count was too high. It
 * counted every page that can reach a model, including the ones whose
 * main job runs without one, so it named working tools as unavailable.
 *
 * Here everything comes from the catalogue in Settings → Tools
 * (tool-catalog.ts), and each tool is classed by the same rule its card
 * uses there (aiNeedOf below, used by both), so a screen cannot promise a
 * tool the catalogue says needs setup, or the reverse. The numbers shown
 * next to a list are that list's length.
 *
 * A chat subscription (MCP) unlocks none of these pages: MCP runs the
 * other way round, the chat app calls into this one and gives it no
 * model to call. The screens say so rather than list it as an option.
 *
 * Client-safe: pure functions over generated data.
 */
import { aiUsageOf, capabilityOf } from "./tool-capabilities";
import { MISSION_CATEGORIES, TOOL_CATALOG, type MissionCategoryId } from "./tool-catalog";
import { familyOf } from "./tool-families";
import { toolReadiness } from "./tool-readiness";

/**
 * How much a catalogue card depends on an AI key.
 *   required — the tool does not run without a key (confirmed, not
 *              merely derived: see tool-readiness.ts);
 *   partial  — it runs, and one feature (or one tab) uses a model;
 *   none     — no model anywhere.
 */
export type AiNeed = "none" | "partial" | "required";

export function aiNeedOf(href: string): AiNeed {
  const cap = capabilityOf(href);
  const usage = cap ? aiUsageOf(cap) : "none";
  const required =
    usage === "required" && toolReadiness({ href, hasAiKey: false }).state === "blocked";
  if (required) return "required";
  // A family is judged by its entry; its other tabs only make it "partial".
  const tabs = (familyOf(href)?.family.members ?? []).map((m) => capabilityOf(m.href));
  const someAi = tabs.some((c) => c && aiUsageOf(c) !== "none");
  return usage === "none" && !someAi ? "none" : "partial";
}

export type CoveredTool = { href: string; category: MissionCategoryId };

export type ConnectionCoverage = {
  /** Will not run without an AI key or Ollama. */
  needsKey: CoveredTool[];
  /** Run without a key; one feature on them uses it. */
  partlyKey: CoveredTool[];
  /** Never call a model. */
  noAi: CoveredTool[];
  /** Have no data until Google Search Console is connected. */
  needsGsc: CoveredTool[];
  /** Every card in the catalogue. */
  total: number;
};

let cached: ConnectionCoverage | null = null;

export function connectionCoverage(): ConnectionCoverage {
  if (cached) return cached;
  const out: ConnectionCoverage = {
    needsKey: [],
    partlyKey: [],
    noAi: [],
    needsGsc: [],
    total: TOOL_CATALOG.length,
  };
  for (const e of TOOL_CATALOG) {
    const tool = { href: e.href, category: e.category };
    const need = aiNeedOf(e.href);
    (need === "required" ? out.needsKey : need === "partial" ? out.partlyKey : out.noAi).push(tool);
    if (e.needs === "gsc") out.needsGsc.push(tool);
  }
  cached = out;
  return out;
}

/** A list grouped by mission, in the catalogue's own order. */
export function groupByMission(
  tools: readonly CoveredTool[],
): { id: MissionCategoryId; tools: CoveredTool[] }[] {
  return MISSION_CATEGORIES.map((id) => ({
    id,
    tools: tools.filter((t) => t.category === id),
  })).filter((g) => g.tools.length > 0);
}
