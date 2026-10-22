import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { audits } from "@/db/schema";
import type { SeomatorAuditProgress } from "@/lib/seomator-audit-progress";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const auditId = Number(id);
  if (!Number.isFinite(auditId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const [row] = await db
    .select({
      status: audits.status,
      pagesCrawled: audits.pagesCrawled,
      progressJson: audits.progressJson,
      previewScreenshotPath: audits.previewScreenshotPath,
      score: audits.score,
    })
    .from(audits)
    .where(eq(audits.id, auditId))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    status: row.status,
    pagesCrawled: row.pagesCrawled,
    score: row.score,
    previewScreenshotPath: row.previewScreenshotPath,
    progress: row.progressJson as SeomatorAuditProgress | null,
  });
}
