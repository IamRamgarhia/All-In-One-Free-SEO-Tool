/**
 * Decides whether the dashboard shows the support card, so the client
 * component never has to guess and the dashboard never has to know the rules.
 *
 * Returns nothing — not an empty box — in every "no" case: too early in the
 * install's life, dismissed today, snoozed, or asked never to appear again.
 */

import {
  getNudgeState,
  getSupportTracker,
} from "@/lib/supporters-data";
import { nudgeLine, shouldShowSupportNudge } from "@/lib/supporters";
import { SupportNudge } from "@/components/support/support-nudge";

export async function SupportNudgeSlot({ auditsRun }: { auditsRun: number }) {
  const state = await getNudgeState();
  if (!shouldShowSupportNudge(auditsRun, state)) return null;

  // The tracker is a nice-to-have here: the card still makes sense with no
  // figures, so a failed fetch must not suppress it.
  const { tracker } = await getSupportTracker();

  return (
    <SupportNudge auditsRun={auditsRun} line={nudgeLine()} tracker={tracker} />
  );
}
