/**
 * Recurring competitor monitor. Once every 30 days, walk every tracked
 * competitor and re-run a lightweight version of the playbook crawler.
 * Diff against the prior snapshot:
 *
 *   - New silos (URL-path-segment groups that didn't exist before)
 *   - New schema types
 *   - New backlink domains (mention-finder)
 *
 * Every change becomes an activity-log entry + a "review competitor X"
 * task on the related client board.
 */

import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db/client";
import {
  competitors,
  competitorSnapshots,
  tasks,
} from "@/db/schema";
import { reverseEngineerCompetitor } from "./competitor-playbook";
import { logActivity } from "./activity";

const RUN_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

export async function runCompetitorMonitor(): Promise<{
  checked: number;
  changes: number;
}> {
  const allCompetitors = await db.select().from(competitors);
  let checked = 0;
  let changes = 0;

  for (const c of allCompetitors) {
    const cutoff = new Date(Date.now() - RUN_INTERVAL_MS);
    const [recent] = await db
      .select({ id: competitorSnapshots.id })
      .from(competitorSnapshots)
      .where(
        and(
          eq(competitorSnapshots.competitorUrl, c.url),
          gte(competitorSnapshots.capturedAt, cutoff),
        ),
      )
      .orderBy(desc(competitorSnapshots.capturedAt))
      .limit(1);
    if (recent) continue;

    let playbook;
    try {
      playbook = await reverseEngineerCompetitor({
        competitorUrl: c.url,
        maxPages: 30,
      });
    } catch {
      continue;
    }
    checked++;

    const silos = playbook.silos.map((s) => ({ silo: s.silo, count: s.count }));
    const schemaTypes = playbook.signals.schemaTypes;
    const backlinkDomains = Array.from(
      new Set(playbook.backlinks.map((b) => b.domain)),
    );

    // Compare to most recent prior snapshot (any age) to detect new entries.
    const [prior] = await db
      .select()
      .from(competitorSnapshots)
      .where(eq(competitorSnapshots.competitorUrl, c.url))
      .orderBy(desc(competitorSnapshots.capturedAt))
      .limit(1);

    const newEntries = computeDelta(prior, {
      silos,
      schemaTypes,
      backlinkDomains,
    });

    await db.insert(competitorSnapshots).values({
      clientId: c.clientId,
      competitorUrl: c.url,
      pageCount: playbook.pageCount,
      silos,
      schemaTypes,
      backlinkDomains,
    });

    if (newEntries.summary) {
      changes++;
      await logActivity({
        kind: "page.changed",
        message: `Competitor ${c.name}: ${newEntries.summary}`,
        clientId: c.clientId,
        entityType: "competitor",
        entityId: c.id,
      });

      await db.insert(tasks).values({
        clientId: c.clientId,
        title: `Review competitor ${c.name} — fresh moves detected`,
        description: newEntries.detail.join("\n"),
        whyItMatters:
          "Competitors don't tell you when they level up. The monitor caught new silos / schema / link sources — see if any are worth copying.",
        priority: "medium",
        status: "todo",
        dueDate: new Date(Date.now() + 86_400_000 * 3),
        source: "competitor_monitor",
        sourceRef: `comp-${c.id}-${Date.now()}`,
      });
    }
  }

  return { checked, changes };
}

function computeDelta(
  prior:
    | {
        silos: { silo: string; count: number }[] | null;
        schemaTypes: string[] | null;
        backlinkDomains: string[] | null;
      }
    | undefined,
  current: {
    silos: { silo: string; count: number }[];
    schemaTypes: string[];
    backlinkDomains: string[];
  },
): { summary: string; detail: string[] } {
  if (!prior) {
    return {
      summary: `first snapshot — ${current.silos.length} silos, ${current.schemaTypes.length} schema types, ${current.backlinkDomains.length} mention domains`,
      detail: [
        `Silos: ${current.silos.map((s) => `/${s.silo}/`).join(", ")}`,
        `Schema: ${current.schemaTypes.join(", ") || "(none)"}`,
        `Mention domains: ${current.backlinkDomains.slice(0, 10).join(", ")}`,
      ],
    };
  }

  const priorSilos = new Set((prior.silos ?? []).map((s) => s.silo));
  const newSilos = current.silos.filter((s) => !priorSilos.has(s.silo));

  const priorSchemas = new Set(prior.schemaTypes ?? []);
  const newSchemas = current.schemaTypes.filter((s) => !priorSchemas.has(s));

  const priorDomains = new Set(prior.backlinkDomains ?? []);
  const newDomains = current.backlinkDomains.filter(
    (d) => !priorDomains.has(d),
  );

  const summaryBits: string[] = [];
  if (newSilos.length)
    summaryBits.push(
      `${newSilos.length} new silo${newSilos.length === 1 ? "" : "s"}`,
    );
  if (newSchemas.length)
    summaryBits.push(
      `${newSchemas.length} new schema type${newSchemas.length === 1 ? "" : "s"}`,
    );
  if (newDomains.length)
    summaryBits.push(
      `${newDomains.length} new mention domain${newDomains.length === 1 ? "" : "s"}`,
    );

  const detail: string[] = [];
  if (newSilos.length)
    detail.push(`New silos: ${newSilos.map((s) => `/${s.silo}/`).join(", ")}`);
  if (newSchemas.length)
    detail.push(`New schema: ${newSchemas.join(", ")}`);
  if (newDomains.length)
    detail.push(
      `New mentions: ${newDomains.slice(0, 8).join(", ")}${newDomains.length > 8 ? "…" : ""}`,
    );

  return {
    summary: summaryBits.join(" · "),
    detail,
  };
}
