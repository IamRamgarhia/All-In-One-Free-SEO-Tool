"use server";


import { auditAiBotRobots, type RobotsAudit } from "@/lib/ai-bot-robots";
import { findingDraftsFor } from "@/lib/ai-robots-findings";
import { recordToolRun } from "@/lib/tool-findings";

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

  // Recording is best-effort inside recordToolRun: a failure to save
  // must never lose the user the answer they are looking at.
  await recordToolRun({
    toolId: "ai-robots",
    clientId: clientId ?? null,
    label: `${url} · ${audit.unaddressedCount} AI bots unaddressed`,
    input: { url, clientId },
    result: audit,
    findings: findingDraftsFor(audit),
  });

  return audit;
}
