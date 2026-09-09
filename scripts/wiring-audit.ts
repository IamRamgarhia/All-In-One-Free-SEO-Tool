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
]);

type Score = {
  tool: string;
  route: boolean;
  client: boolean;
  persists: boolean;
  findings: boolean | null;
  reachable: boolean;
};

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
      client:
        /clientIdFrom|useClientId|ClientIdField|clientId[?]?:\s*number/.test(both) ||
        /saveToolRun|recordToolRun/.test(server),
      persists: /saveToolRun|recordToolRun/.test(server),
      findings: NOT_A_CHECK.has(tool) ? null : /recordToolRun/.test(server),
      reachable: linked.has(tool),
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

  const fullyWired = scores.filter((s) =>
    cols.every((k) => s[k] === true || s[k] === null),
  ).length;
  console.log(
    `\n  ${c.bold("fully wired")} ${fullyWired}/${scores.length} tools\n`,
  );
}

main();
