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
 * - `none`  — nothing connected. The tools that need no model still work.
 * - `mcp`   — their Claude/ChatGPT/Cursor client connects to us. Their
 *             subscription writes the text; we validate and apply it. No
 *             per-call cost, but it only works while they are there.
 * - `api`   — a provider key. Same tools, plus everything unattended:
 *             overnight audits, scheduled reports, alerts.
 * - `both`  — a key and a connected client.
 */
export type ConnectionMode = "none" | "mcp" | "api" | "both";

/**
 * The tools grid, for counting purposes: top-level /tools/<name> only.
 *
 * The generated table covers every route, because the sidebar links to
 * plenty of pages that aren't tools. Nested pages like
 * /tools/geo-swot/c/[clientId] are the same tool seen from a client, so
 * counting them would inflate the number shown to the user.
 */
const TOOL_ROUTES = TOOL_CAPABILITIES.filter((c) =>
  /^\/tools\/[^/]+$/.test(c.route),
);

export const AI_TOOL_COUNT = TOOL_ROUTES.filter((c) => c.needsAI).length;
export const FREE_TOOL_COUNT = TOOL_ROUTES.filter((c) => !c.needsAI).length;
export const TOTAL_TOOL_COUNT = TOOL_ROUTES.length;

export const CONNECTION_MODES: {
  id: ConnectionMode;
  label: string;
  /** One line, plain language, no jargon. */
  summary: string;
}[] = [
  {
    id: "none",
    // Counted, not typed out. These numbers were written into the copy by
    // hand first, and were already wrong one commit later when the table
    // grew to cover every route rather than just the tools.
    label: "Nothing connected",
    summary: `${FREE_TOOL_COUNT} of ${TOTAL_TOOL_COUNT} tools work with no setup at all.`,
  },
  {
    id: "mcp",
    label: "My Claude / ChatGPT subscription",
    summary: `All ${TOTAL_TOOL_COUNT} tools work while you're here. Nothing is charged per use — your existing subscription does the writing.`,
  },
  {
    id: "api",
    label: "An API key",
    summary: `All ${TOTAL_TOOL_COUNT} tools, and the tool keeps working when you're away — overnight audits, scheduled reports, alerts.`,
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
const BY_ROUTE = new Map<string, ToolCapability>(
  TOOL_CAPABILITIES.map((c) => [c.route, c]),
);

/**
 * Look up a route. Accepts a full href with query or hash — the sidebar
 * and the tools grid both pass real link targets.
 */
export function capabilityOf(href: string): ToolCapability | null {
  let route = href.split(/[?#]/)[0];
  // Drop a trailing slash, but never turn "/" into "".
  if (route.length > 1) route = route.replace(/\/+$/, "");
  return BY_ROUTE.get(route) ?? null;
}

/**
 * A note on how much these two flags can be trusted, because they are
 * not equally reliable.
 *
 * The derivation asks "can this page reach code that spends credits?",
 * which OVER-approximates. /audits comes back needsAI because its page
 * embeds an add-client dialog whose action kicks off a background AI
 * audit; the audits page itself needs nothing. Composed hub pages are
 * flagged this way all the time.
 *
 * The error only runs one way. A page can be wrongly marked needsAI, but
 * never wrongly marked free — if the graph cannot reach a spend module,
 * the code cannot spend. So `needsAI === false` is sound and safe to
 * advertise, while `needsAI === true` is "might", not "will".
 *
 * That is why the sidebar tags only the free rows and says nothing about
 * the rest: the claim it makes is the one that cannot be wrong.
 */
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

export { TOOL_CAPABILITIES };
