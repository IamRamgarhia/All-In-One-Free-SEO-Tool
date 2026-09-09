/**
 * Recording what a tool found, once, in one place.
 *
 * 87 of the 91 tools compute an answer, draw it on screen, and throw it
 * away. Close the tab and the work is gone: it never reaches the
 * findings table, so it never reaches the ranked list, the agent, or a
 * report. The tools are not the problem — the clicking is.
 *
 * The two tools that did persist findings each hand-rolled it, and the
 * hand-rolling is where this went wrong: SXO builds its rows without a
 * `clientId`, and `loadActionableToolFindings` filters on exactly that
 * column. Its findings save, render on its own results page, and are
 * invisible to the agent forever. Nothing errors. That is the third time
 * this codebase has produced a write that reports success and changes
 * nothing downstream, which is why the column is no longer the caller's
 * to remember.
 *
 * A tool wires in by calling `recordToolRun` instead of `saveToolRun`
 * and handing over its findings. Everything else — the client id, the
 * status a human already set, the failure isolation — happens here.
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { toolFindings, type ToolFinding } from "@/db/schema";
import { saveToolRun } from "./tool-runs";
import { clientIdFromRequest } from "./client-context";

export type FindingSeverity = "critical" | "high" | "medium" | "low" | "pass";

/**
 * One thing a tool found.
 *
 * `signature` is the identity that survives across runs — "robots.no_sitemap",
 * "canonical-audit.missing". It must be stable and must not contain the
 * run id, the date, or anything else that changes between runs, because
 * matching on it is what lets a finding be marked resolved once rather
 * than every week.
 */
export type FindingDraft = {
  signature: string;
  title: string;
  severity: FindingSeverity;
  category?: string | null;
  details?: string | null;
  fixSteps?: string | null;
  codeSnippet?: string | null;
};

/**
 * The most findings one run may write.
 *
 * A bulk tool pointed at a large sitemap can generate a finding per URL.
 * Without a ceiling, one run of one tool can put six figures of rows in
 * front of every later query, and the symptom is a slow app rather than
 * an error anyone traces back here.
 */
export const MAX_FINDINGS_PER_RUN = 500;

export type RecordedRun = {
  /** Null when persistence failed — the caller still has its answer. */
  runId: number | null;
  findings: ToolFinding[];
};

export async function recordToolRun<TResult>(opts: {
  toolId: string;
  label: string;
  /**
   * Which client this is about.
   *
   * Null is legitimate — a tool run from the generic /tools page belongs
   * to nobody. But a null here means the finding cannot reach the agent
   * or the ranked list, so pass it whenever it is known.
   */
  clientId?: number | null;
  input?: Record<string, unknown>;
  result: TResult;
  findings?: FindingDraft[];
}): Promise<RecordedRun> {
  // Same fallback as saveToolRun, and resolved once here so the run and
  // its findings cannot end up attributed to different clients.
  const clientId = opts.clientId ?? (await clientIdFromRequest());

  try {
    const runId = await saveToolRun({
      toolId: opts.toolId,
      label: opts.label,
      clientId,
      input: opts.input,
      result: opts.result,
    });

    const drafts = (opts.findings ?? []).slice(0, MAX_FINDINGS_PER_RUN);
    if (drafts.length === 0) return { runId, findings: [] };

    const carried = await previousStatuses(opts.toolId, clientId, drafts);
    const rows = toFindingRows({
      runId,
      clientId,
      toolId: opts.toolId,
      drafts,
      carried,
    });

    const inserted = await db.insert(toolFindings).values(rows).returning();
    return { runId, findings: inserted };
  } catch {
    // Best-effort throughout. A tool that cannot save its findings must
    // still show the user the answer they asked for — losing the answer
    // to protect the bookkeeping is the wrong trade every time.
    return { runId: null, findings: [] };
  }
}

export type OpenToolFinding = {
  toolId: string;
  signature: string;
  title: string;
  severity: FindingSeverity;
};

/**
 * What the tools currently say is wrong with a client's site.
 *
 * Findings are per-run rows. Counting every row would count the same
 * problem once per run forever — a weekly check would report 52 problems
 * a year in. So only the most recent run of each tool counts, which is
 * also the only run whose findings are still true.
 *
 * `pass` rows are excluded: a finding that says the check succeeded is
 * not work. So are resolved and ignored ones, which are decisions.
 */
export async function openToolFindings(
  clientId: number,
): Promise<OpenToolFinding[]> {
  const rows = await db
    .select({
      runId: toolFindings.runId,
      toolId: toolFindings.toolId,
      signature: toolFindings.signature,
      title: toolFindings.title,
      severity: toolFindings.severity,
      status: toolFindings.status,
    })
    .from(toolFindings)
    .where(eq(toolFindings.clientId, clientId))
    .orderBy(desc(toolFindings.runId))
    // Bounded. A long-lived install accumulates runs, and this only ever
    // needs the newest few per tool.
    .limit(2000);

  return pickOpenFindings(rows);
}

export type FindingRowForPicking = {
  runId: number;
  toolId: string;
  signature: string;
  title: string;
  severity: FindingSeverity;
  status: ToolFinding["status"];
};

/**
 * The open findings from each tool's most recent run.
 *
 * `rows` must be ordered newest-run-first. Split out from the query so
 * the counting rule can be tested: over-counting here is invisible —
 * every number simply grows a little each week, which reads as a site
 * getting worse rather than as a bug.
 */
export function pickOpenFindings(
  rows: readonly FindingRowForPicking[],
): OpenToolFinding[] {
  // Rows arrive newest-run-first, so the first run id seen for a tool is
  // its latest run and every later one is history.
  const latestRunFor = new Map<string, number>();
  const out: OpenToolFinding[] = [];
  for (const r of rows) {
    const latest = latestRunFor.get(r.toolId);
    if (latest === undefined) latestRunFor.set(r.toolId, r.runId);
    else if (r.runId !== latest) continue;
    if (r.status !== "new" || r.severity === "pass") continue;
    out.push({
      toolId: r.toolId,
      signature: r.signature,
      title: r.title,
      severity: r.severity,
    });
  }
  return out;
}

export type CarriedStatus = {
  status: ToolFinding["status"];
  completedAt: Date | null;
  completedNote: string | null;
};

/**
 * The rows to insert.
 *
 * Split out from `recordToolRun` so it can be tested without a database.
 * The properties worth holding are all here — every row names its client,
 * every row names its run, and a status a human set survives — and each
 * of them fails silently rather than loudly when it breaks, which is a
 * poor reason to leave them untested behind an INSERT.
 */
export function toFindingRows(opts: {
  runId: number;
  clientId: number | null;
  toolId: string;
  drafts: readonly FindingDraft[];
  carried?: ReadonlyMap<string, CarriedStatus>;
}) {
  return opts.drafts.slice(0, MAX_FINDINGS_PER_RUN).map((f) => {
    const prior = opts.carried?.get(f.signature);
    return {
      runId: opts.runId,
      // Not optional, and not the caller's to remember. See the note at
      // the top of this file.
      clientId: opts.clientId,
      toolId: opts.toolId,
      signature: f.signature,
      title: f.title,
      category: f.category ?? null,
      severity: f.severity,
      details: f.details ?? null,
      fixSteps: f.fixSteps ?? null,
      codeSnippet: f.codeSnippet ?? null,
      status: prior?.status ?? ("new" as const),
      completedAt: prior?.completedAt ?? null,
      completedNote: prior?.completedNote ?? null,
    };
  });
}

/**
 * What a human already decided about these findings.
 *
 * Findings are per-run rows matched across runs by signature. Without
 * this, a finding someone marked "ignored" — a deliberate "this is fine
 * on my site" — returns as "new" on the next run, and the agent plans
 * work its owner has already declined. Re-running a check is not new
 * information about a decision.
 *
 * "resolved" carries too. If the thing is genuinely back, the tool stops
 * reporting it and the row simply is not written; a signature that keeps
 * appearing after being marked resolved is a finding the fix did not
 * fix, and re-opening it automatically would hide that.
 */
async function previousStatuses(
  toolId: string,
  clientId: number | null,
  drafts: FindingDraft[],
): Promise<Map<string, CarriedStatus>> {
  const out = new Map<string, CarriedStatus>();
  if (drafts.length === 0) return out;
  // A run with no client cannot inherit: findings from different sites
  // share a null client id, so matching on signature alone would carry
  // one site's decision onto another's. Skipping the carry costs a
  // re-shown finding; getting it wrong silently suppresses a real one.
  if (clientId === null) return out;

  const rows = await db
    .select({
      signature: toolFindings.signature,
      status: toolFindings.status,
      completedAt: toolFindings.completedAt,
      completedNote: toolFindings.completedNote,
    })
    .from(toolFindings)
    .where(
      and(
        eq(toolFindings.toolId, toolId),
        eq(toolFindings.clientId, clientId),
      ),
    )
    // Newest first, so the first sighting of a signature is the current
    // decision and later ones are history.
    .orderBy(desc(toolFindings.id))
    // Bounded so a tool with a long history does not read every row it
    // has ever written on every run.
    .limit(MAX_FINDINGS_PER_RUN * 4);

  const wanted = new Set(drafts.map((d) => d.signature));
  for (const r of rows) {
    if (!wanted.has(r.signature) || out.has(r.signature)) continue;
    // "new" is the default anyway — carrying it would just add rows to
    // the map for no effect.
    if (r.status === "new") {
      out.set(r.signature, {
        status: "new",
        completedAt: null,
        completedNote: null,
      });
      continue;
    }
    out.set(r.signature, {
      status: r.status,
      completedAt: r.completedAt ?? null,
      completedNote: r.completedNote ?? null,
    });
  }
  return out;
}
