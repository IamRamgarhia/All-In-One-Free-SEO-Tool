/**
 * What each tool needs in order to work, and what that costs the user.
 *
 * Client-safe: pure data plus pure functions, no filesystem, no DB. The
 * data is generated from the import graph (tool-capabilities.derive.ts),
 * so it cannot drift the way the six hand-written tool lists in this repo
 * already have.
 */
import { TOOL_CAPABILITIES } from "./tool-capabilities.generated";

export type ToolCapability = (typeof TOOL_CAPABILITIES)[number];

/**
 * How the user has chosen to supply AI.
 *
 * - `none`  — nothing connected. The 58 tools that need no model still work.
 * - `mcp`   — their Claude/ChatGPT/Cursor client connects to us. Their
 *             subscription writes the text; we validate and apply it. No
 *             per-call cost, but it only works while they are there.
 * - `api`   — a provider key. Same tools, plus everything unattended:
 *             overnight audits, scheduled reports, alerts.
 * - `both`  — a key and a connected client.
 */
export type ConnectionMode = "none" | "mcp" | "api" | "both";

export const CONNECTION_MODES: {
  id: ConnectionMode;
  label: string;
  /** One line, plain language, no jargon. */
  summary: string;
}[] = [
  {
    id: "none",
    label: "Nothing connected",
    summary: "58 of 96 tools work with no setup at all.",
  },
  {
    id: "mcp",
    label: "My Claude / ChatGPT subscription",
    summary:
      "All 96 tools work while you're here. Nothing is charged per use — your existing subscription does the writing.",
  },
  {
    id: "api",
    label: "An API key",
    summary:
      "All 96 tools, and the tool keeps working when you're away — overnight audits, scheduled reports, alerts.",
  },
  {
    id: "both",
    label: "Both",
    summary:
      "Your subscription handles the writing you watch; the key covers what runs overnight.",
  },
];

// Explicitly widened: `as const` in the generated file narrows slug to a
// literal union, which would make lookups by an arbitrary href a type error.
const BY_SLUG = new Map<string, ToolCapability>(
  TOOL_CAPABILITIES.map((c) => [c.slug, c]),
);

/** Accepts "health-check" or "/tools/health-check". */
export function capabilityOf(slugOrHref: string): ToolCapability | null {
  const slug = slugOrHref.startsWith("/tools/")
    ? slugOrHref.slice("/tools/".length).split(/[/?#]/)[0]
    : slugOrHref;
  return BY_SLUG.get(slug) ?? null;
}

export type ToolBadge = {
  label: string;
  /** Longer text for the tooltip / title attribute. */
  detail: string;
  tone: "free" | "chat" | "key";
};

/**
 * The badge to show on a tool, given how the user is connected.
 *
 * The point of the "Free" badge is the question users actually ask: will
 * this cost me anything? So it is stated on the tools that cost nothing,
 * not only on the ones that do.
 */
export function badgeFor(
  cap: ToolCapability | null,
  mode: ConnectionMode,
): ToolBadge | null {
  if (!cap) return null;

  if (!cap.needsAI) {
    return cap.usesBrowser
      ? {
          label: "Free · runs locally",
          detail:
            "No AI credits. Runs a browser on this machine, so it costs you nothing per use.",
          tone: "free",
        }
      : {
          label: "Free",
          detail: "No AI credits — this one never calls a model.",
          tone: "free",
        };
  }

  if (mode === "mcp") {
    return {
      label: "Uses your chat",
      detail:
        "Your Claude or ChatGPT subscription writes the text; this app checks and applies it. No per-use charge.",
      tone: "chat",
    };
  }

  if (mode === "none") {
    return {
      label: "Needs AI",
      detail:
        "Connect a subscription or an API key to use this. Everything else still works without one.",
      tone: "key",
    };
  }

  return {
    label: "Uses credits",
    detail: "Calls your AI provider, so this one costs a little per run.",
    tone: "key",
  };
}

/**
 * Whether a tool is usable right now.
 *
 * Deliberately generous: a subscription drives the AI tools just as well
 * as a key does. The only thing a key buys that a subscription cannot is
 * work that happens while nobody is watching, and no tool on the grid
 * does that — the background jobs do, and they are not tools.
 */
export function worksIn(cap: ToolCapability | null, mode: ConnectionMode): boolean {
  if (!cap) return true;
  if (!cap.needsAI) return true;
  return mode !== "none";
}

export const AI_TOOL_COUNT = TOOL_CAPABILITIES.filter((c) => c.needsAI).length;
export const FREE_TOOL_COUNT = TOOL_CAPABILITIES.filter((c) => !c.needsAI).length;
export const TOTAL_TOOL_COUNT = TOOL_CAPABILITIES.length;

export { TOOL_CAPABILITIES };
