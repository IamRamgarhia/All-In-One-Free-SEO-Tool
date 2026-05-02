import { NextResponse } from "next/server";
import {
  generateReportPdf,
  type ReportTemplate,
} from "@/lib/report-generator";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";

export const dynamic = "force-dynamic";

const ALLOWED: ReportTemplate[] = ["executive", "detailed", "technical"];

function safeFilename(name: string): string {
  return name.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "client";
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await ctx.params;
  const id = Number(clientId);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid client id" }, { status: 400 });
  }

  const url = new URL(request.url);
  const tplParam = url.searchParams.get("template") as ReportTemplate | null;
  const template: ReportTemplate =
    tplParam && ALLOWED.includes(tplParam) ? tplParam : "detailed";

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, id))
    .limit(1);
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  let pdf: Buffer;
  try {
    pdf = await generateReportPdf(id, template);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }

  const today = new Date().toISOString().split("T")[0];
  const filename = `${safeFilename(client.name)}-${template}-${today}.pdf`;

  // @ts-expect-error - Buffer is valid BodyInit at runtime
  return new NextResponse(pdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pdf.length),
    },
  });
}
