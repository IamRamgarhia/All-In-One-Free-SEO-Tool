/**
 * Is every tool actually wired into the product, or does it just exist?
 *
 * "It works" for a tool in this app means more than "the page renders".
 * A tool can compute a perfect answer and still be invisible to
 * everything else, and that failure is silent by construction — the page
 * looks right, so nobody checks whether the result went anywhere.
 *
 * This scores each tool against the things that have actually gone wrong
 * here, each of which shipped at least once:
 *
 *   route      the page exists at the slug other code links to
 *   client     the action can receive a clientId
 *   persists   the run is recorded rather than drawn and discarded
 *   findings   problems it detects become rows the rest of the app reads
 *   reachable  a person can get to it from the tools hub or a client
 *
 * A tool that finds nothing to fix does not need `findings` — a
 * generator has no findings to record — so that column is scored only
 * where the tool is a check. Everything else applies to all of them.
 *
 *     npx tsx scripts/wiring-audit.ts
 *     npx tsx scripts/wiring-audit.ts --gaps    only what is unwired
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TOOLS_DIR = path.join(ROOT, "src/app/tools");

const c = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

/**
 * Tools that legitimately produce no findings.
 *
 * A generator makes something; it does not inspect a site and report
 * what is wrong with it. Scoring them on a findings column would push
 * the number down for a thing that is complete.
 */
const NOT_A_CHECK = new Set([
  // Generators and editors: they make or change something rather than
  // inspecting a site and reporting what is wrong with it.
  "ai-schema", "og-image", "image-gen", "meta-tag-generator", "code-generator",
  "schema", "sitemap", "person-schema", "hreflang-gen", "disavow",
  "programmatic-seo", "content-helpers", "outreach-personalize", "brief",
  "attack-briefs", "content-attack-brief", "summarizer", "cluster",
  "screenshot-import", "social-preview", "pixel-preview", "indexnow",
  "github-pr", "gbp-reply", "ai-citation-tactics", "geo-swot", "bulk-alt",
  "refresh", "link-recommender", "auto-link", "migration-map",
  "redirects-manager", "browser-agent",
  // Research and lookup: they answer a question about the world rather
  // than about this site, so there is no finding to record.
  "trending", "reddit-research", "youtube", "wayback", "dns-whois",
  "search-volume", "keyword-difficulty", "intent-classifier", "serp-features",
  "serp-volatility", "crux", "crux-origin", "branded-split",
  "utm-attribution", "ads-funnel", "gsc-coverage", "rank-where", "external",
  "bing", "domain-overview", "robots-history", "link-graph", "pagerank",
  "anchor-distribution", "backlink-discovery",
  // Analyses the shape of a page's links — how many are external,
  // how many nofollow, which anchors repeat — and never checks whether
  // one resolves. There is no problem for it to report, so wiring it to
  // the findings pipeline would mean inventing an opinion the tool does
  // not hold.
  "link-checker",
]);

type Score = {
  tool: string;
  route: boolean;
  client: boolean | null;
  persists: boolean | null;
  findings: boolean | null;
  reachable: boolean;
  shape: Shape;
};

/**
 * What kind of thing a tool is, derived from its source.
 *
 * Three shapes, and only one of them owes a tool_run:
 *
 *   run        takes input, computes an answer, shows it. The answer is
 *              gone when the tab closes unless it is recorded.
 *   manager    CRUD over a table of its own — uptime targets, redirect
 *              rules, SERP captures. Already persistent, just not here.
 *   reference  a client-side page with no server work at all. There is
 *              no result to keep.
 *
 * Derived rather than listed, so a tool added tomorrow is classified
 * without anyone updating a table — and so this cannot quietly become a
 * second hardcoded list of what the tools are.
 *
 * The distinction is not pedantry. Adding a saveToolRun call to a
 * reference page would record nothing and move this script's number up,
 * which is precisely the failure the script exists to catch, committed
 * by the script itself.
 */
type Shape = "run" | "manager" | "reference";

function shapeOf(server: string): Shape {
  // No server code at all: whatever it does, it does in the browser.
  if (server.trim() === "") return "reference";

  // A manager keeps a collection over time: it can read the collection
  // back and it can change it. A run tool has neither — you give it an
  // input, it hands you an answer, and there is nothing to come back to.
  //
  // Matched on the exported verbs rather than on direct db calls,
  // because several of these delegate the writing to a lib. Looking only
  // for `db.insert(` in the action file classified three managers as run
  // tools and produced three gaps that were not real.
  const readsBack =
    /export async function (list|load|fetch|get)[A-Z]/.test(server);
  const mutates =
    /export async function (add|create|delete|remove|toggle|update|save|submit|import|run)[A-Z]/.test(
      server,
    );
  if (readsBack && mutates) return "manager";

  // Being able to delete something is the giveaway on its own. A run
  // tool has nothing to delete — you re-run it. Anything offering to
  // remove an item is keeping a collection, whether or not it also
  // offers a way to list one.
  if (/export async function (delete|remove)[A-Z]/.test(server)) {
    return "manager";
  }

  // Writes to a table of its own, directly, without being a tool_run.
  const ownsATable =
    /db\s*\.\s*(insert|update|delete)\s*\(/.test(server) &&
    !/db\s*\.\s*insert\s*\(\s*toolRuns/.test(server);
  if (ownsATable && mutates) return "manager";

  return "run";
}

function read(p: string): string {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

function serverSource(tool: string): string {
  const dir = path.join(TOOLS_DIR, tool);
  if (!existsSync(dir)) return "";
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => read(path.join(dir, f)))
    .join("\n");
}

function clientSource(tool: string): string {
  const dir = path.join(TOOLS_DIR, tool);
  if (!existsSync(dir)) return "";
  return readdirSync(dir)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => read(path.join(dir, f)))
    .join("\n");
}

function main() {
  const gapsOnly = process.argv.includes("--gaps");

  const tools = readdirSync(TOOLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  // Everything the client rail and the tools hub link to.
  const rail = read(path.join(ROOT, "src/app/clients/[id]/client-tools-launcher.tsx"));
  const hub = read(path.join(ROOT, "src/app/tools/tools-grid.tsx"));
  const linked = new Set(
    [...`${rail}\n${hub}`.matchAll(/\/tools\/([a-z0-9-]+)/g)].map((m) => m[1]),
  );

  const scores: Score[] = tools.map((tool) => {
    const server = serverSource(tool);
    const client = clientSource(tool);
    const both = `${server}\n${client}`;
    return {
      tool,
      route: existsSync(path.join(TOOLS_DIR, tool, "page.tsx")),
      // Attributed if it takes a clientId explicitly, or if it records
      // through saveToolRun / recordToolRun — both of which fall back to
      // the referring page when the caller passes none. The referer of a
      // server action is the page the user is on, and the client rail
      // puts the id there. See client-context.ts.
      // Only asked of tools that record a run. A reference page records
      // nothing, and a manager's rows are scoped by its own table's
      // schema — scoring either here invents a gap that has no fix.
      client:
        shapeOf(server) !== "run"
          ? null
          : /clientIdFrom|useClientId|ClientIdField|clientId[?]?:\s*number/.test(
              both,
            ) || /saveToolRun|recordToolRun/.test(server),
      // Only "run" tools owe a tool_run. A manager keeps its state in
      // its own table and a reference page has no state at all, and
      // adding a saveToolRun call to either would record nothing while
      // making this number go up — which is the exact failure this
      // script exists to find, committed by the script itself.
      persists:
        shapeOf(server) === "run"
          ? /saveToolRun|recordToolRun/.test(server)
          : null,
      findings:
        NOT_A_CHECK.has(tool) || shapeOf(server) !== "run"
          ? null
          : /recordToolRun/.test(server),
      reachable: linked.has(tool),
      shape: shapeOf(server),
    };
  });

  const cols: (keyof Score)[] = ["route", "client", "persists", "findings", "reachable"];
  const mark = (v: boolean | null) =>
    v === null ? c.dim(" — ") : v ? c.green(" ok") : c.red("  ✗");

  const rows = gapsOnly
    ? scores.filter((s) => cols.some((k) => s[k] === false))
    : scores;

  console.log(
    c.bold(
      `\n${"tool".padEnd(24)}${cols.map((h) => h.padEnd(11)).join("")}`,
    ),
  );
  for (const s of rows) {
    const line = cols.map((k) => mark(s[k] as boolean | null).padEnd(20)).join("");
    console.log(`${s.tool.padEnd(24)}${line}`);
  }

  console.log(c.bold("\n\nWiring, by column"));
  for (const k of cols) {
    const applicable = scores.filter((s) => s[k] !== null);
    const ok = applicable.filter((s) => s[k] === true).length;
    const pct = Math.round((ok / applicable.length) * 100);
    const bar = pct >= 90 ? c.green : pct >= 60 ? c.yellow : c.red;
    console.log(
      `  ${String(k).padEnd(11)} ${bar(`${ok}/${applicable.length}`.padEnd(8))} ${bar(`${pct}%`)}`,
    );
  }

  console.log(c.bold("\nBy shape"));
  for (const shape of ["run", "manager", "reference"] as const) {
    const n = scores.filter((s) => s.shape === shape).length;
    console.log(`  ${shape.padEnd(11)} ${n}`);
  }
  const fullyWired = scores.filter((s) =>
    cols.every((k) => s[k] === true || s[k] === null),
  ).length;
  console.log(
    `\n  ${c.bold("fully wired")} ${fullyWired}/${scores.length} tools\n`,
  );
}

main();
