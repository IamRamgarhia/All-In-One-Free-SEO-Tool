import { eq } from "drizzle-orm";
import { requireCabinetDb } from "@/db/cabinet/client";
import { cabinetActions } from "@/db/cabinet/schema";
import { jsonError, jsonOk, readJson } from "@/lib/cabinet/api";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await readJson<{
      status?: string;
      priority?: string;
      effort?: string;
      owner?: string;
      dueDate?: string | null;
      notes?: string | null;
      title?: string;
    }>(request);

    const db = requireCabinetDb();
    const [existing] = await db
      .select({ id: cabinetActions.id })
      .from(cabinetActions)
      .where(eq(cabinetActions.id, id))
      .limit(1);
    if (!existing) return jsonError("Action not found", 404);

    const [action] = await db
      .update(cabinetActions)
      .set({
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.effort !== undefined ? { effort: body.effort } : {}),
        ...(body.owner !== undefined ? { owner: body.owner } : {}),
        ...(body.dueDate !== undefined ? { dueDate: body.dueDate } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.title !== undefined ? { title: body.title } : {}),
      })
      .where(eq(cabinetActions.id, id))
      .returning();

    return jsonOk({ action });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Failed", 500);
  }
}
