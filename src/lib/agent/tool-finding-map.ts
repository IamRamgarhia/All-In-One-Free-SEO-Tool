/**
 * Turning a tool's finding into something the agent can act on.
 *
 * The crawler and the 96 tools produce findings in two different
 * vocabularies. The crawler emits a fixed set of 72 type names, and the
 * planner's FIXABLE map is keyed on those. Tools emit free-text
 * signatures — "sxo.time_to_answer", "ai-robots.unaddressed" — keyed to
 * nothing, and the agent has never read one.
 *
 * So `tool_findings` is written by one tool out of 96 and consumed by a
 * checklist on that tool's own results page. Wiring more tools into it
 * without this mapping would produce rows that display and drive
 * nothing — which is the same mistake as a capability nothing plans, in
 * a different costume.
 *
 * This maps the one vocabulary onto the other. Deliberately onto the
 * EXISTING finding types rather than a parallel set: a tool finding that
 * means "this page has no canonical" should produce exactly the action a
 * crawler finding of the same shape produces, through the same planner
 * entry, the same executor branch and the same undo. A second vocabulary
 * would be a second FIXABLE, and CLAUDE.md's fourth rule exists because
 * every such pair in this codebase had already drifted by the time
 * anyone noticed.
 *
 * The map is small on purpose. Most tool findings are judgements — "is
 * the page's promise clear", "how long to the answer" — and those have
 * no mechanical fix, so mapping them would manufacture actions the agent
 * cannot honestly take. A signature belongs here only when acting on it
 * is the same edit the crawler's equivalent would get.
 */

import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { toolFindings, toolRuns } from "@/db/schema";
import {
  isAuditFindingType,
  type AuditFindingType,
} from "../audit-finding-types";

/**
 * Tool finding signature → the crawler finding type it is equivalent to.
 *
 * Keys match either exactly or as a prefix followed by a dot, so a tool
 * that namespaces per-item ("ai-robots.unaddressed.GPTBot") maps through
 * its stem.
 */
export const TOOL_FINDING_MAP: Record<string, AuditFindingType> = {
  // The AI-bot robots.txt audit answers precisely the question the
  // crawler's own check asks — which AI crawlers has this site made a
  // decision about — but from a dedicated fetch and parse rather than a
  // regex over whatever the crawl happened to capture.
  "ai-robots.unaddressed": "missing_ai_crawler_policy",
  "ai-robots.partial": "partial_ai_crawler_policy",
};

/**
 * The finding type a signature maps to, or null.
 *
 * Null is the common and correct answer. A tool finding with no
 * mechanical equivalent stays where it is — visible on the tool's page,
 * actionable by a human — rather than being forced into an action the
 * agent would have to invent.
 */
export function mapToolFinding(signature: string): AuditFindingType | null {
  const exact = TOOL_FINDING_MAP[signature];
  if (exact) return exact;
  // Longest prefix wins, so a more specific key can override a stem.
  const stems = Object.keys(TOOL_FINDING_MAP)
    .filter((k) => signature.startsWith(k + "."))
    .sort((a, b) => b.length - a.length);
  return stems.length > 0 ? TOOL_FINDING_MAP[stems[0]] : null;
}

export type ActionableToolFinding = {
  findingId: number;
  toolId: string;
  signature: string;
  type: AuditFindingType;
  severity: string;
  /** The page the tool was run against. Null for site-wide findings. */
  url: string | null;
  title: string;
};

/**
 * Findings from tools that the agent could act on, newest run first.
 *
 * Three filters, each for a reason worth stating:
 *
 * `status = "new"` — a finding someone has marked resolved or ignored is
 * a decision, and re-planning it would override a human on their own
 * site.
 *
 * A freshness window — the planner already refuses to act on anything
 * but the most recent audit, because "acting on a stale finding means
 * editing a page to solve a problem it no longer has". A tool run from
 * three months ago is staler than that, not fresher.
 *
 * A mapping — everything else is dropped silently, because "we found
 * something we cannot fix" is the normal case, not an error.
 */
export async function loadActionableToolFindings(opts: {
  clientId: number;
  /** How far back a tool run still counts. */
  maxAgeDays?: number;
  now?: Date;
}): Promise<ActionableToolFinding[]> {
  const now = opts.now ?? new Date();
  const maxAgeDays = opts.maxAgeDays ?? 14;
  const cutoff = new Date(now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000);

  const signatures = Object.keys(TOOL_FINDING_MAP);
  if (signatures.length === 0) return [];

  const rows = await db
    .select({
      id: toolFindings.id,
      toolId: toolFindings.toolId,
      signature: toolFindings.signature,
      severity: toolFindings.severity,
      title: toolFindings.title,
      createdAt: toolFindings.createdAt,
      input: toolRuns.inputJson,
    })
    .from(toolFindings)
    // The URL lives on the run, not the finding — tool_findings has no
    // url column, so a per-page action has nowhere to point without
    // this join.
    .innerJoin(toolRuns, eq(toolRuns.id, toolFindings.runId))
    .where(
      and(
        eq(toolFindings.clientId, opts.clientId),
        eq(toolFindings.status, "new"),
        gte(toolFindings.createdAt, cutoff),
        // "pass" is a finding that says the check succeeded. Planning
        // work off one would be the agent fixing something that is
        // already right.
        inArray(toolFindings.severity, ["critical", "high", "medium", "low"]),
      ),
    )
    .orderBy(desc(toolFindings.createdAt));

  const out: ActionableToolFinding[] = [];
  const seen = new Set<string>();

  for (const r of rows) {
    const type = mapToolFinding(r.signature);
    if (!type || !isAuditFindingType(type)) continue;

    const url = urlFrom(r.input);
    // Newest run wins. The same tool re-run weekly produces the same
    // signature every time, and without this the agent would see six
    // copies of one problem and count them against its per-run cap.
    const key = `${type}|${url ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      findingId: r.id,
      toolId: r.toolId,
      signature: r.signature,
      type,
      severity: r.severity,
      url,
      title: r.title,
    });
  }

  return out;
}

/** The URL a tool was run against, from whatever key it stored it under. */
function urlFrom(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const rec = input as Record<string, unknown>;
  for (const key of ["url", "domain", "siteUrl", "site"]) {
    const v = rec[key];
    if (typeof v === "string" && v.trim()) {
      try {
        return new URL(v.startsWith("http") ? v : `https://${v}`).toString();
      } catch {
        return null;
      }
    }
  }
  return null;
}
