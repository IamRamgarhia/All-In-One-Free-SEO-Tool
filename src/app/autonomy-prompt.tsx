import { getAgentSettings, hasChosenAutonomy } from "@/lib/agent/autonomy";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { sql } from "drizzle-orm";
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

  return <AutonomyChoice current={settings.level} />;
}
