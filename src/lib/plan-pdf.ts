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
 * WHAT WAS WRONG WITH THE FIRST VERSION
 *
 * Read back out of a real generated file, not guessed at:
 *
 *   - It never called `doc.font()`. Every word in the document — the
 *     title, the week headings, thirty task names and their
 *     explanations — was Helvetica regular. Hierarchy was size alone, so
 *     three pages of tasks read as one undifferentiated wall.
 *
 *   - The checkbox was the character "○" (U+25CB) and the tick "✓"
 *     (U+2713). The document declares Helvetica with WinAnsiEncoding,
 *     which contains neither, so each one was written as the two bytes
 *     0x25 0xCB and rendered as "%Ë" — thirty times, at the start of
 *     every task line.
 *
 *   - Nothing was ever filled. Seven hairlines across three pages and no
 *     other shape, so there was no way to see where one week ended and
 *     the next began without reading.
 *
 *   - No page numbers, on a document that runs to three pages or more.
 *
 * The rule taken from that: a PDF is only correct if somebody opens the
 * bytes and checks. It typechecked, it built, it downloaded, and the
 * checkbox had been broken since the day it shipped.
 *
 * Deliberately built on the same PDFKit patterns as proposal-pdf.ts
 * rather than a second approach. This codebase has been bitten enough
 * times by two implementations of one thing that the duplication is
 * worth more than the elegance would be.
 */

import PDFDocument from "pdfkit";
import { accentColor, isWhiteLabelled, loadBrand, type Brand } from "./brand";
import { groupPlanByWeek, type PlanItem, type PlanTaskRow } from "./plan-view";

export type PlanPdfInput = {
  clientName: string;
  clientUrl: string | null;
  tasks: readonly PlanTaskRow[];
  /** Health score at the time the plan was made, when known. */
  score?: number | null;
  issueCount?: number | null;
};

/**
 * The only two fonts used.
 *
 * Both are standard PDF base fonts, so nothing is embedded and no font
 * file has to ship. Named here because the previous version's real bug
 * was never naming one at all.
 */
const REGULAR = "Helvetica";
const BOLD = "Helvetica-Bold";

const INK = "#111827";
const MUTED = "#6b7280";
const FAINT = "#9ca3af";
const HAIRLINE = "#e5e7eb";
const STRIPE = "#f9fafb";

const MARGIN = 56;
/** Left column the checkbox sits in; text starts after it. */
const GUTTER = 22;

export async function generatePlanPdf(input: PlanPdfInput): Promise<Buffer> {
  const brand = await loadBrand();
  const accent = accentColor(brand);
  const agency = isWhiteLabelled(brand) ? brand.name!.trim() : null;
  const plan = groupPlanByWeek(input.tasks);

  const buffers: Buffer[] = [];
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 64, bottom: 72, left: MARGIN, right: MARGIN },
    // Needed to write page numbers, which cannot be known until the
    // whole document has been laid out.
    bufferPages: true,
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

  const width = doc.page.width - MARGIN * 2;
  const bottom = () => doc.page.height - doc.page.margins.bottom;

  // --- Cover ---------------------------------------------------------
  drawLogo(doc, brand);
  doc
    .font(BOLD)
    .fillColor(INK)
    .fontSize(26)
    .text("30-day SEO plan", { width });
  doc
    .font(REGULAR)
    .fillColor(MUTED)
    .fontSize(12)
    .text(
      input.clientName + (input.clientUrl ? ` · ${stripScheme(input.clientUrl)}` : ""),
      { width },
    );
  doc.moveDown(0.7);
  rule(doc, accent, width, 2);
  doc.moveDown(0.9);

  // The numbers this plan was built from, as a row of cards rather than
  // a bulleted list. Stated up front so next month's report has
  // something to be measured against — a plan with no starting point
  // cannot later be shown to have worked.
  drawStats(doc, width, accent, [
    typeof input.score === "number"
      ? { value: `${input.score}`, unit: "/100", label: "Health score today" }
      : null,
    typeof input.issueCount === "number"
      ? { value: `${input.issueCount}`, label: "Issues found in the audit" }
      : null,
    { value: `${plan.total}`, label: `Tasks across ${plan.weeks.length} weeks` },
    plan.totalMinutes > 0
      ? { value: `${Math.round(plan.totalMinutes / 60)}`, unit: "h", label: "Estimated work" }
      : null,
  ]);

  doc.moveDown(1.1);
  doc
    .font(REGULAR)
    .fillColor(MUTED)
    .fontSize(9.5)
    .text(
      "Each task says what it is and why it matters. Dates are a schedule, not a deadline — the order matters more than the day.",
      { width },
    );

  // --- Weeks ---------------------------------------------------------
  for (const w of plan.weeks) {
    doc.moveDown(1.3);
    // A week header with only a line or two under it reads as orphaned.
    // Breaking early costs a little paper and saves the reader.
    if (doc.y > bottom() - 150) doc.addPage();

    drawWeekBand(doc, w.label, w.range, `${w.items.length}`, accent, width);

    let stripe = false;
    for (const t of w.items) {
      const h = taskHeight(doc, t, width - GUTTER);
      if (doc.y + h > bottom()) {
        doc.addPage();
        // Repeat the band so a week split across pages still says which
        // week the reader is in.
        drawWeekBand(doc, w.label, w.range, `${w.items.length}`, accent, width, true);
        stripe = false;
      }
      drawTask(doc, t, width, accent, stripe);
      stripe = !stripe;
    }
  }

  drawFooters(doc, agency, accent);

  doc.end();
  return done;
}

// ---------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------

type Stat = { value: string; unit?: string; label: string } | null;

/**
 * The opening numbers, as cards.
 *
 * They were a bulleted list, which buries the one thing a client looks
 * for — the score — in a sentence identical in weight to everything
 * around it.
 */
function drawStats(
  doc: PDFKit.PDFDocument,
  width: number,
  accent: string,
  stats: Stat[],
) {
  const shown = stats.filter((s): s is NonNullable<Stat> => s !== null);
  if (shown.length === 0) return;

  const gap = 10;
  const cardW = (width - gap * (shown.length - 1)) / shown.length;
  const cardH = 52;
  const top = doc.y;

  shown.forEach((s, i) => {
    const x = MARGIN + i * (cardW + gap);
    doc.roundedRect(x, top, cardW, cardH, 6).fill(STRIPE);

    doc.font(BOLD).fillColor(i === 0 ? accent : INK).fontSize(19);
    const valueW = doc.widthOfString(s.value);
    doc.text(s.value, x + 12, top + 11, { lineBreak: false });
    if (s.unit) {
      doc
        .font(REGULAR)
        .fillColor(FAINT)
        .fontSize(11)
        .text(s.unit, x + 12 + valueW + 1, top + 18, { lineBreak: false });
    }
    doc
      .font(REGULAR)
      .fillColor(MUTED)
      .fontSize(8)
      .text(s.label, x + 12, top + 34, { width: cardW - 24, lineBreak: false });
  });

  doc.y = top + cardH;
  doc.x = MARGIN;
}

/** The week header: a filled band, so weeks are findable by eye. */
function drawWeekBand(
  doc: PDFKit.PDFDocument,
  label: string,
  range: string,
  count: string,
  accent: string,
  width: number,
  continued = false,
) {
  const h = 26;
  const y = doc.y;
  doc.roundedRect(MARGIN, y, width, h, 4).fill(accent);

  doc
    .font(BOLD)
    .fillColor("#ffffff")
    .fontSize(11)
    .text(continued ? `${label} (continued)` : label, MARGIN + 10, y + 8, {
      lineBreak: false,
    });

  doc
    .font(REGULAR)
    .fillColor("#ffffff")
    .fontSize(9)
    .text(`${range}  ·  ${count} task${count === "1" ? "" : "s"}`, MARGIN, y + 9, {
      width: width - 10,
      align: "right",
      lineBreak: false,
    });

  doc.y = y + h + 6;
  doc.x = MARGIN;
}

/** How tall this task's block will be, so the row can be drawn first. */
function taskHeight(
  doc: PDFKit.PDFDocument,
  t: PlanItem,
  textWidth: number,
): number {
  const title = doc.font(BOLD).fontSize(10.5).heightOfString(t.title, {
    width: textWidth,
  });
  const why = t.whyItMatters
    ? doc.font(REGULAR).fontSize(9).heightOfString(t.whyItMatters, {
        width: textWidth,
      })
    : 0;
  // 8 top padding + title + 2 + why + 3 + meta line + 8 bottom padding
  return 8 + title + (why ? 2 + why : 0) + 3 + 10 + 8;
}

function drawTask(
  doc: PDFKit.PDFDocument,
  t: PlanItem,
  width: number,
  accent: string,
  stripe: boolean,
) {
  const textWidth = width - GUTTER;
  const h = taskHeight(doc, t, textWidth);
  const top = doc.y;
  const isDone = t.status === "done";

  if (stripe) doc.rect(MARGIN, top, width, h).fill(STRIPE);

  // A real checkbox, drawn. The previous version used "○", which the
  // document's WinAnsi Helvetica cannot encode — it came out as "%Ë" on
  // every one of the thirty tasks.
  const boxY = top + 10;
  doc
    .roundedRect(MARGIN + 2, boxY, 9, 9, 2)
    .lineWidth(1)
    .strokeColor(isDone ? accent : "#d1d5db")
    .stroke();
  if (isDone) {
    // A tick as two strokes rather than a glyph, for the same reason.
    doc
      .moveTo(MARGIN + 4, boxY + 4.5)
      .lineTo(MARGIN + 6, boxY + 6.8)
      .lineTo(MARGIN + 9.2, boxY + 2.2)
      .lineWidth(1.4)
      .strokeColor(accent)
      .stroke();
  }

  const x = MARGIN + GUTTER;
  doc
    .font(BOLD)
    .fillColor(isDone ? FAINT : INK)
    .fontSize(10.5)
    .text(t.title, x, top + 8, { width: textWidth });

  if (t.whyItMatters) {
    doc.moveDown(0.15);
    doc
      .font(REGULAR)
      .fillColor(MUTED)
      .fontSize(9)
      .text(t.whyItMatters, x, doc.y, { width: textWidth });
  }

  const meta = [t.dueLabel];
  if (t.estimatedMinutes) meta.push(`${t.estimatedMinutes} min`);
  doc
    .font(REGULAR)
    .fillColor(FAINT)
    .fontSize(8)
    .text(meta.join("   ·   "), x, doc.y + 2, { width: textWidth });

  doc.y = top + h;
  doc.x = MARGIN;
}

/**
 * Footers, written after layout because page numbers cannot be known
 * before it. A three-page document without them is one nobody can
 * discuss over the phone.
 */
function drawFooters(
  doc: PDFKit.PDFDocument,
  agency: string | null,
  accent: string,
) {
  const generated = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const left = agency
    ? `Prepared by ${agency} · ${generated}`
    : `Generated ${generated}`;

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - 48;
    const width = doc.page.width - MARGIN * 2;

    doc
      .moveTo(MARGIN, y - 10)
      .lineTo(MARGIN + width, y - 10)
      .lineWidth(0.5)
      .strokeColor(HAIRLINE)
      .stroke();

    doc
      .font(REGULAR)
      .fillColor(FAINT)
      .fontSize(8)
      .text(left, MARGIN, y, { width, lineBreak: false });
    doc
      .font(REGULAR)
      .fillColor(accent)
      .fontSize(8)
      .text(`${i - range.start + 1} / ${range.count}`, MARGIN, y, {
        width,
        align: "right",
        lineBreak: false,
      });
  }
  doc.flushPages();
}

function drawLogo(doc: PDFKit.PDFDocument, brand: Brand) {
  const src = brand.logoDataUrl;
  if (!src?.startsWith("data:image/")) return;
  try {
    const b64 = src.slice(src.indexOf(",") + 1);
    doc.image(Buffer.from(b64, "base64"), { fit: [130, 42] });
    doc.moveDown(0.6);
  } catch {
    // A logo that will not decode is not worth failing a document over.
  }
}

function rule(
  doc: PDFKit.PDFDocument,
  color: string,
  width: number,
  lineWidth = 1,
) {
  const y = doc.y;
  doc
    .moveTo(MARGIN, y)
    .lineTo(MARGIN + width, y)
    .lineWidth(lineWidth)
    .strokeColor(color)
    .stroke();
  doc.y = y + 3;
  doc.x = MARGIN;
}

function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

/**
 * Every character this document can actually print.
 *
 * WinAnsi covers Latin-1 plus a handful of typographic extras. Anything
 * outside it is silently written as its raw code units and renders as
 * mojibake — which is exactly how "○" became "%Ë" on thirty lines.
 * Exported so the test can assert no generated string contains one.
 */
export function unencodableCharacters(s: string): string[] {
  const EXTRA = new Set([
    "€", "‚", "ƒ", "„", "…", "†", "‡", "ˆ", "‰", "Š", "‹", "Œ", "Ž",
    "‘", "’", "“", "”", "•", "–", "—", "˜", "™", "š", "›", "œ", "ž", "Ÿ",
  ]);
  const bad: string[] = [];
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (code <= 0xff) continue;
    if (EXTRA.has(ch)) continue;
    if (!bad.includes(ch)) bad.push(ch);
  }
  return bad;
}
