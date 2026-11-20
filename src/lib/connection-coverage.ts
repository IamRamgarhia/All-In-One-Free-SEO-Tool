/**
 * Which tools each way of connecting actually gets you, by name.
 *
 * The screens that explain this used to state counts and stop — "the 28
 * AI tools in this app" — which answers the wrong question. Someone
 * deciding how to connect wants to know whether the tool *they* came for
 * is in that 28, and a number cannot tell them. So this names them.
 *
 * Client-safe: pure functions over the generated capability table, no
 * filesystem and no DB, so the same lists can render in a client
 * component. The MCP tool names are NOT here — they come from
 * `src/lib/mcp/server.ts`, which is server-only, and are passed in.
 *
 * Everything is derived. The project has been bitten repeatedly by a
 * second hand-written list drifting from the first (the six tool lists,
 * the model ids, the nav items), and a list of tool names that goes stale
 * is worse than no list: it tells someone a tool will work when it will
 * not, at exactly the moment they are choosing what to pay for.
 */
import {
  TOOL_CAPABILITIES,
  aiUsageOf,
  copyOf,
  worksIn,
  type ConnectionMode,
  type ToolCapability,
} from "./tool-capabilities";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  categoryOf,
  isRetired,
  type ToolCategoryId,
} from "./tool-categories";
import { internalTools } from "./tool-registry";

export type CoveredTool = {
  /** "/tools/geo-score" */
  href: string;
  /** The card's own title, so this page and the grid cannot disagree. */
  title: string;
  category: ToolCategoryId;
  /** How load-bearing a model is: none | optional | partial | required. */
  usage: "none" | "optional" | "partial" | "required";
};

/**
 * The tools grid, same definition the counts use: top-level
 * /tools/<name> only, retired ones excluded.
 *
 * Retired tools still answer on their route so old links keep working,
 * but listing them here would pad a "what you get" list with things the
 * product is steering people away from.
 */
function gridTools(): ToolCapability[] {
  // Driven by the registry, not by a route-shape regex.
  //
  // This matched /^\/tools\/[^/]+$/, which was right while every tool
  // lived under /tools/. It stopped being right the moment the ten
  // orphaned top-level tools (/ask, /bot-logs, /content-gap and the
  // rest) were added to the grid: the grid rendered 93 cards while this
  // counted 83, so the header under the title disagreed with the cards
  // beneath it. Counting the same list the grid renders makes that
  // impossible rather than something to notice.
  // Key widened to `string` deliberately: the generated table is
  // `as const`, so `c.route` narrows to a 226-member literal union and
  // looking up an arbitrary href becomes a type error. Same reason
  // tool-capabilities.ts widens its own BY_ROUTE map.
  const byRoute = new Map<string, ToolCapability>(
    TOOL_CAPABILITIES.map((c) => [c.route, c]),
  );
  const out: ToolCapability[] = [];
  for (const t of internalTools()) {
    if (isRetired(t.href)) continue;
    const cap = byRoute.get(t.href);
    // A registry entry with no capability row would mean the generated
    // table is stale; skipping is correct here because
    // tool-capabilities.test.ts is what fails on that, and guessing a
    // capability would hide it.
    if (cap) out.push(cap);
  }
  return out;
}

function toCovered(cap: ToolCapability): CoveredTool | null {
  const copy = copyOf(cap);
  // No card means the tool is reached from a client page and never
  // appears in the grid. Legitimate, but it has no name to show, and
  // inventing one here is how two screens start disagreeing.
  if (!copy) return null;
  return {
    href: cap.route,
    title: copy.title,
    category: categoryOf(cap.route),
    usage: aiUsageOf(cap),
  };
}

function sortByCategory(a: CoveredTool, b: CoveredTool): number {
  const byCat =
    CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
  return byCat !== 0 ? byCat : a.title.localeCompare(b.title);
}

/**
 * The three groups, which are not three columns of the same thing.
 *
 * This is the distinction every version of this screen has got wrong:
 *
 * - `worksAnyway` — runs with nothing connected, and therefore in every
 *   mode. 63 of 91 at the time of writing. This is the honest headline:
 *   most of the product needs no AI at all.
 * - `needsKey` — calls a model directly, so it needs an API key or
 *   Ollama. **MCP does not unlock these**, because MCP runs the other
 *   way round: the chat app calls into this one and gives it nothing to
 *   call.
 * - and separately, the MCP tools, which are a DIFFERENT SURFACE — data
 *   and agent operations (list_clients, run_agent, apply_fix) served to
 *   your chat app, not the 91 pages in here.
 *
 * There is deliberately no "works in MCP but not API" group, because
 * `mcpOnlyTools()` is empty and asserted to stay that way. The asymmetry
 * runs one way only: a key is a superset of a subscription for this
 * app's own tools. Presenting them as two symmetric columns would imply
 * a trade-off that does not exist.
 */
export type ModeCoverage = {
  worksAnyway: CoveredTool[];
  needsKey: CoveredTool[];
};

let cached: ModeCoverage | null = null;

export function modeCoverage(): ModeCoverage {
  if (cached) return cached;
  const worksAnyway: CoveredTool[] = [];
  const needsKey: CoveredTool[] = [];
  for (const cap of gridTools()) {
    const t = toCovered(cap);
    if (!t) continue;
    // Keyed off worksIn rather than off `usage` directly, so this cannot
    // drift from what the grid shows and the readiness dots draw. A
    // "partial" tool runs — one feature on it does not — and calling it
    // unavailable is the mistake that sent users away from four working
    // tools.
    if (worksIn(cap, "none")) worksAnyway.push(t);
    else needsKey.push(t);
  }
  worksAnyway.sort(sortByCategory);
  needsKey.sort(sortByCategory);
  cached = { worksAnyway, needsKey };
  return cached;
}

/**
 * Counts that match the lists, which the old ones did not.
 *
 * `AI_TOOL_COUNT` in tool-capabilities.ts counts `needsAI` — "can this
 * page reach code that calls a model?" — and is correct for that
 * question. It is the wrong number for "what does a key unlock",
 * because it also counts the `optional` and `partial` tools, which run
 * without a key:
 *
 *   needsAI .......... 33   (what AI_TOOL_COUNT reports)
 *   of which optional . 1   works fully; a model only adds prose
 *   of which partial .. 4   main check runs; one feature needs a key
 *   of which required  28   genuinely will not run
 *   minus retired ..... 2   superseded, excluded from these lists
 *   => needs a key .... 26
 *
 * So the screens explaining the modes were telling people that 33 tools
 * were unavailable when 26 were — naming five working tools as broken,
 * including the four `partial` ones the badge copy was already fixed for
 * once. A count and a list side by side that disagree is the clearer
 * version of the same bug, which is how this surfaced.
 *
 * These are derived from the same `worksIn` call the lists are, so the
 * number beside a list is always that list's length. Asserted in
 * connection-coverage.test.ts.
 */
export const WORKS_ANYWAY_COUNT = modeCoverage().worksAnyway.length;
export const NEEDS_KEY_COUNT = modeCoverage().needsKey.length;
/**
 * Everything these screens list, and the number the README advertises:
 * every tool the grid renders, retired ones left out.
 *
 * Retired tools still answer on their routes so old links and saved
 * reports keep working, but a "here is what you get" list should not be
 * padded with tools the product is steering people away from.
 *
 * Not the same as TOTAL_TOOL_COUNT, and LARGER than it, which this
 * comment had backwards: that one counts `/tools/<name>` routes in the
 * generated capability table, while the grid also carries the top-level
 * tools that never lived under /tools/ (/ask, /bot-logs, /content-gap
 * and the rest). Counting the list the grid renders is what makes the
 * header and the cards beneath it unable to disagree — see gridTools().
 */
export const LISTED_TOOL_COUNT = WORKS_ANYWAY_COUNT + NEEDS_KEY_COUNT;

/**
 * Tools that work with a subscription but not with a key.
 *
 * Expected to be empty, forever. It exists so a test can assert that
 * rather than a comment claiming it: if someone adds a tool that somehow
 * runs on MCP alone, the three-group framing above stops being true and
 * the screens built on it start lying.
 */
export function mcpOnlyTools(): CoveredTool[] {
  return gridTools()
    .filter((c) => worksIn(c, "mcp") && !worksIn(c, "api"))
    .map(toCovered)
    .filter((t): t is CoveredTool => t !== null);
}

/** Group a list for display, in the grid's own category order. */
export function groupByCategory(
  tools: CoveredTool[],
): { id: ToolCategoryId; label: string; tools: CoveredTool[] }[] {
  const out: { id: ToolCategoryId; label: string; tools: CoveredTool[] }[] = [];
  for (const id of CATEGORY_ORDER) {
    const inCat = tools.filter((t) => t.category === id);
    if (inCat.length > 0) {
      out.push({ id, label: CATEGORY_LABELS[id].label, tools: inCat });
    }
  }
  return out;
}

/**
 * What is unavailable right now, named.
 *
 * Empty for `api` and `both`. For `none` and `mcp` it is the same list,
 * because a subscription genuinely does not make these pages run — and
 * saying so is the whole point. A screen that implied otherwise is what
 * this module was written to replace.
 */
export function unavailableIn(mode: ConnectionMode): CoveredTool[] {
  return mode === "api" || mode === "both" ? [] : modeCoverage().needsKey;
}

/**
 * One sentence on what a mode leaves out, or null when it leaves out
 * nothing.
 *
 * Returned rather than rendered so the same wording serves settings, the
 * setup flow and any future surface, instead of being retyped per screen
 * the way the guided/pro toggle's two copies were.
 */
export function shortfallOf(mode: ConnectionMode): string | null {
  const missing = unavailableIn(mode);
  if (missing.length === 0) return null;
  const n = missing.length;
  if (mode === "mcp") {
    return (
      `${n} tool${n === 1 ? "" : "s"} here still need an API key or Ollama. ` +
      `A connected chat app does not drive them — it calls into this app, ` +
      `so these pages have no model to call.`
    );
  }
  return `${n} tool${n === 1 ? "" : "s"} need an API key or Ollama to run.`;
}
