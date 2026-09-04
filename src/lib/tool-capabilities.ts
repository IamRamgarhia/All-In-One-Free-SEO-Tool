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
 * What is connected. Derived from reality, never chosen — see
 * getConnectionMode.
 *
 * - `none` — nothing. The tools that need no model still work.
 * - `mcp`  — a chat app has connected and can read and act on the data
 *            through the MCP tools. It calls *into* this app, so it does
 *            not make the AI pages here work.
 * - `api`  — a provider key. This is what makes the AI pages here run,
 *            including unattended work: overnight audits, reports, alerts.
 * - `both` — both of the above. Nothing is unavailable.
 *
 * The two are not alternatives and one does not substitute for the other.
 * An earlier version of this comment said a subscription "writes the text
 * and we validate and apply it", which described an intended design that
 * was never built beyond apply_fix, and the UI was written as though it
 * had been.
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
 * The tool's name and one-line description, as shown on its card.
 *
 * Read out of tools-grid.tsx by the generator, so the docs and the grid
 * say the same thing by construction. Null for routes that have no card
 * — /tools/geo-swot is reached from a client page and never appears in
 * the grid, which is legitimate rather than a gap.
 */
export function copyOf(
  cap: ToolCapability | null,
): { title: string; description: string } | null {
  if (!cap || !("title" in cap)) return null;
  return { title: cap.title, description: cap.description };
}

export type ToolBadge = {
  label: string;
  /** Longer text for the tooltip / title attribute. */
  detail: string;
  tone: "free" | "chat" | "key";
};

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

  // "mcp" deliberately falls through to the same answer as "none".
  //
  // It said "Uses your chat", which implied this page would work with a
  // subscription connected. It does not: the page calls a model directly
  // and a subscription gives it nothing to call. Describing a page that
  // will fail as one that works is worse than saying nothing.
  if (mode === "none" || mode === "mcp") {
    return {
      label: "Needs a key",
      detail:
        "This page calls a model directly, so it needs an API key or Ollama. A connected chat subscription does not drive it — that works the other way round, inside your chat app.",
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
 * Whether a tool page in this app will actually run right now.
 *
 * Note the scope: this is about the page here, not about what your chat
 * app can do. A tool that needs a model needs a key, because the page
 * calls the model itself.
 */
export function worksIn(cap: ToolCapability | null, mode: ConnectionMode): boolean {
  if (!cap) return true;
  if (!cap.needsAI) return true;
  // A subscription does NOT make these work.
  //
  // This returned true for "mcp" and that was wrong. MCP runs the other
  // way round: your chat app calls into this one. It gives this app no
  // way to call a model, so a tool page that calls callAI() still has
  // nothing to call — the SEO assistant says "No active AI provider"
  // with a subscription connected and working, because it is telling the
  // truth. Only a key (or Ollama) makes the tools in these pages run.
  return mode === "api" || mode === "both";
}

export { TOOL_CAPABILITIES };
