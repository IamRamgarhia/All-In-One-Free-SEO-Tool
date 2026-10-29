"use server";

import { revalidatePath } from "next/cache";
import { guardAction } from "@/lib/action-guard";
import { getSetting, setSetting } from "@/lib/settings-store";
import {
  type NudgeState,
  localDay,
  parseNudgeState,
  snoozeUntil,
} from "@/lib/supporters";

const NUDGE_KEY = "support.nudge_state";

/**
 * Put the dashboard support card away. "today" until tomorrow, "snooze" for
 * a month, "never" for good.
 *
 * Each is honoured exactly as labelled. A button that says "hide for 30 days"
 * and reappears next week is worse than no button, because by then the person
 * has learned the controls lie.
 */
export async function dismissSupportNudge(
  mode: "today" | "snooze" | "never",
): Promise<void> {
  await guardAction("edit");
  const current = parseNudgeState(await getSetting(NUDGE_KEY));
  const next: NudgeState =
    mode === "today"
      ? { ...current, hiddenOn: localDay() }
      : mode === "snooze"
        ? { ...current, snoozedUntil: snoozeUntil() }
        : { ...current, never: true };
  await setSetting(NUDGE_KEY, next);
  revalidatePath("/");
}
