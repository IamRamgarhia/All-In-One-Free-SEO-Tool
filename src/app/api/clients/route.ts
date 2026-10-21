import { desc } from "drizzle-orm";
import { requireCabinetDb } from "@/db/cabinet/client";
import { cabinetClients } from "@/db/cabinet/schema";
import { jsonError, jsonOk, readJson } from "@/lib/cabinet/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = requireCabinetDb();
    const rows = await db
      .select()
      .from(cabinetClients)
      .orderBy(desc(cabinetClients.createdAt));
    return jsonOk({ clients: rows });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Failed", 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      name?: string;
      sector?: string;
      notes?: string;
    }>(request);
    if (!body.name?.trim()) return jsonError("name is required");

    const db = requireCabinetDb();
    const [client] = await db
      .insert(cabinetClients)
      .values({
        name: body.name.trim(),
        sector: body.sector?.trim() || null,
        notes: body.notes?.trim() || null,
      })
      .returning();
    return jsonOk({ client }, { status: 201 });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Failed", 500);
  }
}
