import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { runNativeAudit } from "@/audit/engine/audit-runner";
import {
  listNativeAudits,
  saveNativeAuditRun,
} from "@/audit/storage/audit-repository";

export const dynamic = "force-dynamic";

/** GET ?clientId= — list native audit runs for a client. */
export async function GET(request: Request) {
  const clientId = Number(new URL(request.url).searchParams.get("clientId"));
  if (!Number.isFinite(clientId)) {
    return NextResponse.json({ error: "clientId required" }, { status: 400 });
  }
  const runs = await listNativeAudits(clientId);
  return NextResponse.json({ runs });
}

/** POST { clientId, mode?: "quick"|"full" } — launch native audit. */
export async function POST(request: Request) {
  const body = (await request.json()) as {
    clientId?: number;
    mode?: "quick" | "full";
  };
  const clientId = Number(body.clientId);
  if (!Number.isFinite(clientId)) {
    return NextResponse.json({ error: "clientId required" }, { status: 400 });
  }
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) {
    return NextResponse.json({ error: "client not found" }, { status: 404 });
  }

  const mode = body.mode === "full" ? "full" : "quick";
  const result = await runNativeAudit({
    site: { id: client.id, name: client.name, url: client.url },
    config: {
      mode,
      maxPages: mode === "quick" ? 1 : 25,
      render: false,
    },
  });
  const saved = await saveNativeAuditRun({ clientId, result });
  return NextResponse.json({
    runId: saved.runId,
    diffId: saved.diffId,
    score: result.score.globalScore,
    issues: result.issues.length,
    pagesCrawled: result.pagesCrawled,
  });
}
