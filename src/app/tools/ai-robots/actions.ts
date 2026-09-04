"use server";

import { db } from "@/db/client";
import { toolFindings } from "@/db/schema";
import { auditAiBotRobots, type RobotsAudit } from "@/lib/ai-bot-robots";
import { findingRowsFor } from "@/lib/ai-robots-findings";
import { saveToolRun } from "@/lib/tool-runs";

/**
 * Server action: run the AI-bot robots audit. Called by the client form.
 *
 * The audit itself is unchanged. What is new is that the result is
 * recorded — as a run, and as findings the agent can act on.
 *
 * Before this, 95 of the 96 tools computed an answer, drew it on screen,
 * and threw it away. This tool in particular was detecting exactly the
 * problem the agent had just learned to fix — an AI-crawler policy
 * nobody had written — and the two had no way to meet. The signatures
 * below are the ones tool-finding-map.ts maps onto the crawler's
 * vocabulary; changing them without changing that map silently
 * disconnects the tool from the agent again.
 */
export async function runAiRobotsAudit(
  url: string,
  clientId?: number,
): Promise<RobotsAudit> {
  const audit = await auditAiBotRobots(url);
  if (!audit.ok) return audit;

  // Recording is best-effort throughout. A failure to save must never
  // lose the user the answer they are looking at.
  try {
    const runId = await saveToolRun({
      toolId: "ai-robots",
      clientId: clientId ?? null,
      label: `${url} · ${audit.unaddressedCount} AI bots unaddressed`,
      input: { url, clientId },
      result: audit,
    });

    const rows = findingRowsFor(audit, runId, clientId ?? null);
    if (rows.length > 0) {
      await db.insert(toolFindings).values(rows);
    }
  } catch {
    // Swallowed deliberately — see above.
  }

  return audit;
}
