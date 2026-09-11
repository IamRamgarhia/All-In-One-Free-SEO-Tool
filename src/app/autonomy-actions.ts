"use server";

import { revalidatePath } from "next/cache";
import { chooseAutonomy } from "@/lib/agent/autonomy";
import type { AutonomyLevel } from "@/lib/agent/autonomy-levels";
import { logActivity } from "@/lib/activity";

/**
 * Record the answer to the first-run autonomy question.
 *
 * Validated here rather than trusted from the client, because this
 * decides whether software is allowed to edit somebody's live website.
 * A bad value must land on the cautious end, never the permissive one.
 */
export async function chooseAutonomyAction(
  level: AutonomyLevel,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const allowed: AutonomyLevel[] = ["off", "suggest", "apply_safe", "apply_all"];
  if (!allowed.includes(level)) {
    return { ok: false, error: "Unknown autonomy level." };
  }
  try {
    await chooseAutonomy(level);
    await logActivity({
      kind: "agent.level_chosen",
      message: `Autonomy set to "${level}" from the first-run prompt.`,
      level: "info",
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
