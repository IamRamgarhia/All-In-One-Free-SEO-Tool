import { eq } from "drizzle-orm";
import { requireCabinetDb } from "@/db/cabinet/client";
import { cabinetClients, cabinetSites } from "@/db/cabinet/schema";
import { jsonError, jsonOk } from "@/lib/cabinet/api";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const db = requireCabinetDb();
    const [client] = await db
      .select()
      .from(cabinetClients)
      .where(eq(cabinetClients.id, id))
      .limit(1);
    if (!client) return jsonError("Client not found", 404);

    const sites = await db
      .select()
      .from(cabinetSites)
      .where(eq(cabinetSites.clientId, id));

    return jsonOk({ client, sites });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Failed", 500);
  }
}
