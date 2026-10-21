import { requireCabinetDb } from "@/db/cabinet/client";
import { cabinetSites } from "@/db/cabinet/schema";
import { jsonError, jsonOk, readJson } from "@/lib/cabinet/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      clientId?: string;
      name?: string;
      url?: string;
      environment?: string;
    }>(request);

    if (!body.clientId) return jsonError("clientId is required");
    if (!body.url?.trim()) return jsonError("url is required");

    let url = body.url.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

    const db = requireCabinetDb();
    const [site] = await db
      .insert(cabinetSites)
      .values({
        clientId: body.clientId,
        name: body.name?.trim() || null,
        url,
        environment: body.environment?.trim() || "production",
      })
      .returning();

    return jsonOk({ site }, { status: 201 });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Failed", 500);
  }
}
