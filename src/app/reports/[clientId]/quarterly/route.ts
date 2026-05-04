import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { generateQuarterlyStrategyPdf } from "@/lib/quarterly-strategy";

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
    pdf = await generateQuarterlyStrategyPdf(id);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }

  const today = new Date();
  const quarter = `q${Math.floor(today.getUTCMonth() / 3) + 1}-${today.getUTCFullYear()}`;
  const filename = `${safeFilename(client.name)}-quarterly-${quarter}.pdf`;

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
