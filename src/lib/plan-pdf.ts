/**
 * The 30-day plan as a document you can send someone.
 *
 * The CSV exists for the person doing the work, who pastes it into a
 * spreadsheet and edits it. This is the other half: the thing a client
 * reads, which has to say what is being done and why in words rather
 * than in columns.
 *
 * White-labelled like the proposal PDF — same brand, same accent, same
 * metadata rules. A client opening Document Properties should see the
 * agency, not our product name.
 *
 * Deliberately built on the same PDFKit patterns as proposal-pdf.ts
 * rather than a second approach. This codebase has been bitten enough
 * times by two implementations of one thing that the duplication is
 * worth more than the elegance would be.
 */

import PDFDocument from "pdfkit";
import { accentColor, isWhiteLabelled, loadBrand, type Brand } from "./brand";
import { groupPlanByWeek, type PlanTaskRow } from "./plan-view";

export type PlanPdfInput = {
  clientName: string;
  clientUrl: string | null;
  tasks: readonly PlanTaskRow[];
  /** Health score at the time the plan was made, when known. */
  score?: number | null;
  issueCount?: number | null;
};

export async function generatePlanPdf(input: PlanPdfInput): Promise<Buffer> {
  const brand = await loadBrand();
  const accent = accentColor(brand);
  const agency = isWhiteLabelled(brand) ? brand.name!.trim() : null;
  const plan = groupPlanByWeek(input.tasks);

  const buffers: Buffer[] = [];
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 64, bottom: 64, left: 56, right: 56 },
    info: {
      Title: `30-day SEO plan — ${input.clientName}`,
      Author: agency ?? "SEO Tool",
      Subject: `What happens in which week for ${input.clientName}`,
    },
  });
  doc.on("data", (b: Buffer) => buffers.push(b));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(buffers)));
  });

  const width = doc.page.width - 112;

  // --- Cover ---------------------------------------------------------
  drawLogo(doc, brand);
  doc.moveDown(0.5);
  doc
    .fillColor("#111827")
    .fontSize(26)
    .text("30-day SEO plan", { width });
  doc
    .fillColor("#6b7280")
    .fontSize(13)
    .text(input.clientName + (input.clientUrl ? ` · ${stripScheme(input.clientUrl)}` : ""), {
      width,
    });
  doc.moveDown(0.6);
  rule(doc, accent, width);
  doc.moveDown(0.8);

  // The numbers this plan was built from. Stated up front so next
  // month's report has something to be measured against — a plan with
  // no starting point cannot be shown to have worked.
  const facts: string[] = [];
  if (typeof input.score === "number") {
    facts.push(`Health score today: ${input.score}/100`);
  }
  if (typeof input.issueCount === "number") {
    facts.push(`${input.issueCount} issues found in the audit`);
  }
  facts.push(`${plan.total} tasks across ${plan.weeks.length} weeks`);
  if (plan.totalMinutes > 0) {
    facts.push(`About ${Math.round(plan.totalMinutes / 60)} hours of work`);
  }
  doc.fillColor("#374151").fontSize(10.5);
  for (const f of facts) doc.text(`•  ${f}`, { width });

  doc.moveDown(1);
  doc
    .fillColor("#6b7280")
    .fontSize(9.5)
    .text(
      "Each task below says what it is and why it matters. Dates are a schedule, not a deadline — the order matters more than the day.",
      { width },
    );

  // --- Weeks ---------------------------------------------------------
  for (const w of plan.weeks) {
    doc.moveDown(1.2);
    // A week that would start within a few lines of the page bottom
    // reads as an orphaned header. Cheaper to break early.
    if (doc.y > doc.page.height - 180) doc.addPage();

    heading(doc, `${w.label} — ${w.range}`, accent, width);

    for (const t of w.items) {
      if (doc.y > doc.page.height - 120) doc.addPage();
      doc.moveDown(0.45);

      const mark = t.status === "done" ? "✓" : "○";
      doc
        .fillColor(t.status === "done" ? "#9ca3af" : "#111827")
        .fontSize(11)
        .text(`${mark}  ${t.title}`, { width });

      if (t.whyItMatters) {
        doc
          .fillColor("#6b7280")
          .fontSize(9.5)
          .text(t.whyItMatters, { width, indent: 16 });
      }

      const meta = [t.dueLabel];
      if (t.estimatedMinutes) meta.push(`${t.estimatedMinutes} min`);
      doc
        .fillColor("#9ca3af")
        .fontSize(8.5)
        .text(meta.join("  ·  "), { width, indent: 16 });
    }
  }

  // --- Footer --------------------------------------------------------
  doc.moveDown(1.5);
  if (doc.y > doc.page.height - 120) doc.addPage();
  rule(doc, "#e5e7eb", width);
  doc.moveDown(0.5);
  doc
    .fillColor("#9ca3af")
    .fontSize(8.5)
    .text(
      agency
        ? `Prepared by ${agency}. Generated ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.`
        : `Generated ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.`,
      { width },
    );

  doc.end();
  return done;
}

function drawLogo(doc: PDFKit.PDFDocument, brand: Brand) {
  const src = brand.logoDataUrl;
  if (!src?.startsWith("data:image/")) return;
  try {
    const b64 = src.slice(src.indexOf(",") + 1);
    doc.image(Buffer.from(b64, "base64"), { fit: [130, 42] });
    doc.moveDown(0.4);
  } catch {
    // A logo that will not decode is not worth failing a document over.
  }
}

function heading(
  doc: PDFKit.PDFDocument,
  text: string,
  accent: string,
  width: number,
) {
  doc.fillColor(accent).fontSize(13).text(text, { width });
  doc.moveDown(0.2);
  rule(doc, "#e5e7eb", width);
}

function rule(doc: PDFKit.PDFDocument, color: string, width: number) {
  const y = doc.y;
  doc
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.margins.left + width, y)
    .lineWidth(1)
    .strokeColor(color)
    .stroke();
  doc.moveDown(0.3);
}

function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}
