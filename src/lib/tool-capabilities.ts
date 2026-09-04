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
 * Dynamic routes, matched by shape.
 *
 * The generated table stores Next's own route patterns —
 * "/content/c/[clientId]" — while every link in the app is a real URL,
 * "/content/c/4". An exact-map lookup missed all of them. Nothing threw;
 * the caller just got null and treated the route as unknown, which is
 * how a third of the per-client rail (where nearly every link has a
 * client id in the path) ended up with no readiness dot at all.
 *
 * Sorted longest-first so a more specific pattern wins over a shorter
 * one that also matches.
 */
const DYNAMIC_ROUTES = TOOL_CAPABILITIES.filter((c) => c.route.includes("["))
  .map((c) => ({
    cap: c,
    re: new RegExp(
      "^" +
        c.route
          .split("/")
          .map((seg) => {
            if (/^\[\.\.\..+\]$/.test(seg)) return ".+"; // catch-all [...slug]
            if (/^\[.+\]$/.test(seg)) return "[^/]+";
            return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          })
          .join("/") +
        "$",
    ),
  }))
  .sort((a, b) => b.cap.route.length - a.cap.route.length);

/**
 * Look up a route. Accepts a full href with query or hash — the sidebar
 * and the tools grid both pass real link targets.
 */
export function capabilityOf(href: string): ToolCapability | null {
  let route = href.split(/[?#]/)[0];
  // Drop a trailing slash, but never turn "/" into "".
  if (route.length > 1) route = route.replace(/\/+$/, "");
  const exact = BY_ROUTE.get(route);
  if (exact) return exact;
  return DYNAMIC_ROUTES.find((d) => d.re.test(route))?.cap ?? null;
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

/**
 * Routes where "needs AI" is known to be true, not merely derived.
 *
 * The derivation over-approximates: /audits comes back needing AI only
 * because its page embeds an add-client dialog. So anywhere we make a
 * negative claim — a warning banner, an amber dot — it has to come from
 * this list rather than from the flag, or we would tell people a page is
 * broken when it works fine.
 *
 * /tools/<name> is included wholesale: those pages are single-purpose,
 * so the flag is accurate there.
 */
const KNOWN_AI_PAGES = new Set([
  "/agent",
  "/blog",
  "/seo-chat",
  "/ai-visibility",
  "/content",
  // Verified by reading the path, not by trusting the flag: the page's
  // only action calls startAiAudit -> runAiSiteAudit -> callAI. Without
  // a key it fails at the point the user presses the button, which is
  // the worst place to find out.
  "/clients/[id]/ai-audit",
]);

/**
 * The other side of the same coin: section hubs the derivation flags as
 * needing AI that provably do not.
 *
 * These are the pages the per-client rail links to first — "Run a full
 * audit", "Tracked keywords", "Backlink hub" — and they came back
 * `unknown`, so the rail drew no dot on ten of its forty-three rows. A
 * third of a panel whose whole job is to say "yes you can click this"
 * saying nothing at all reads as the dots being broken, which is how
 * they were reported the first two times.
 *
 * They are flagged because the import graph is reachability-based and
 * these pages compose shared chrome — the add-client dialog, mostly —
 * that can reach a spend module. The page's own work never does.
 *
 * Verified, not assumed: nothing under each of these route folders
 * imports ai-call or any @/lib/ai-* module. tool-capabilities.test.ts
 * re-runs that check, so if AI is ever added under one of these routes
 * the build fails instead of the dot quietly starting to lie.
 */
const KNOWN_FREE_PAGES = new Set([
  "/audits",
  "/backlinks",
  "/citations",
  "/content-decay",
  "/keywords",
  "/local-grid",
  "/local-rank",
  "/topic-clusters",
  "/clients/[id]/onboarding",
]);

/** The route folders KNOWN_FREE_PAGES claims are AI-free, for the test. */
export const KNOWN_FREE_PAGE_ROUTES = [...KNOWN_FREE_PAGES];

/**
 * Will this page run with no AI key? True only when we can say so
 * soundly — either the derivation says it needs nothing (which never
 * over-states), or it is on the hand-verified list above.
 */
export function isKnownFreePage(route: string): boolean {
  const cap = capabilityOf(route);
  if (!cap) return false;
  if (!cap.needsAI) return true;
  const base = cap.route.replace(/\/c\/\[clientId\]$/, "");
  return KNOWN_FREE_PAGES.has(base);
}

export function isKnownAiPage(route: string): boolean {
  const cap = capabilityOf(route);
  if (!cap?.needsAI) return false;
  // Test the resolved PATTERN, not the href we were handed. Callers pass
  // real URLs — "/content/c/4", "/tools/geo-swot/c/4" — and testing those
  // against "/tools/<name>" failed on every per-client view, so the page
  // you reach from a client was silently treated as unknown while the
  // same page reached from the sidebar was not.
  const pattern = cap.route;
  // A per-client view is the same tool, seen from a client.
  const base = pattern.replace(/\/c\/\[clientId\]$/, "");
  return /^\/tools\/[^/]+$/.test(base) || KNOWN_AI_PAGES.has(base);
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
