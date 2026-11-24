import { getAgentSettings, hasChosenAutonomy } from "@/lib/agent/autonomy";
import { db } from "@/db/client";
import { agentActions, clients } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { describeWaitingWork } from "@/lib/agent/waiting-work";
import { trialOffer } from "@/lib/agent/trial";
import { AutonomyChoice } from "./autonomy-choice";

/**
 * Ask, once, how much the agent may do on its own.
 *
 * The default is `suggest`, which is the right default: these changes
 * land on a live website someone is accountable for, and turning
 * autopilot on for a user who never asked for it would be the worst
 * thing this product could do.
 *
 * But a cautious default that is never surfaced is its own failure. An
 * install that has never been asked looked identical to one that
 * considered autopilot and declined, so the fixing half of the product
 * simply never ran for anybody — the agent found work every night,
 * proposed it, changed nothing, and nothing on screen suggested there
 * was a setting that would change that.
 *
 * So this asks, plainly, once, and then never again. Picking "suggest"
 * counts as an answer; somebody who reads the options and keeps the
 * cautious one has decided, and asking twice is nagging.
 *
 * Hidden entirely until there is a client, because the question is
 * meaningless with no site to act on.
 */
export async function AutonomyPrompt() {
  const [chosen, settings] = await Promise.all([
    hasChosenAutonomy(),
    getAgentSettings(),
  ]);
  if (chosen) return null;

  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(clients);
  if ((row?.n ?? 0) === 0) return null;

  /**
   * What the silence has cost so far (upstream: "tell people what the
   * agent is holding"). "It finds work every night and changes nothing"
   * is true and easy to scroll past; "14 changes have been waiting for 8
   * weeks" is the same fact with the cost attached.
   */
  const [queuedRow] = await db
    .select({
      n: sql<number>`count(*)`,
      oldest: sql<number | null>`min(${agentActions.createdAt})`,
    })
    .from(agentActions)
    .where(eq(agentActions.status, "queued"));

  const oldestRaw = queuedRow?.oldest ?? null;
  const waiting = describeWaitingWork({
    queued: Number(queuedRow?.n ?? 0),
    // Stored as unix seconds; Date wants milliseconds. Getting this
    // wrong would date everything to 1970 and read as "for 56 years".
    oldest: oldestRaw ? new Date(Number(oldestRaw) * 1000) : null,
  });

  // The numbers behind the trial offer, queried here so the offer is
  // either concrete or absent — a "try it on 3" button with nothing safe
  // to apply would be a dead end.
  const offer = await trialOffer().catch(() => null);

  return (
    <AutonomyChoice
      current={settings.level}
      waiting={waiting}
      trialWaiting={offer?.waiting ?? null}
      trialOldestDays={offer?.oldestDays ?? null}
    />
  );
}
