import { NextResponse } from "next/server";
import { mayAccessClient } from "@/lib/client-scope";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { generateQuarterlyStrategyPdf } from "@/lib/quarterly-strategy";
import { getReportLocale } from "@/lib/report-i18n";

export const dynamic = "force-dynamic";

function safeFilename(name: string): string {
  return name.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "client";
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await ctx.params;
  const id = Number(clientId);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid client id" }, { status: 400 });
  }
  if (!(await mayAccessClient(id))) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, id))
    .limit(1);
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const locale = await getReportLocale();
  let pdf: Buffer;
  try {
    pdf = await generateQuarterlyStrategyPdf(id, { locale });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }

  const today = new Date();
  const q = Math.floor(today.getUTCMonth() / 3) + 1;
  const filename =
    locale === "fr"
      ? `${safeFilename(client.name)}-bilan-trimestriel-t${q}-${today.getUTCFullYear()}.pdf`
      : `${safeFilename(client.name)}-quarterly-q${q}-${today.getUTCFullYear()}.pdf`;

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
