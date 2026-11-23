import { NextResponse } from "next/server";
import { currentUser, userMayEdit } from "@/lib/auth";
import { mayAccessClient } from "@/lib/client-scope";
import {
  generateReportPdf,
  type ReportTemplate,
} from "@/lib/report-generator";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, reportArchives } from "@/db/schema";
import { getSetting } from "@/lib/settings-store";
import { getLocale, getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

const ALLOWED: ReportTemplate[] = [
  "executive",
  "detailed",
  "technical",
  "ceo",
  "cmo",
  "cto",
  "junior",
];

/** Accents off, for a file name: "détaillé" → "detaille". */
function fold(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

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
  if (!(await mayAccessClient(id))) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
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

  // Branding pre-flight: if workspace brand isn't set up AND the user
  // hasn't opted out for this client, bounce them back to the client
  // page with a banner. They can either set branding or check "skip".
  if (!client.brandingSkipped) {
    const [brandName, brandLogo] = await Promise.all([
      getSetting<string>("brand.name"),
      getSetting<string>("brand.logo_data_url"),
    ]);
    if (!brandName || !brandLogo) {
      const back = new URL(`/clients/${id}`, request.url);
      back.searchParams.set("branding-needed", "1");
      back.searchParams.set("template", template);
      return NextResponse.redirect(back);
    }
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

  // Named in the reader's language: archive titles read "rapport detailed
  // — 2026-11-23", the raw template id and an ISO date, in the client's
  // portal.
  const today = new Date().toISOString().split("T")[0];
  const names = await getTranslations("auditUi.reports.archive");
  const locale = await getLocale();
  const templateName = names.has(`templateNames.${template}`) ? names(`templateNames.${template}`) : template;
  const filename = `${safeFilename(client.name)}-${safeFilename(fold(`${names("fileWord")}-${templateName}`))}-${today}.pdf`;
  const dateLabel = new Date().toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });

  // Archive — fire-and-forget, never block the download on a DB error.
  // A read-only client viewer still gets the PDF, but a download is not
  // a write they are allowed to make, so it leaves no archive row.
  if (userMayEdit(await currentUser())) {
    const t = await getTranslations("auditUi.reports.archive");
    const periodEnd = new Date();
    const periodStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    void db
      .insert(reportArchives)
      .values({
        clientId: id,
        title: t("entryTitle", { client: client.name, template: templateName, date: dateLabel }),
        periodStart,
        periodEnd,
        template,
        pdfBase64: pdf.toString("base64"),
        pdfBytes: pdf.length,
        // A download is a copy to read, not a delivery. The column
        // defaults to "approved", which the client's portal lists, so a
        // PDF fetched to check it reached the client at once. As a
        // draft it waits in the review queue (Reports → To review).
        status: "draft",
      })
      .catch(() => undefined);
  }

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
