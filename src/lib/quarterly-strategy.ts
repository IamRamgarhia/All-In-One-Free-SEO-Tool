/**
 * Quarterly strategy doc generator. Renders a different shape of PDF
 * from the monthly report — strategic, not operational. Lead with 90-day
 * rank trend, content velocity, link velocity, top wins, what's not
 * working, where to invest next quarter.
 *
 * Reuses the same brand/palette helpers + ensureSpace as report-generator
 * but the section layout is fundamentally different so it's its own file.
 */

import PDFDocument from "pdfkit";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db/client";
import {
  audits,
  backlinks,
  brandMentions,
  clientMetricSnapshots,
  clients,
  contentBriefs,
  tasks,
} from "@/db/schema";
import { generateExecSummary } from "./ai-summary";
import {
  getGa4OrganicTraffic,
  getGscTopQueries,
  type Ga4DailyTraffic,
  type GscKeyword,
} from "./google-data";
import { callAI } from "./ai-call";
import { getSetting } from "./settings-store";

type Brand = {
  name: string | null;
  color: string | null;
  logoBuffer: Buffer | null;
  logoMime: string | null;
};

async function loadBrand(): Promise<Brand> {
  const [name, color, logoDataUrl] = await Promise.all([
    getSetting<string>("brand.name"),
    getSetting<string>("brand.color"),
    getSetting<string>("brand.logo_data_url"),
  ]);
  let logoBuffer: Buffer | null = null;
  let logoMime: string | null = null;
  if (logoDataUrl) {
    const m = logoDataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (m) {
      const mime = m[1].toLowerCase();
      if (mime === "image/png" || mime === "image/jpeg") {
        try {
          logoBuffer = Buffer.from(m[2], "base64");
          logoMime = mime;
        } catch {
          logoBuffer = null;
        }
      }
    }
  }
  return { name, color, logoBuffer, logoMime };
}

async function loadClientLogo(
  logoUrl: string | null,
): Promise<{ buffer: Buffer; mime: string } | null> {
  if (!logoUrl) return null;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 5_000);
  try {
    const res = await fetch(logoUrl, { signal: ac.signal, redirect: "follow" });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    const mime = ct.includes("png")
      ? "image/png"
      : ct.includes("jpeg") || ct.includes("jpg")
        ? "image/jpeg"
        : null;
    if (!mime) return null;
    const arr = new Uint8Array(await res.arrayBuffer());
    return { buffer: Buffer.from(arr), mime };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export type QuarterlyDoc = Buffer;

const PALETTE = {
  ink: "#111111",
  mute: "#666666",
  light: "#F2F2F2",
  brand: "#7C3AED",
  emerald: "#10b981",
  rose: "#f87171",
};

export async function generateQuarterlyStrategyPdf(
  clientId: number,
): Promise<QuarterlyDoc> {
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) throw new Error("Client not found");

  const brand = await loadBrand();
  const accent =
    brand.color && /^#[0-9a-f]{6}$/i.test(brand.color) ? brand.color : PALETTE.brand;

  const cutoff90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const cutoff180 = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

  const [
    snapshots,
    completedAudits,
    doneTasks,
    publishedBriefs,
    linksBuiltThisQ,
    linksBuiltPrevQ,
    mentions90,
  ] = await Promise.all([
    db
      .select()
      .from(clientMetricSnapshots)
      .where(eq(clientMetricSnapshots.clientId, clientId))
      .orderBy(asc(clientMetricSnapshots.capturedAt))
      .limit(60),
    db
      .select()
      .from(audits)
      .where(
        and(
          eq(audits.clientId, clientId),
          eq(audits.status, "completed"),
          gte(audits.completedAt, cutoff90),
        ),
      )
      .orderBy(desc(audits.completedAt)),
    db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.clientId, clientId),
          eq(tasks.status, "done"),
          gte(tasks.updatedAt, cutoff90),
        ),
      ),
    db
      .select()
      .from(contentBriefs)
      .where(
        and(
          eq(contentBriefs.clientId, clientId),
          gte(contentBriefs.createdAt, cutoff90),
        ),
      ),
    db
      .select()
      .from(backlinks)
      .where(
        and(
          eq(backlinks.clientId, clientId),
          eq(backlinks.source, "manual"),
          gte(backlinks.placedAt, cutoff90),
        ),
      ),
    db
      .select()
      .from(backlinks)
      .where(
        and(
          eq(backlinks.clientId, clientId),
          eq(backlinks.source, "manual"),
          gte(backlinks.placedAt, cutoff180),
        ),
      ),
    db
      .select()
      .from(brandMentions)
      .where(
        and(
          eq(brandMentions.clientId, clientId),
          gte(brandMentions.capturedAt, cutoff90),
        ),
      ),
  ]);

  const [gscTopReal, ga4Real]: [GscKeyword[], Ga4DailyTraffic[]] =
    await Promise.all([
      client.gscProperty
        ? getGscTopQueries({
            siteUrl: client.gscProperty,
            days: 90,
            limit: 10,
          }).catch(() => [])
        : Promise.resolve([]),
      client.ga4PropertyId
        ? getGa4OrganicTraffic({
            propertyId: client.ga4PropertyId,
            days: 90,
          }).catch(() => [])
        : Promise.resolve([]),
    ]);

  const earliest = snapshots[0] ?? null;
  const latest = snapshots[snapshots.length - 1] ?? null;
  const positiveMentions = mentions90.filter((m) => m.sentiment > 0).length;
  const negativeMentions = mentions90.filter((m) => m.sentiment < 0).length;
  const linksBuiltLastQ = linksBuiltPrevQ.length - linksBuiltThisQ.length;

  // AI strategic narrative — three sections: what worked, what didn't,
  // next quarter's focus. Bigger / more thoughtful than the monthly summary.
  let narrative = "";
  try {
    const userPrompt = [
      `Client: ${client.name} (${client.url})`,
      client.niche ? `Niche: ${client.niche}` : "",
      "",
      "90-day deltas (baseline → current):",
      earliest && latest
        ? `  Health score: ${earliest.healthScore} → ${latest.healthScore}`
        : "",
      earliest && latest
        ? `  Organic clicks (28d): ${earliest.organicClicks ?? "–"} → ${latest.organicClicks ?? "–"}`
        : "",
      earliest && latest
        ? `  Top-10 keywords: ${earliest.top10Count ?? "–"} → ${latest.top10Count ?? "–"}`
        : "",
      earliest && latest
        ? `  Backlinks logged: ${earliest.backlinkCount ?? "–"} → ${latest.backlinkCount ?? "–"}`
        : "",
      "",
      `Tasks completed: ${doneTasks.length}`,
      `Content briefs created: ${publishedBriefs.length}`,
      `Manual links built: ${linksBuiltThisQ.length} (vs ${linksBuiltLastQ} prior quarter)`,
      `Brand mentions: ${mentions90.length} (${positiveMentions} positive, ${negativeMentions} negative)`,
      "",
      "Top organic keywords (last 90 days):",
      ...gscTopReal.slice(0, 5).map(
        (q) =>
          `  - "${q.query}": ${q.clicks} clicks, position ${q.position.toFixed(1)}`,
      ),
      "",
      "Write a quarterly strategy narrative with three sections:",
      "1. What worked (3 bullets) — ground in the numbers above",
      "2. What didn't (2 bullets) — what to stop doing or fix",
      "3. Next quarter's focus (3 bullets) — concrete, prioritised, anchored in data",
      "",
      "≤300 words total. No marketing fluff. Bullets only inside each section. Use Markdown headings.",
    ]
      .filter(Boolean)
      .join("\n");

    const out = await callAI({
      system:
        "You are a senior SEO strategist writing a quarterly review for an agency client. Direct, honest, action-oriented. Cite numbers from the data given.",
      user: userPrompt,
      maxTokens: 700,
      temperature: 0.4,
      timeoutMs: 30_000,
      feature: "exec_summary",
      clientId,
      ignoreCreditSaver: true,
    });
    narrative = out ?? "";
  } catch {
    narrative = "";
  }

  if (!narrative) {
    // Fallback to the monthly exec-summary helper, padded with q-context
    narrative = await generateExecSummary({
      clientId,
      clientName: client.name,
      clientUrl: client.url,
      score: latest?.healthScore ?? null,
      prevScore: earliest?.healthScore ?? null,
      totalTasks: doneTasks.length,
      doneTasks: doneTasks.length,
      openTasks: 0,
      topIssues: [],
      techStack: client.techStack ?? null,
      niche: client.niche ?? null,
      organicSessions: ga4Real.reduce((s, r) => s + r.sessions, 0) || null,
      organicSessionsDeltaPct: null,
      topQueries: gscTopReal.slice(0, 3).map((q) => ({
        query: q.query,
        clicks: q.clicks,
        position: q.position,
      })),
      quickWinsCount: 0,
    });
  }

  // ============== Render the PDF ==============
  const buffers: Buffer[] = [];
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 60, bottom: 60, left: 56, right: 56 },
    info: {
      Title: `${client.name} — Quarterly SEO Strategy`,
      Author: "SEO Tool",
      Subject: "Quarterly strategy review",
    },
  });

  doc.on("data", (chunk: Buffer) => buffers.push(chunk));
  const finished = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(buffers)));
  });

  const today = new Date();
  const quarter = `Q${Math.floor(today.getUTCMonth() / 3) + 1} ${today.getUTCFullYear()}`;

  // === Cover ===
  const clientLogo = await loadClientLogo(client.logoUrl);
  const headerLogo = brand.logoBuffer
    ? { buffer: brand.logoBuffer, mime: brand.logoMime }
    : clientLogo;
  if (headerLogo) {
    try {
      doc.image(headerLogo.buffer, doc.page.margins.left, doc.page.margins.top, {
        fit: [120, 40],
      });
    } catch {
      // ignore
    }
  }

  doc
    .moveDown(3)
    .fillColor(accent)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(quarter.toUpperCase());
  doc
    .fillColor(PALETTE.ink)
    .font("Helvetica-Bold")
    .fontSize(28)
    .text(`${client.name} — Quarterly SEO Strategy`, { lineBreak: true });
  doc
    .moveDown(0.5)
    .fillColor(PALETTE.mute)
    .font("Helvetica")
    .fontSize(11)
    .text(`90-day review · ${client.url}`);

  doc.moveDown(2);

  // === Headline metrics strip ===
  const cardW =
    (doc.page.width - doc.page.margins.left - doc.page.margins.right - 20) / 3;
  const cards = [
    {
      label: "Tasks completed",
      value: String(doneTasks.length),
    },
    {
      label: "Links built",
      value: String(linksBuiltThisQ.length),
    },
    {
      label: "Content pieces",
      value: String(publishedBriefs.length),
    },
  ];
  const cardY = doc.y;
  for (let i = 0; i < cards.length; i++) {
    const x = doc.page.margins.left + i * (cardW + 10);
    doc.roundedRect(x, cardY, cardW, 70, 8).fill(PALETTE.light);
    doc
      .fillColor(PALETTE.mute)
      .font("Helvetica")
      .fontSize(9)
      .text(cards[i].label.toUpperCase(), x + 12, cardY + 12);
    doc
      .fillColor(accent)
      .font("Helvetica-Bold")
      .fontSize(26)
      .text(cards[i].value, x + 12, cardY + 28);
  }
  doc.y = cardY + 90;

  // === Narrative ===
  drawHeading(doc, "Strategic narrative", accent);
  doc
    .fillColor(PALETTE.ink)
    .font("Helvetica")
    .fontSize(11)
    .text(narrative, { lineGap: 4 });

  doc.moveDown(1.5);

  // === Trend chart ===
  if (snapshots.length >= 3) {
    drawHeading(doc, "Health-score trend (90 days)", accent);
    drawSparkline(
      doc,
      snapshots.map((s) => s.healthScore ?? 0),
      accent,
    );
    doc.moveDown(1.5);
  }

  // === Velocity table ===
  drawHeading(doc, "Velocity vs prior 90 days", accent);
  drawKv(doc, "Manual links built", `${linksBuiltThisQ.length} this Q · ${linksBuiltLastQ} prior Q`);
  drawKv(doc, "Audits completed", String(completedAudits.length));
  drawKv(doc, "Brand mentions", `${mentions90.length} (${positiveMentions} +, ${negativeMentions} −)`);
  doc.moveDown(1);

  // === Top queries ===
  if (gscTopReal.length > 0) {
    drawHeading(doc, "Top organic queries (90 days)", accent);
    for (const q of gscTopReal.slice(0, 8)) {
      ensureSpace(doc, 18);
      doc
        .fillColor(PALETTE.ink)
        .font("Helvetica-Bold")
        .fontSize(10)
        .text(`"${q.query}"`, { continued: true });
      doc
        .fillColor(PALETTE.mute)
        .font("Helvetica")
        .text(
          `  ${q.clicks} clicks · pos ${q.position.toFixed(1)}`,
        );
    }
    doc.moveDown(1);
  }

  // === Footer ===
  doc.moveDown(2);
  doc
    .fillColor(PALETTE.mute)
    .font("Helvetica")
    .fontSize(9)
    .text(
      `Generated ${today.toLocaleDateString()} · ${snapshots.length} snapshot${snapshots.length === 1 ? "" : "s"} since ${earliest?.capturedAt.toLocaleDateString() ?? "—"}.`,
      { align: "center" },
    );

  doc.end();
  return finished;
}

// ============== render helpers ==============

function drawHeading(doc: PDFKit.PDFDocument, text: string, accent: string) {
  ensureSpace(doc, 36);
  doc
    .fillColor(accent)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(text.toUpperCase(), { characterSpacing: 1 });
  const y = doc.y + 4;
  doc
    .strokeColor(accent)
    .lineWidth(2)
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.margins.left + 50, y)
    .stroke();
  doc.moveDown(0.6);
}

function drawKv(doc: PDFKit.PDFDocument, key: string, value: string) {
  ensureSpace(doc, 18);
  const startY = doc.y;
  doc
    .fillColor(PALETTE.mute)
    .font("Helvetica")
    .fontSize(10)
    .text(key, doc.page.margins.left, startY, { continued: false });
  doc
    .fillColor(PALETTE.ink)
    .font("Helvetica-Bold")
    .text(value, doc.page.margins.left, startY, {
      align: "right",
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    });
  doc.moveDown(0.4);
}

function drawSparkline(
  doc: PDFKit.PDFDocument,
  values: number[],
  color: string,
) {
  const present = values.filter((v) => Number.isFinite(v) && v > 0);
  if (present.length < 2) return;
  const minV = Math.min(...present);
  const maxV = Math.max(...present);
  const range = Math.max(maxV - minV, 1);
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const top = doc.y + 4;
  const w = right - left;
  const h = 70;
  const step = w / (present.length - 1);

  doc
    .strokeColor(color)
    .lineWidth(1.5);
  for (let i = 0; i < present.length - 1; i++) {
    const y1 = top + h - ((present[i] - minV) / range) * h;
    const y2 = top + h - ((present[i + 1] - minV) / range) * h;
    doc.moveTo(left + i * step, y1).lineTo(left + (i + 1) * step, y2);
  }
  doc.stroke();
  doc.y = top + h + 6;
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}
