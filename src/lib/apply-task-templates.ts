/**
 * Seeding a new client's task list from the templates.
 *
 * This lived twice — once in the add-client action, once in the Google
 * import action — as two copies of the same de-duplicate-and-insert
 * routine. They had already drifted (one returned counts, the other
 * returned void), and the site preflight below would have landed in one
 * of them and quietly not run on the other. One copy now.
 *
 * Two filters run before anything is inserted:
 *
 *   1. **Already on this client's list** — by exact title, so re-running
 *      "apply templates" is idempotent.
 *   2. **Already true of the live site** — see `template-preflight`. A
 *      site with canonical tags on every page should not be told to add
 *      canonical tags. Anything the preflight cannot judge is kept.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { tasks } from "@/db/schema";
import { getNicheTemplates } from "./niche-templates";
import { pickStackTemplates } from "./tech-stack-templates";
import { splitTemplatesByState, readSiteFacts, type SiteFacts } from "./template-preflight";
import { logActivity } from "./activity";
import { getReportLocale } from "./report-i18n";
import { localizeTemplate, templateTitles } from "./template-i18n";

export type TemplateApplyResult = {
  /** Tasks created. */
  added: number;
  /** Templates this client already had a task for. */
  skipped: number;
  /** Templates the live site already satisfies. */
  alreadyDone: number;
};

const NOTHING: TemplateApplyResult = { added: 0, skipped: 0, alreadyDone: 0 };

/**
 * Read the live site once, for the preflight.
 *
 * Best-effort by design: null means every template is kept, which is the
 * behaviour that existed before the preflight did.
 */
export async function siteFactsFor(
  url: string | null | undefined,
): Promise<SiteFacts | null> {
  if (!url) return null;
  try {
    return await readSiteFacts(url);
  } catch {
    return null;
  }
}

/**
 * Record what the site had already done, and the evidence for it.
 *
 * A shorter task list with no explanation is indistinguishable from a
 * broken generator, so the skips are written where they can be read back.
 */
async function logSkippedTemplates(
  clientId: number,
  source: "tech stack" | "niche",
  alreadyDone: { title: string; evidence: string }[],
): Promise<void> {
  if (alreadyDone.length === 0) return;
  const lines = alreadyDone.map((s) => `${s.title} — ${s.evidence}`).join("; ");
  await logActivity({
    kind: "task.template_skipped",
    message: `Skipped ${alreadyDone.length} ${source} task${
      alreadyDone.length === 1 ? "" : "s"
    } this site already does: ${lines}`,
    messageFr: `${alreadyDone.length} tâche${alreadyDone.length === 1 ? "" : "s"} ${
      source === "niche" ? "de niche" : alreadyDone.length === 1 ? "technique" : "techniques"
    } écartée${alreadyDone.length === 1 ? "" : "s"}, car le site le fait déjà : ${lines}`,
    level: "info",
    clientId,
    entityType: "client",
    entityId: clientId,
    dedupe: false,
  });
}

/** Structurally what both StackTaskTemplate and NicheTaskTemplate are. */
type Template = {
  title: string;
  description: string;
  whyItMatters: string;
  priority: "high" | "medium" | "low";
};

async function insertNewTemplates(
  clientId: number,
  candidates: readonly Template[],
  facts: SiteFacts | null,
  source: "tech stack" | "niche",
): Promise<TemplateApplyResult> {
  if (candidates.length === 0) return NOTHING;

  const { keep, alreadyDone } = splitTemplatesByState(candidates, facts);
  await logSkippedTemplates(clientId, source, alreadyDone);
  if (keep.length === 0)
    return { added: 0, skipped: 0, alreadyDone: alreadyDone.length };

  // A template may already be on the list in either language: the
  // workspace language can change between two runs.
  const existing = await db
    .select({ title: tasks.title })
    .from(tasks)
    .where(
      and(
        eq(tasks.clientId, clientId),
        inArray(tasks.title, keep.flatMap(templateTitles)),
      ),
    );

  const existingTitles = new Set(existing.map((e) => e.title));
  const isNew = (t: Template) => !templateTitles(t).some((x) => existingTitles.has(x));
  const locale = await getReportLocale();
  const toInsert = keep.filter(isNew).map((t) => localizeTemplate(t, locale));

  if (toInsert.length > 0) {
    await db.insert(tasks).values(
      toInsert.map((t) => ({
        clientId,
        title: t.title,
        description: t.description,
        whyItMatters: t.whyItMatters,
        priority: t.priority,
        status: "todo" as const,
      })),
    );
  }

  return {
    added: toInsert.length,
    skipped: keep.length - toInsert.length,
    alreadyDone: alreadyDone.length,
  };
}

/** Tech-stack checklist (CLAUDE.md Part 3.2 + Part 10). */
export async function applyStackTemplatesForClient(
  clientId: number,
  detectedStack: string[] | null,
  facts: SiteFacts | null = null,
): Promise<TemplateApplyResult> {
  const { tasks: stackTasks } = pickStackTemplates(detectedStack);
  return insertNewTemplates(clientId, stackTasks, facts, "tech stack");
}

/** Niche-specific tasks (CLAUDE.md Part 3.3). */
export async function applyNicheTemplatesForClient(
  clientId: number,
  niche: string | null | undefined,
  facts: SiteFacts | null = null,
): Promise<TemplateApplyResult> {
  return insertNewTemplates(clientId, getNicheTemplates(niche), facts, "niche");
}

/**
 * The starter checklist of a new project: niche tasks, then the tech-stack
 * ones. Nothing is seeded when the site could not be read: a list of
 * generic work ("add canonical tags", "submit a sitemap") about a site
 * nobody has seen says nothing true. The first audit that gets through
 * creates the tasks, and "apply templates" on the project still works.
 */
export async function seedTemplatesForNewProject(
  clientId: number,
  niche: string | null | undefined,
  detectedStack: string[] | null,
  facts: SiteFacts | null,
): Promise<void> {
  if (facts && facts.reachable === false) return;
  await applyNicheTemplatesForClient(clientId, niche, facts);
  await applyStackTemplatesForClient(clientId, detectedStack, facts);
}
