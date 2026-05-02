import PDFDocument from "pdfkit";
import type { AuditFinding } from "@/lib/audit";
import { fetchSiteMetadata } from "@/lib/site-metadata";
import { getSetting } from "@/lib/settings-store";

type Color = string;

const palette = {
  ink: "#0f1117" as Color,
  mute: "#5b6173" as Color,
  rule: "#dde0e7" as Color,
  brand: "#6d49d6" as Color,
  good: "#0f9460" as Color,
  warn: "#b76b00" as Color,
  bad: "#c43151" as Color,
};

const sevColor = {
  critical: palette.bad,
  high: palette.bad,
  medium: palette.warn,
  low: palette.mute,
} as const;

export type GraderInput = {
  url: string;
  finalUrl: string;
  score: number;
  pagesCrawled: number;
  counts: { critical: number; high: number; medium: number; low: number };
  findings: AuditFinding[];
};

/**
 * Generate a one-shot PDF for the public site grader. Pulls the agency's brand
 * settings (logo, name, color) when configured; otherwise falls back to the
 * audited site's own logo + name fetched live from the URL.
 */
export async function generateGraderPdf(input: GraderInput): Promise<Buffer> {
  // Brand precedence: agency settings > client site auto-fetched
  const [agencyName, agencyColor, agencyLogoData] = await Promise.all([
    getSetting<string>("brand.name"),
    getSetting<string>("brand.color"),
    getSetting<string>("brand.logo_data_url"),
  ]);

  const meta = await fetchSiteMetadata(input.finalUrl).catch(() => null);
  const siteName = meta?.name ?? hostnameOf(input.finalUrl);
  const accent =
    agencyColor && /^#[0-9a-f]{6}$/i.test(agencyColor)
      ? agencyColor
      : palette.brand;

  const buffers: Buffer[] = [];
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 60, bottom: 60, left: 56, right: 56 },
    info: {
      Title: `${siteName} — Instant SEO Audit`,
      Author: agencyName ?? "SEO Tool",
    },
  });

  doc.on("data", (chunk: Buffer) => buffers.push(chunk));
  const finished = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(buffers)));
  });

  // === Header strip ===
  drawHeader(doc, {
    accent,
    agencyName,
    agencyLogo: parseLogo(agencyLogoData),
  });

  // === Title block ===
  doc.moveDown(1.5);
  doc
    .fillColor(accent)
    .fontSize(10)
    .font("Helvetica-Bold")
    .text("INSTANT SEO AUDIT", { characterSpacing: 2 });
  doc.moveDown(0.4);
  doc
    .fillColor(palette.ink)
    .fontSize(26)
    .font("Helvetica-Bold")
    .text(siteName);
  doc
    .fillColor(palette.mute)
    .fontSize(11)
    .font("Helvetica")
    .text(input.finalUrl);

  doc.moveDown(0.6);
  doc
    .fillColor(palette.mute)
    .fontSize(9)
    .text(
      `Generated ${new Date().toLocaleString()} · ${input.pagesCrawled} page${
        input.pagesCrawled === 1 ? "" : "s"
      } scanned`,
    );

  doc.moveDown(1.5);

  // === Score block ===
  drawScoreBlock(doc, input.score, accent);

  doc.moveDown(1.5);

  // === Findings count summary ===
  drawSectionHeading(doc, "Findings summary");
  drawCountRow(doc, "Critical", input.counts.critical, palette.bad);
  drawCountRow(doc, "High", input.counts.high, palette.bad);
  drawCountRow(doc, "Medium", input.counts.medium, palette.warn);
  drawCountRow(doc, "Low", input.counts.low, palette.mute);

  doc.moveDown(1.2);

  // === Top findings ===
  drawSectionHeading(doc, "Top issues to fix");
  if (input.findings.length === 0) {
    doc
      .fillColor(palette.mute)
      .font("Helvetica")
      .fontSize(10)
      .text("No actionable issues found on this page.");
  } else {
    for (const f of input.findings.slice(0, 12)) {
      ensureSpace(doc, 50);
      const tone =
        sevColor[f.severity as keyof typeof sevColor] ?? palette.mute;
      doc
        .fillColor(tone)
        .font("Helvetica-Bold")
        .fontSize(9)
        .text(f.severity.toUpperCase(), { characterSpacing: 1 });
      doc
        .fillColor(palette.ink)
        .font("Helvetica-Bold")
        .fontSize(11)
        .text(f.type.replace(/_/g, " "));
      doc
        .fillColor(palette.mute)
        .font("Helvetica")
        .fontSize(10)
        .text(f.message, { lineGap: 2 });
      doc.moveDown(0.5);
    }
  }

  // === Footer ===
  drawFooter(doc, agencyName);

  doc.end();
  return finished;
}

function parseLogo(dataUrl: string | null): {
  buffer: Buffer;
  mime: string;
} | null {
  if (!dataUrl) return null;
  const m = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  if (mime !== "image/png" && mime !== "image/jpeg") return null;
  try {
    return { buffer: Buffer.from(m[2], "base64"), mime };
  } catch {
    return null;
  }
}

function drawHeader(
  doc: PDFKit.PDFDocument,
  opts: {
    accent: string;
    agencyName: string | null;
    agencyLogo: { buffer: Buffer; mime: string } | null;
  },
) {
  const { left, top, right } = doc.page.margins;
  // Coloured rule across top
  doc
    .rect(left, top - 24, doc.page.width - left - right, 3)
    .fill(opts.accent);

  if (opts.agencyLogo) {
    try {
      doc.image(opts.agencyLogo.buffer, left, top, { fit: [120, 36] });
      doc.y = top + 50;
    } catch {
      doc.y = top;
    }
  } else if (opts.agencyName) {
    doc
      .fillColor(palette.ink)
      .font("Helvetica-Bold")
      .fontSize(12)
      .text(opts.agencyName, left, top);
    doc.y = top + 24;
  } else {
    doc
      .fillColor(palette.mute)
      .font("Helvetica")
      .fontSize(9)
      .text("SEO Tool · Instant Audit", left, top, { characterSpacing: 1 });
    doc.y = top + 18;
  }
}

function drawScoreBlock(
  doc: PDFKit.PDFDocument,
  score: number,
  accent: string,
) {
  const left = doc.page.margins.left;
  const top = doc.y;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const height = 96;
  const tone =
    score >= 80 ? palette.good : score >= 50 ? palette.warn : palette.bad;

  doc
    .roundedRect(left, top, width, height, 10)
    .fillAndStroke("#f8f8fc", palette.rule);

  doc
    .fillColor(palette.mute)
    .font("Helvetica")
    .fontSize(9)
    .text("HEALTH SCORE", left + 18, top + 14, { characterSpacing: 1 });

  doc
    .fillColor(tone)
    .font("Helvetica-Bold")
    .fontSize(46)
    .text(String(score), left + 18, top + 28);

  doc
    .fillColor(palette.mute)
    .font("Helvetica")
    .fontSize(10)
    .text("of 100", left + 18, top + 76);

  // Verdict line
  const verdict =
    score >= 80
      ? "Solid foundations — push the last quick wins."
      : score >= 50
        ? "Clear room to improve — start with the criticals below."
        : "Plenty of room to improve — every issue listed is fixable.";
  doc
    .fillColor(accent)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(verdict, left + 150, top + 40, {
      width: width - 170,
      lineGap: 2,
    });

  doc.y = top + height + 10;
}

function drawCountRow(
  doc: PDFKit.PDFDocument,
  label: string,
  count: number,
  color: string,
) {
  const left = doc.page.margins.left;
  const startY = doc.y;
  doc
    .fillColor(palette.mute)
    .font("Helvetica")
    .fontSize(10)
    .text(label, left, startY, { continued: false });
  doc
    .fillColor(count === 0 ? palette.mute : color)
    .font("Helvetica-Bold")
    .text(String(count), left, startY, {
      align: "right",
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    });
  doc.moveDown(0.3);
}

function drawSectionHeading(doc: PDFKit.PDFDocument, text: string) {
  doc
    .fillColor(palette.ink)
    .font("Helvetica-Bold")
    .fontSize(13)
    .text(text);
  const y = doc.y + 2;
  doc
    .strokeColor(palette.rule)
    .lineWidth(0.5)
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .stroke();
  doc.moveDown(0.6);
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

function drawFooter(doc: PDFKit.PDFDocument, agencyName: string | null) {
  const text = agencyName
    ? `Prepared by ${agencyName} · ${new Date().toLocaleString()}`
    : `Generated by SEO Tool · ${new Date().toLocaleString()}`;
  doc
    .fillColor(palette.mute)
    .font("Helvetica-Oblique")
    .fontSize(8)
    .text(text, 56, doc.page.height - 40, {
      align: "center",
      width: doc.page.width - 112,
    });
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
