/**
 * Render a proposal to PDF.
 *
 * Deliberately plain. A proposal competes with a Word document someone
 * spent an evening on, and the way to win that is to look considered,
 * not to look generated — so no gradient hero, no score gauge, no
 * dashboard chrome. Cover, what we found, what we'd do, what it costs,
 * terms.
 *
 * The one thing this document asserts beyond the user's own words is the
 * finding count per scope line, and that number is real: it comes from
 * the audit the proposal cites, on the date it cites.
 */

import PDFDocument from "pdfkit";
import { registerInterFonts, pickFont } from "./report-fonts";
import { accentColor, isWhiteLabelled, loadBrand, type Brand } from "./brand";

export type ProposalDoc = {
  prospectName: string;
  prospectUrl: string | null;
  title: string;
  intro: string | null;
  scope: { label: string; detail: string; findings: number }[];
  pricing: { label: string; detail: string; amount: number }[];
  currency: string;
  terms: string | null;
  basedOnScore: number | null;
  basedOnAt: Date | null;
  /**
   * Where the site ranks today, before any work. Optional, and only
   * populated for a kickoff document — a client signing off on a plan
   * needs the starting line written down, or there is nothing to measure
   * the next report against.
   *
   * Counts are computed from tracked keywords and their latest checked
   * rank. Nothing here is model-written.
   */
  keywordBaseline?: {
    tracked: number;
    ranking: number;
    inTopTen: number;
    strikingDistance: number;
    /** A few real examples, so the number is checkable. */
    examples: { keyword: string; position: number | null }[];
    /**
     * The list itself. Optional — documents built before this existed
     * carry counts and no list, and those must keep rendering.
     */
    map?: {
      keyword: string;
      intent: string;
      position: number | null;
      targetPage: string | null;
    }[];
  } | null;
  /** Week-by-week plan the client is being asked to approve. */
  timeline?: {
    week: string;
    focus: string;
    items: string[];
    /** "Foundation · days 1-30" etc. Absent on older documents. */
    phase?: string;
  }[] | null;
  /**
   * Where we'll work — the engagement's boundary, in and out.
   *
   * The section every agency scope-of-work leads with, and the one this
   * document had no answer for: it told the client what we found and
   * when things happen, and never what places the work covers.
   */
  surfaces?: {
    inScope: { label: string; detail: string }[];
    outOfScope: { label: string }[];
  } | null;
};

const INK = "#111827";
const MUTE = "#6b7280";
const RULE = "#e5e7eb";

export async function generateProposalPdf(
  proposal: ProposalDoc,
): Promise<Buffer> {
  const brand = await loadBrand();
  const accent = accentColor(brand);
  const agency = isWhiteLabelled(brand) ? brand.name!.trim() : null;

  const buffers: Buffer[] = [];
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 64, bottom: 64, left: 56, right: 56 },
    info: {
      Title: proposal.title,
      // The PDF metadata is a white-label surface too. A prospect opening
      // Document Properties should see the agency, not our product.
      Author: agency ?? "SEO Tool",
      Subject: `SEO proposal for ${proposal.prospectName}`,
    },
  });

  doc.on("data", (c: Buffer) => buffers.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(buffers)));
  });

  const hasInter = registerInterFonts(doc);
  const F = (s: "regular" | "bold" | "italic") => pickFont(hasInter, s);
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  const ensure = (needed: number) => {
    if (doc.y + needed > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
    }
  };

  // ---- Cover -------------------------------------------------------
  drawLogo(doc, brand);

  doc.moveDown(2);
  doc.font(F("bold")).fontSize(26).fillColor(INK).text(proposal.title, {
    width,
  });

  doc.moveDown(0.4);
  doc
    .font(F("regular"))
    .fontSize(12)
    .fillColor(MUTE)
    .text(
      `Prepared for ${proposal.prospectName}${proposal.prospectUrl ? ` · ${stripScheme(proposal.prospectUrl)}` : ""}`,
      { width },
    );

  doc.moveDown(0.2);
  doc
    .fontSize(10)
    .text(
      `${agency ? `${agency} · ` : ""}${new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}`,
      { width },
    );

  doc.moveDown(1);
  rule(doc, accent, width);

  // ---- Intro -------------------------------------------------------
  if (proposal.intro?.trim()) {
    doc.moveDown(1);
    doc.font(F("regular")).fontSize(11).fillColor(INK).text(proposal.intro.trim(), {
      width,
      align: "left",
      lineGap: 3,
    });
  }

  // ---- What we found ----------------------------------------------
  //
  // Cited with its date. A proposal quoting a crawl from four months ago
  // is worse than one quoting none, and the prospect can check.
  if (proposal.basedOnScore !== null || proposal.scope.length > 0) {
    doc.moveDown(1.5);
    ensure(90);
    heading(doc, F, "What we found", accent);

    const totalFindings = proposal.scope.reduce((n, s) => n + s.findings, 0);
    const parts: string[] = [];
    if (proposal.basedOnScore !== null) {
      parts.push(`an overall health score of ${proposal.basedOnScore} out of 100`);
    }
    if (totalFindings > 0) {
      parts.push(
        `${totalFindings} issue${totalFindings === 1 ? "" : "s"} worth addressing`,
      );
    }

    doc
      .font(F("regular"))
      .fontSize(11)
      .fillColor(INK)
      .text(
        `We ran a technical audit of ${stripScheme(proposal.prospectUrl ?? proposal.prospectName)}${
          proposal.basedOnAt
            ? ` on ${proposal.basedOnAt.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}`
            : ""
        }. It showed ${parts.join(" and ")}. The work below addresses what it found — nothing is included that the audit didn't surface.`,
        { width, lineGap: 3 },
      );
  }

  // ---- Where we'll work --------------------------------------------
  // Placed before the findings-derived scope on purpose. Findings say
  // what is broken; this says what the engagement covers, and a reader
  // needs the boundary before the detail. The out-of-scope half is the
  // part that prevents the month-three conversation that starts "I
  // assumed you were also doing…".
  const sf = proposal.surfaces;
  if (sf && (sf.inScope.length > 0 || sf.outOfScope.length > 0)) {
    doc.moveDown(1.4);
    ensure(90);
    heading(doc, F, "Where we'll work", accent);

    for (const line of sf.inScope) {
      ensure(52);
      doc.moveDown(0.45);
      doc
        .font(F("bold"))
        .fontSize(11.5)
        .fillColor(INK)
        .text(line.label, doc.page.margins.left, doc.y, { width });
      doc
        .font(F("regular"))
        .fontSize(10)
        .fillColor(MUTE)
        .text(line.detail, doc.page.margins.left, doc.y + 2, {
          width,
          lineGap: 2,
        });
    }

    if (sf.outOfScope.length > 0) {
      doc.moveDown(0.7);
      ensure(36);
      doc
        .font(F("regular"))
        .fontSize(9.5)
        .fillColor(MUTE)
        .text(
          `Not included in this engagement: ${sf.outOfScope
            .map((o) => o.label.toLowerCase())
            .join(", ")}.`,
          doc.page.margins.left,
          doc.y,
          { width, lineGap: 2 },
        );
    }
  }

  // ---- Scope -------------------------------------------------------
  if (proposal.scope.length > 0) {
    doc.moveDown(1.4);
    ensure(80);
    heading(doc, F, "What we'd do", accent);

    for (const line of proposal.scope) {
      ensure(64);
      doc.moveDown(0.5);

      const y = doc.y;
      doc.font(F("bold")).fontSize(11.5).fillColor(INK).text(line.label, {
        width: width - 90,
        continued: false,
      });

      // Real count, right-aligned on the label's line.
      doc
        .font(F("regular"))
        .fontSize(9.5)
        .fillColor(MUTE)
        .text(
          `${line.findings} finding${line.findings === 1 ? "" : "s"}`,
          doc.page.margins.left + width - 90,
          y + 1,
          { width: 90, align: "right" },
        );

      doc.x = doc.page.margins.left;
      doc
        .font(F("regular"))
        .fontSize(10)
        .fillColor(MUTE)
        .text(line.detail, doc.page.margins.left, doc.y + 2, {
          width,
          lineGap: 2,
        });
    }
  }

  // ---- Where you stand today ---------------------------------------
  // The starting line, in writing. Without it the first monthly report
  // has nothing to compare against and "we improved things" is unprovable.
  const kb = proposal.keywordBaseline;
  if (kb && kb.tracked > 0) {
    doc.moveDown(1.6);
    ensure(120);
    heading(doc, F, "Where you stand today", accent);
    doc.moveDown(0.4);

    const stats: [string, string][] = [
      ["Keywords tracked", String(kb.tracked)],
      ["Already ranking", String(kb.ranking)],
      ["On page one", String(kb.inTopTen)],
      ["Close to page one (11–20)", String(kb.strikingDistance)],
    ];
    for (const [label, value] of stats) {
      ensure(20);
      const y = doc.y;
      doc
        .font(F("regular"))
        .fontSize(10.5)
        .fillColor(MUTE)
        .text(label, doc.page.margins.left, y, { width: width - 70 });
      doc
        .font(F("bold"))
        .fontSize(10.5)
        .fillColor(INK)
        .text(value, doc.page.margins.left + width - 70, y, {
          width: 70,
          align: "right",
        });
      doc.x = doc.page.margins.left;
    }

    // The list itself.
    //
    // This used to be "For example:" and three keywords. The keyword
    // list is the one part of the document a client can check against
    // their own knowledge of their business — it is what they will push
    // back on, and withholding it made the numbers above unarguable
    // rather than trustworthy. Falls back to the old sentence for
    // documents built before the map existed.
    if (kb.map && kb.map.length > 0) {
      doc.moveDown(0.9);
      ensure(70);
      doc
        .font(F("bold"))
        .fontSize(10.5)
        .fillColor(INK)
        .text("The keywords", doc.page.margins.left, doc.y, { width });
      doc.moveDown(0.3);

      // Column geometry, once. Position is right-aligned because a
      // column of numbers that does not line up is harder to scan than
      // no column at all.
      const cKw = Math.round(width * 0.42);
      const cIntent = Math.round(width * 0.2);
      const cPos = Math.round(width * 0.1);
      const cPage = width - cKw - cIntent - cPos;
      const L = doc.page.margins.left;

      const headRow = doc.y;
      doc.font(F("bold")).fontSize(8.5).fillColor(MUTE);
      doc.text("KEYWORD", L, headRow, { width: cKw });
      doc.text("INTENT", L + cKw, headRow, { width: cIntent });
      doc.text("NOW", L + cKw + cIntent, headRow, {
        width: cPos,
        align: "right",
      });
      doc.text("PAGE", L + cKw + cIntent + cPos + 8, headRow, {
        width: cPage - 8,
      });
      doc.x = L;
      doc.y = headRow + 12;
      rule(doc, RULE, width);
      doc.moveDown(0.35);

      for (const k of kb.map) {
        ensure(18);
        const y = doc.y;
        doc.font(F("regular")).fontSize(9.5).fillColor(INK);
        doc.text(k.keyword, L, y, { width: cKw - 6, ellipsis: true, lineBreak: false });
        doc.fillColor(MUTE);
        doc.text(shortIntent(k.intent), L + cKw, y, {
          width: cIntent,
          lineBreak: false,
        });
        doc.fillColor(k.position === null ? MUTE : INK);
        doc.text(
          k.position === null ? "—" : String(k.position),
          L + cKw + cIntent,
          y,
          { width: cPos, align: "right", lineBreak: false },
        );
        doc.fillColor(MUTE);
        doc.text(k.targetPage ?? "needs a page", L + cKw + cIntent + cPos + 8, y, {
          width: cPage - 8,
          ellipsis: true,
          lineBreak: false,
        });
        doc.x = L;
        doc.y = y + 13;
      }

      doc.moveDown(0.5);
      doc
        .font(F("regular"))
        .fontSize(8.5)
        .fillColor(MUTE)
        .text(
          "“Now” is the current Google position, blank where the site does not rank for it yet.",
          L,
          doc.y,
          { width, lineGap: 2 },
        );
    } else if (kb.examples.length > 0) {
      doc.moveDown(0.6);
      ensure(40);
      doc
        .font(F("regular"))
        .fontSize(9.5)
        .fillColor(MUTE)
        .text(
          `For example: ${kb.examples
            .map(
              (e) =>
                `“${e.keyword}” ${
                  e.position === null ? "not ranking yet" : `at #${e.position}`
                }`,
            )
            .join(", ")}.`,
          doc.page.margins.left,
          doc.y,
          { width, lineGap: 2 },
        );
    }
  }

  // ---- The plan ----------------------------------------------------
  const timeline = proposal.timeline;
  if (timeline && timeline.length > 0) {
    doc.moveDown(1.6);
    ensure(120);
    heading(doc, F, "What happens, and when", accent);

    // Phase banners between the weeks.
    //
    // A list of thirteen weeks is a list; the phases are what make it a
    // plan a client can hold in their head. Printed only when the phase
    // changes, and skipped entirely on documents built before phases
    // existed — where `phase` is undefined, this renders exactly as it
    // used to.
    let lastPhase: string | null = null;

    for (const phase of timeline) {
      if (phase.phase && phase.phase !== lastPhase) {
        lastPhase = phase.phase;
        ensure(46);
        doc.moveDown(timeline[0] === phase ? 0.4 : 1);
        doc
          .font(F("bold"))
          .fontSize(9)
          .fillColor(accent)
          .text(phase.phase.toUpperCase(), doc.page.margins.left, doc.y, {
            width,
            characterSpacing: 0.6,
          });
        doc.moveDown(0.15);
        rule(doc, RULE, width);
      }

      ensure(70);
      doc.moveDown(0.5);
      doc
        .font(F("bold"))
        .fontSize(11.5)
        .fillColor(INK)
        .text(`${phase.week} — ${phase.focus}`, doc.page.margins.left, doc.y, {
          width,
        });
      for (const item of phase.items) {
        ensure(18);
        doc
          .font(F("regular"))
          .fontSize(10)
          .fillColor(MUTE)
          .text(`·  ${item}`, doc.page.margins.left + 10, doc.y + 2, {
            width: width - 10,
            lineGap: 2,
          });
      }
      doc.x = doc.page.margins.left;
    }
  }

  // ---- Pricing -----------------------------------------------------
  if (proposal.pricing.length > 0) {
    doc.moveDown(1.6);
    ensure(120);
    heading(doc, F, "Investment", accent);
    doc.moveDown(0.4);

    let total = 0;
    for (const item of proposal.pricing) {
      ensure(40);
      total += item.amount;

      const y = doc.y;
      doc.font(F("bold")).fontSize(11).fillColor(INK).text(item.label, {
        width: width - 120,
      });
      doc
        .font(F("bold"))
        .fontSize(11)
        .fillColor(INK)
        .text(
          money(item.amount, proposal.currency),
          doc.page.margins.left + width - 120,
          y,
          { width: 120, align: "right" },
        );

      if (item.detail?.trim()) {
        doc.x = doc.page.margins.left;
        doc
          .font(F("regular"))
          .fontSize(9.5)
          .fillColor(MUTE)
          .text(item.detail, doc.page.margins.left, doc.y + 1, {
            width: width - 120,
            lineGap: 2,
          });
      }
      doc.moveDown(0.5);
    }

    ensure(40);
    doc.moveDown(0.3);
    rule(doc, RULE, width);
    doc.moveDown(0.5);

    const y = doc.y;
    doc.font(F("bold")).fontSize(12).fillColor(INK).text("Total", { width: width - 120 });
    doc
      .font(F("bold"))
      .fontSize(12)
      .fillColor(accent)
      .text(money(total, proposal.currency), doc.page.margins.left + width - 120, y, {
        width: 120,
        align: "right",
      });
    doc.x = doc.page.margins.left;
  }

  // ---- Terms -------------------------------------------------------
  if (proposal.terms?.trim()) {
    doc.moveDown(1.6);
    ensure(80);
    heading(doc, F, "Terms", accent);
    doc.moveDown(0.3);
    doc
      .font(F("regular"))
      .fontSize(10)
      .fillColor(MUTE)
      .text(proposal.terms.trim(), { width, lineGap: 3 });
  }

  // ---- Footer ------------------------------------------------------
  if (agency) {
    doc.moveDown(2);
    ensure(50);
    rule(doc, RULE, width);
    doc.moveDown(0.5);
    const contact = [brand.website, brand.email, brand.phone]
      .filter(Boolean)
      .join("  ·  ");
    doc
      .font(F("regular"))
      .fontSize(9)
      .fillColor(MUTE)
      .text(contact ? `${agency}  ·  ${contact}` : agency, { width });
    if (brand.footerText) {
      doc.fontSize(8).text(brand.footerText, { width });
    }
  }

  doc.end();
  return done;
}

function drawLogo(doc: PDFKit.PDFDocument, brand: Brand) {
  if (!brand.logoBuffer) return;
  try {
    doc.image(brand.logoBuffer, doc.page.margins.left, doc.page.margins.top, {
      fit: [150, 46],
    });
    doc.y = doc.page.margins.top + 56;
  } catch {
    // A corrupt logo must not cost the whole proposal.
  }
}

function heading(
  doc: PDFKit.PDFDocument,
  F: (s: "regular" | "bold" | "italic") => string,
  text: string,
  accent: string,
) {
  doc.font(F("bold")).fontSize(9).fillColor(accent).text(text.toUpperCase(), {
    characterSpacing: 1.2,
  });
  doc.moveDown(0.25);
}

function rule(doc: PDFKit.PDFDocument, color: string, width: number) {
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.margins.left + width, doc.y)
    .lineWidth(1)
    .strokeColor(color)
    .stroke();
  doc.y += 2;
}

/**
 * Intent, in words a client understands.
 *
 * "transactional" and "commercial" are our vocabulary, not theirs, and
 * this document is the one place in the app written for somebody who
 * does not do SEO for a living.
 */
function shortIntent(intent: string): string {
  switch (intent) {
    case "transactional":
      return "ready to buy";
    case "commercial":
      return "comparing";
    case "navigational":
      return "looking for you";
    case "informational":
      return "researching";
    default:
      return intent;
  }
}

function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

/**
 * Format money without pretending to know more than we do.
 *
 * Falls back to "CODE 1,234" for anything Intl doesn't recognise rather
 * than throwing — a typo in a currency field should not take down the
 * document someone is about to send a client.
 */
function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}
