/**
 * One answer to "can I click this right now?", for every place that
 * shows a tool.
 *
 * There are four of those places — the main sidebar, the per-client
 * rail, the per-client launcher cards, and the tools grid — and the
 * rule had already been written twice, differently. The sidebar said
 * nothing when it was unsure; the launcher rail painted green in the
 * same case. So the same tool got a green dot in one panel and no dot
 * in another, which reads as one of the two being broken.
 *
 * CLAUDE.md's fourth standing rule: never add a second hardcoded list of
 * something that already exists. Same applies to a rule.
 *
 * Client-safe — pure functions over generated data, no DB, no fs.
 */
import {
  capabilityOf,
  isKnownAiPage,
  isKnownFreePage,
} from "./tool-capabilities";

/** An integration the client has to connect before a tool can run. */
export type ToolNeed = "gsc" | "gbp" | "ga4" | "wp-bridge";

export const NEEDS_HINTS: Record<ToolNeed, string> = {
  gsc: "Connect Google Search Console first",
  gbp: "Add the client's GBP URL on this page first",
  ga4: "Connect Google Analytics 4 first",
  "wp-bridge": "Install the WordPress SEO Tool Bridge plugin first",
};

/** Where the user goes to clear the blocker. Null when it is per-client. */
export const NEEDS_FIX_HREF: Record<ToolNeed, string | null> = {
  gsc: "/settings/google",
  ga4: "/settings/google",
  gbp: null, // Lives on the client page itself.
  "wp-bridge": "/settings#integrations",
};

export type ToolReadiness =
  /** Green. Nothing stands in the way. */
  | { state: "ready"; title: string }
  /**
   * Amber. Something specific is missing, and we know what — plus where
   * to go and fix it, so the dot's tooltip can lead somewhere.
   */
  | { state: "blocked"; title: string; label: string; fixHref: string | null }
  /** No dot. We genuinely do not know; a guess here would be a lie. */
  | { state: "unknown"; title: null };

/**
 * Why "unknown" exists, and why it is not the same as "blocked".
 *
 * The capability data is derived from the import graph, which asks "can
 * this page reach code that spends credits?". That over-approximates in
 * exactly one direction: a page can be wrongly flagged as needing AI
 * (/audits is, purely because it embeds an add-client dialog), but a
 * page can never be wrongly flagged free — if the graph cannot reach a
 * spend module, the code cannot spend.
 *
 * So `needsAI === false` is sound and safe to advertise in green.
 * `needsAI === true` means "might", and is only trusted where we have
 * confirmed it by hand — which is what isKnownAiPage() is for. Anything
 * left over gets no dot. Telling somebody a working page is broken costs
 * more than telling them nothing.
 */
export function toolReadiness(opts: {
  /** The link target. Query and hash are stripped for you. */
  href: string;
  /** An integration gate, if this entry has one. */
  needs?: ToolNeed | null;
  /** Whether this app can call a model — a key or Ollama, NOT MCP. */
  hasAiKey: boolean;
}): ToolReadiness {
  const { href, needs, hasAiKey } = opts;

  // An unconnected integration outranks everything else: even with a key
  // in place, the tool has no data to work on.
  if (needs) {
    return {
      state: "blocked",
      title: NEEDS_HINTS[needs],
      label: NEEDS_HINTS[needs],
      fixHref: NEEDS_FIX_HREF[needs],
    };
  }

  const route = href.split(/[?#]/)[0];
  const cap = capabilityOf(route);

  if (isKnownFreePage(route)) {
    return {
      state: "ready",
      title: cap?.usesBrowser
        ? "Works now — no AI key needed. Runs a browser on this machine, so it costs nothing per use."
        : "Works now — needs no AI key, costs nothing to run.",
    };
  }

  if (isKnownAiPage(route)) {
    return hasAiKey
      ? { state: "ready", title: "Works now — uses your AI key, so it costs a little per run." }
      : {
          state: "blocked",
          title:
            "Needs an AI key. A connected chat subscription does not drive this page — that runs the other way round.",
          label: "Needs an AI key",
          fixHref: "/settings#ai",
        };
  }

  return { state: "unknown", title: null };
}
