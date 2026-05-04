"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { gbpPlaybookCompletions } from "@/db/schema";
import { logActivity } from "@/lib/activity";

/**
 * Compute the "occurrence key" for an item given its cadence. Once-only
 * items use no occurrence; cadence items use the period the completion
 * fell into so a weekly task can be marked done again next week.
 */
function occurrenceKey(
  cadence: "once" | "weekly" | "monthly" | "quarterly",
): string | null {
  if (cadence === "once") return null;
  const d = new Date();
  if (cadence === "weekly") {
    const onejan = new Date(d.getUTCFullYear(), 0, 1);
    const week = Math.ceil(
      ((d.getTime() - onejan.getTime()) / 86_400_000 + onejan.getDay() + 1) / 7,
    );
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  }
  if (cadence === "monthly") {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  // quarterly
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

export async function togglePlaybookItem(
  clientId: number,
  itemId: string,
  cadence: "once" | "weekly" | "monthly" | "quarterly",
): Promise<void> {
  if (!Number.isFinite(clientId) || clientId <= 0) return;
  const occurrence = occurrenceKey(cadence);

  const existing = await db
    .select({ id: gbpPlaybookCompletions.id })
    .from(gbpPlaybookCompletions)
    .where(
      and(
        eq(gbpPlaybookCompletions.clientId, clientId),
        eq(gbpPlaybookCompletions.itemId, itemId),
        occurrence
          ? eq(gbpPlaybookCompletions.occurrence, occurrence)
          : eq(gbpPlaybookCompletions.itemId, itemId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .delete(gbpPlaybookCompletions)
      .where(eq(gbpPlaybookCompletions.id, existing[0].id));
  } else {
    await db.insert(gbpPlaybookCompletions).values({
      clientId,
      itemId,
      occurrence,
    });
    await logActivity({
      kind: "task.completed",
      message: `GBP playbook: ${itemId.replace(/-/g, " ")}`,
      clientId,
      entityType: "gbp_playbook",
    });
  }

  revalidatePath(`/gbp/c/${clientId}`);
}

/**
 * Returns the set of completed item IDs for *this period* — for once-only
 * items that means ever, for cadence items it means the current week / month / quarter.
 */
export async function getCompletionsForClient(clientId: number): Promise<{
  oncePermanent: Set<string>;
  weekly: Set<string>;
  monthly: Set<string>;
  quarterly: Set<string>;
}> {
  const all = await db
    .select()
    .from(gbpPlaybookCompletions)
    .where(eq(gbpPlaybookCompletions.clientId, clientId));

  const now = new Date();
  const onejan = new Date(now.getUTCFullYear(), 0, 1);
  const week = Math.ceil(
    ((now.getTime() - onejan.getTime()) / 86_400_000 + onejan.getDay() + 1) / 7,
  );
  const weekKey = `${now.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const qKey = `${now.getUTCFullYear()}-Q${Math.floor(now.getUTCMonth() / 3) + 1}`;

  const oncePermanent = new Set<string>();
  const weekly = new Set<string>();
  const monthly = new Set<string>();
  const quarterly = new Set<string>();

  for (const c of all) {
    if (c.occurrence === null) oncePermanent.add(c.itemId);
    else if (c.occurrence === weekKey) weekly.add(c.itemId);
    else if (c.occurrence === monthKey) monthly.add(c.itemId);
    else if (c.occurrence === qKey) quarterly.add(c.itemId);
  }
  return { oncePermanent, weekly, monthly, quarterly };
}
