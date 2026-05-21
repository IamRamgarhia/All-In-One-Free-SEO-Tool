import PDFDocument from "pdfkit";
import { eq, desc, and, gte } from "drizzle-orm";
import { db } from "@/db/client";
import {
  aiSuggestions,
  audits,
  auditIssues,
  backlinks,
  clients,
  guestPostDrafts,
  keywordRankings,
  keywords,
  monitoredPages,
  pageChanges,
  resourceSubmissions,
  seoResources,
  tasks,
} from "@/db/schema";
import { getSetting } from "./settings-store";
import { generateExecSummary } from "./ai-summary";
import {
  captureClientSnapshot,
  loadSnapshotComparison,
  type SnapshotComparison,
} from "./client-snapshots";
import {
  getGscTopQueries,
  getGscQuickWins,
  getGa4OrganicTraffic,
  type GscKeyword,
  type Ga4DailyTraffic,
} from "./google-data";

type Color = string;

const defaultPalette = {
  ink: "#0f1117" as Color,
  mute: "#5b6173" as Color,
  rule: "#dde0e7" as Color,
  brand: "#6d49d6" as Color,
  good: "#0f9460" as Color,
  warn: "#b76b00" as Color,
  bad: "#c43151" as Color,
};

// Module-mutable so the existing helpers (88 references) can read it
// without threading palette through every function. Concurrent
// generateReportPdf calls are serialized via _generateLock below so two
// reports don't stomp each other's brand color.
let palette = { ...defaultPalette };

// Mutex that serializes report generation. Without this, two concurrent
// calls would race on palette mutation: client A sets brand color, awaits
// I/O, then client B overwrites palette.brand mid-render of A's PDF.
// Real-world risk is low (single-user app, ~5s per report) but the bug
// is real and the cost of fixing is a one-line mutex.
let _generateLock: Promise<void> = Promise.resolve();

type Brand = {
  name: string | null;
  color: string | null;
  logoBuffer: Buffer | null;
  logoMime: string | null;
};

/**
 * Fetch the client's own logo from the URL stored on the client record so the
 * audit report header still shows their identity when the user hasn't
 * configured agency branding. PDF only supports PNG/JPEG.
 */
async function loadClientLogo(
  logoUrl: string | null,
): Promise<{ buffer: Buffer; mime: string } | null> {
  if (!logoUrl) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(logoUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; SeoToolBot/0.1; +https://localhost)",
      },
    });
    if (!res.ok) return null;
    const ctype = (res.headers.get("content-type") ?? "").toLowerCase();
    const mime = ctype.includes("png")
      ? "image/png"
      : ctype.includes("jpeg") || ctype.includes("jpg")
        ? "image/jpeg"
        : null;
    if (!mime) return null;
    const arr = new Uint8Array(await res.arrayBuffer());
    return { buffer: Buffer.from(arr), mime };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

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
      logoMime = m[1].toLowerCase();
      // pdfkit only supports PNG and JPEG natively. SVG/WebP won't render.
      if (logoMime === "image/png" || logoMime === "image/jpeg") {
        try {
          logoBuffer = Buffer.from(m[2], "base64");
        } catch {
          logoBuffer = null;
        }
      }
    }
  }

  return { name, color, logoBuffer, logoMime };
}

const sevColor = {
  critical: palette.bad,
  high: palette.bad,
  medium: palette.warn,
  low: palette.mute,
} as const;

function scoreColor(score: number | null): Color {
  if (score === null) return palette.mute;
  if (score >= 80) return palette.good;
  if (score >= 50) return palette.warn;
  return palette.bad;
}

function severityRank(s: string): number {
  return { critical: 4, high: 3, medium: 2, low: 1 }[s] ?? 0;
}

function aiExecutiveSummary(opts: {
  clientName: string;
  score: number | null;
  prevScore: number | null;
  totalTasks: number;
  doneTasks: number;
  topIssue: string | null;
}): string {
  const { clientName, score, prevScore, totalTasks, doneTasks, topIssue } = opts;

  // Formula from CLAUDE.md: [Direction] + [Win] + [Priority]
  const parts: string[] = [];

  if (score !== null && prevScore !== null) {
    const delta = score - prevScore;
    if (Math.abs(delta) < 2) {
      parts.push(`${clientName}'s health score held steady at ${score}/100 this period.`);
    } else if (delta > 0) {
      parts.push(
        `${clientName}'s health score improved by ${delta} points this period to ${score}/100.`,
      );
    } else {
      parts.push(
        `${clientName}'s health score dropped ${Math.abs(delta)} points this period to ${score}/100.`,
      );
    }
  } else if (score !== null) {
    parts.push(
      `${clientName} now has a baseline health score of ${score}/100 — first measurement.`,
    );
  } else {
    parts.push(`${clientName} has no completed audit yet.`);
  }

  if (doneTasks > 0) {
    parts.push(`We closed ${doneTasks} of ${totalTasks} open SEO tasks.`);
  } else if (totalTasks > 0) {
    parts.push(
      `${totalTasks} SEO tasks are queued — no completions logged yet.`,
    );
  }

  if (topIssue) {
    parts.push(`Next focus: ${topIssue.toLowerCase()}.`);
  }

  return parts.join(" ");
}

export type ReportTemplate =
  | "executive"
  | "detailed"
  | "technical"
  | "ceo"
  | "cmo"
  | "cto"
  | "junior";

/**
 * Map the four stakeholder variants onto the three legacy templates so
 * the section-gating logic doesn't have to grow seven branches at every
 * decision point. CTO behaves like technical, CEO/junior like executive
 * (lean), CMO like detailed (full report).
 */
function isTechnical(t: ReportTemplate): boolean {
  return t === "technical" || t === "cto";
}
function isExecutive(t: ReportTemplate): boolean {
  return t === "executive" || t === "ceo" || t === "junior";
}
function isDetailed(t: ReportTemplate): boolean {
  return t === "detailed" || t === "cmo";
}

export const TEMPLATE_LABELS: Record<ReportTemplate, string> = {
  executive: "Executive",
  detailed: "Detailed",
  technical: "Technical",
  ceo: "CEO — revenue + ROI",
  cmo: "CMO — traffic + pipeline",
  cto: "CTO — technical health",
  junior: "Junior marketer — what's been done",
};

/**
 * Stakeholder report variants. Each one rewrites the same data with a
 * different framing — what to lead with, what to cut, what tone to take.
 */
export const TEMPLATE_FRAMING: Record<
  ReportTemplate,
  {
    intro: string;
    leadingMetric: "score" | "traffic" | "issues" | "tasks_done";
    /** Which sections to keep. Empty = all. */
    sections?: ("score" | "traffic" | "issues" | "tasks_done" | "keywords")[];
  }
> = {
  executive: {
    intro: "Headline progress and the next month's priorities.",
    leadingMetric: "score",
  },
  detailed: {
    intro: "Full report — every metric, every section.",
    leadingMetric: "score",
  },
  technical: {
    intro: "Audit-first view. Focus on issues found and fixed.",
    leadingMetric: "issues",
  },
  ceo: {
    intro:
      "Revenue and ROI summary. Lead with traffic value, not vanity metrics.",
    leadingMetric: "traffic",
    sections: ["traffic", "score", "tasks_done"],
  },
  cmo: {
    intro:
      "Traffic and pipeline view. What's converting, where to invest content next.",
    leadingMetric: "traffic",
    sections: ["traffic", "keywords", "tasks_done"],
  },
  cto: {
    intro:
      "Technical health view. Audit issues, what shipped, what's pending engineering.",
    leadingMetric: "issues",
    sections: ["issues", "score", "tasks_done"],
  },
  junior: {
    intro:
      "What's been done this period — work log + accomplishments for hand-off / standup.",
    leadingMetric: "tasks_done",
    sections: ["tasks_done", "score"],
  },
};

export async function generateReportPdf(
  clientId: number,
  template: ReportTemplate = "detailed",
): Promise<Buffer> {
  // Wait for any in-flight report generation to finish before mutating
  // the shared palette. Each call's mutex baton releases in the finally
  // block at the bottom of this function.
  const prevLock = _generateLock;
  let releaseLock!: () => void;
  _generateLock = new Promise<void>((r) => {
    releaseLock = r;
  });
  await prevLock;

  try {
    const [client] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);
    if (!client) throw new Error("Client not found");

    // Load brand and override palette accent
    const brand = await loadBrand();
    palette = {
      ...defaultPalette,
      brand:
        brand.color && /^#[0-9a-f]{6}$/i.test(brand.color)
          ? brand.color
          : defaultPalette.brand,
    };

  const completedAudits = await db
    .select()
    .from(audits)
    .where(and(eq(audits.clientId, clientId), eq(audits.status, "completed")))
    .orderBy(desc(audits.completedAt));

  const latest = completedAudits[0] ?? null;
  const previous = completedAudits[1] ?? null;

  const allIssues = latest
    ? await db
        .select()
        .from(auditIssues)
        .where(eq(auditIssues.auditId, latest.id))
    : [];

  const allTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.clientId, clientId));

  const doneTasks = allTasks.filter((t) => t.status === "done");
  const openTasks = allTasks.filter((t) => t.status !== "done");

  // Manually-logged backlinks built in the last 30 days — these flow
  // straight from the user's link log into "Links built this period."
  const periodCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const linksBuiltThisPeriod = await db
    .select({
      id: backlinks.id,
      sourceUrl: backlinks.sourceUrl,
      sourceDomain: backlinks.sourceDomain,
      targetUrl: backlinks.targetUrl,
      anchorText: backlinks.anchorText,
      domainAuthority: backlinks.domainAuthority,
      method: backlinks.method,
      rel: backlinks.rel,
      placedAt: backlinks.placedAt,
      notes: backlinks.notes,
    })
    .from(backlinks)
    .where(
      and(
        eq(backlinks.clientId, clientId),
        eq(backlinks.source, "manual"),
        gte(backlinks.placedAt, periodCutoff),
      ),
    )
    .orderBy(desc(backlinks.placedAt));

  // Tracker submissions that went live in the period — links the user
  // built via the per-client backlink hub.
  const submissionsLiveThisPeriod = await db
    .select({
      id: resourceSubmissions.id,
      domain: seoResources.domain,
      submittedUrl: resourceSubmissions.submittedUrl,
      category: seoResources.category,
      da: seoResources.da,
      submittedAt: resourceSubmissions.submittedAt,
    })
    .from(resourceSubmissions)
    .leftJoin(seoResources, eq(resourceSubmissions.resourceId, seoResources.id))
    .where(
      and(
        eq(resourceSubmissions.clientId, clientId),
        eq(resourceSubmissions.status, "live"),
        gte(resourceSubmissions.submittedAt, periodCutoff),
      ),
    )
    .orderBy(desc(resourceSubmissions.submittedAt));

  // AI-written guest posts published in the period.
  const guestPostsPublishedThisPeriod = await db
    .select({
      id: guestPostDrafts.id,
      siteName: guestPostDrafts.siteName,
      siteDomain: guestPostDrafts.siteDomain,
      topic: guestPostDrafts.topic,
      targetKeyword: guestPostDrafts.targetKeyword,
      liveUrl: guestPostDrafts.liveUrl,
      publishedAt: guestPostDrafts.publishedAt,
    })
    .from(guestPostDrafts)
    .where(
      and(
        eq(guestPostDrafts.clientId, clientId),
        eq(guestPostDrafts.status, "published"),
        gte(guestPostDrafts.publishedAt, periodCutoff),
      ),
    )
    .orderBy(desc(guestPostDrafts.publishedAt));

  // Rank movement: per keyword, compare latest checked rank vs the rank
  // 30+ days ago. Only surface keywords with meaningful change (≥3 spots).
  const trackedKeywords = await db
    .select({
      id: keywords.id,
      query: keywords.query,
    })
    .from(keywords)
    .where(eq(keywords.clientId, clientId));

  const rankMovements: {
    query: string;
    current: number | null;
    prior: number | null;
    delta: number;
  }[] = [];
  for (const kw of trackedKeywords) {
    const recent = await db
      .select({
        position: keywordRankings.position,
        checkedAt: keywordRankings.checkedAt,
      })
      .from(keywordRankings)
      .where(eq(keywordRankings.keywordId, kw.id))
      .orderBy(desc(keywordRankings.checkedAt))
      .limit(20);
    if (recent.length < 2) continue;
    const current = recent[0]?.position ?? null;
    const prior =
      recent.find(
        (r) =>
          r.checkedAt.getTime() < periodCutoff.getTime() ||
          recent.indexOf(r) === recent.length - 1,
      )?.position ?? recent[recent.length - 1]?.position ?? null;
    if (current === null || prior === null) continue;
    const delta = prior - current; // positive = moved up
    if (Math.abs(delta) < 3) continue;
    rankMovements.push({ query: kw.query, current, prior, delta });
  }
  rankMovements.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  // Page changes detected via the page-monitor scheduler in the period
  const pageChangeRows = await db
    .select({
      field: pageChanges.field,
      oldValue: pageChanges.oldValue,
      newValue: pageChanges.newValue,
      detectedAt: pageChanges.detectedAt,
      url: monitoredPages.url,
    })
    .from(pageChanges)
    .leftJoin(
      monitoredPages,
      eq(pageChanges.monitoredPageId, monitoredPages.id),
    )
    .where(gte(pageChanges.detectedAt, periodCutoff))
    .orderBy(desc(pageChanges.detectedAt))
    .limit(50);

  const pageChangesForClient = pageChangeRows.filter((r) => {
    // monitor table is per-client; we only see this client's via the join
    return Boolean(r.url);
  });

  // Capture a fresh monthly snapshot every time a report is generated, then
  // load the comparison so the report can render "since baseline" + "since
  // last month" deltas. Best-effort — never fails the PDF.
  let snapshotComparison: SnapshotComparison = {
    latest: null,
    prior: null,
    baseline: null,
  };
  try {
    await captureClientSnapshot({ clientId, kind: "monthly" });
    snapshotComparison = await loadSnapshotComparison(clientId);
  } catch {
    // ignore
  }

  // AI suggestions applied this period (status = "applied")
  const suggestionsApplied = await db
    .select({
      id: aiSuggestions.id,
      type: aiSuggestions.type,
      targetUrl: aiSuggestions.targetUrl,
      suggestedValue: aiSuggestions.suggestedValue,
      updatedAt: aiSuggestions.updatedAt,
    })
    .from(aiSuggestions)
    .where(
      and(
        eq(aiSuggestions.clientId, clientId),
        eq(aiSuggestions.status, "applied"),
        gte(aiSuggestions.updatedAt, periodCutoff),
      ),
    )
    .orderBy(desc(aiSuggestions.updatedAt))
    .limit(40);

  const topIssue =
    allIssues.find((i) => i.severity === "critical")?.message ??
    allIssues.find((i) => i.severity === "high")?.message ??
    null;

  const topIssues = allIssues
    .slice()
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    .slice(0, 5)
    .map((i) => ({
      type: i.type,
      severity: i.severity,
      message: i.message,
    }));

  // Pull real Google data in parallel when properties are linked.
  // All return [] on any failure (token issue, quota, etc.) so the report
  // still generates without them.
  const [gscTop, gscQuickWins, ga4Daily] = await Promise.all([
    client.gscProperty
      ? getGscTopQueries({
          siteUrl: client.gscProperty,
          days: 28,
          limit: 10,
        })
      : Promise.resolve([] as GscKeyword[]),
    client.gscProperty
      ? getGscQuickWins({
          siteUrl: client.gscProperty,
          days: 28,
          limit: 8,
          minImpressions: 50,
        })
      : Promise.resolve([] as GscKeyword[]),
    client.ga4PropertyId
      ? getGa4OrganicTraffic({
          propertyId: client.ga4PropertyId,
          days: 28,
        })
      : Promise.resolve([] as Ga4DailyTraffic[]),
  ]);

  // Aggregate GA4 — total sessions + week-over-week delta
  const totalSessions = ga4Daily.reduce((s, r) => s + r.sessions, 0);
  const half = Math.floor(ga4Daily.length / 2);
  const recentSessions = ga4Daily
    .slice(half)
    .reduce((s, r) => s + r.sessions, 0);
  const priorSessions = ga4Daily
    .slice(0, half)
    .reduce((s, r) => s + r.sessions, 0);
  const sessionsDeltaPct =
    priorSessions > 0
      ? Math.round(((recentSessions - priorSessions) / priorSessions) * 100)
      : null;

  const exec = await generateExecSummary({
    clientId: client.id,
    clientName: client.name,
    clientUrl: client.url,
    score: latest?.score ?? null,
    prevScore: previous?.score ?? null,
    totalTasks: allTasks.length,
    doneTasks: doneTasks.length,
    openTasks: openTasks.length,
    topIssues,
    techStack: client.techStack ?? null,
    niche: client.niche ?? null,
    organicSessions: ga4Daily.length > 0 ? totalSessions : null,
    organicSessionsDeltaPct: sessionsDeltaPct,
    topQueries: gscTop.slice(0, 5).map((q) => ({
      query: q.query,
      clicks: q.clicks,
      position: q.position,
    })),
    quickWinsCount: gscQuickWins.length,
  });
  void topIssue;
  void aiExecutiveSummary;

  const buffers: Buffer[] = [];
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 60, bottom: 60, left: 56, right: 56 },
    info: {
      Title: `${client.name} — SEO Report`,
      Author: "SEO Tool",
      Subject: "Monthly SEO performance report",
    },
  });

  doc.on("data", (chunk: Buffer) => buffers.push(chunk));
  const finished = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(buffers)));
  });

  // Register Inter TTFs if the user dropped them into src/lib/fonts/.
  // Zero-config: when files are absent (the default), the report uses
  // PDFKit's built-in Helvetica family and looks identical to before.
  const { registerInterFonts } = await import("./report-fonts");
  const hasInter = registerInterFonts(doc);
  if (hasInter) doc.font("Body");

  // ═════════════════════════════════════════════════════════════════
  // Cover page (NEW — Reports v2): full-bleed brand gradient, big-
  // number wow factor, period framing. Page 2 onwards keeps the
  // original layout for backwards compat with all stakeholder
  // variants.
  // ═════════════════════════════════════════════════════════════════
  drawCoverPage(doc, {
    clientName: client.name,
    clientUrl: client.url,
    score: latest?.score ?? null,
    previousScore: previous?.score ?? null,
    brandColor: palette.brand,
    brandName: brand.name,
    brandLogo: brand.logoBuffer && brand.logoMime ? { buffer: brand.logoBuffer, mime: brand.logoMime } : null,
    template: TEMPLATE_LABELS[template],
  });
  doc.addPage();

  // === Cover ===
  // Header strip: agency logo when configured (white-label), otherwise the
  // client's own auto-fetched logo so the report still feels branded.
  const clientLogo = await loadClientLogo(client.logoUrl);
  const headerLogo = brand.logoBuffer
    ? { buffer: brand.logoBuffer, mime: brand.logoMime }
    : clientLogo;
  if (headerLogo) {
    try {
      doc.image(headerLogo.buffer, doc.page.margins.left, doc.page.margins.top, {
        fit: [120, 40],
      });
      doc.y = doc.page.margins.top + 50;
    } catch {
      // ignore — fall through to text-only header
    }
  }

  doc
    .fillColor(palette.brand)
    .fontSize(10)
    .text("SEO REPORT", { characterSpacing: 2 });
  doc.moveDown(0.5);
  doc
    .fillColor(palette.ink)
    .fontSize(28)
    .font("Helvetica-Bold")
    .text(client.name);
  doc
    .fillColor(palette.mute)
    .fontSize(11)
    .font("Helvetica")
    .text(client.url);

  // Address / phone / email line if any of them exist
  const contactBits = [client.address, client.phone, client.email].filter(
    (x): x is string => Boolean(x),
  );
  if (contactBits.length > 0) {
    doc
      .fillColor(palette.mute)
      .fontSize(9)
      .text(contactBits.join("  ·  "));
  }

  doc.moveDown(1.5);
  const today = new Date();
  const periodLabel = today.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  doc.fillColor(palette.mute).fontSize(10).text(`Period · ${periodLabel}`);
  if (brand.name) {
    doc
      .fillColor(palette.mute)
      .fontSize(9)
      .text(`Prepared by ${brand.name}`);
  }

  // Template label + variant intro on cover
  doc
    .fillColor(palette.mute)
    .fontSize(9)
    .text(`Template · ${TEMPLATE_LABELS[template]}`);
  const framing = TEMPLATE_FRAMING[template];
  if (framing?.intro) {
    doc
      .moveDown(0.3)
      .fillColor(palette.mute)
      .font("Helvetica-Oblique")
      .fontSize(10)
      .text(framing.intro);
  }

  doc.moveDown(2);

  // === Health score block ===
  drawHealthScoreBlock(doc, latest?.score ?? null, previous?.score ?? null);

  doc.moveDown(2);

  // === Executive summary === (always)
  drawSectionHeading(doc, "Executive summary");
  doc
    .fillColor(palette.ink)
    .fontSize(11)
    .font("Helvetica")
    .text(exec.prose, { lineGap: 4 });

  // Cite-or-bust: every claim in the prose maps to one of these
  // deterministic data points. The reader can verify each one against
  // the body of the report. Built from `input` not from the LLM, so
  // the same numbers always produce the same citations.
  if (exec.dataPoints.length > 0) {
    doc.moveDown(0.8);
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor(palette.mute)
      .text("DATA BEHIND THIS SUMMARY", { characterSpacing: 1 });
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(9).fillColor(palette.mute);
    for (const dp of exec.dataPoints) {
      doc.text(`• ${dp.label}: ${dp.value}`, { lineGap: 1 });
    }
    if (exec.source === "template") {
      doc.moveDown(0.3);
      doc.text(
        "(Summary generated from template — no AI provider configured.)",
        { lineGap: 1 },
      );
    }
  }

  doc.moveDown(1.5);

  // === Performance over time (snapshot delta) ===
  if (
    !isTechnical(template) &&
    snapshotComparison.latest &&
    (snapshotComparison.baseline || snapshotComparison.prior)
  ) {
    drawSectionHeading(doc, "Performance over time");
    const cur = snapshotComparison.latest;
    const base = snapshotComparison.baseline;
    const prior = snapshotComparison.prior;
    if (base) {
      doc
        .font("Helvetica")
        .fillColor(palette.mute)
        .fontSize(9)
        .text(
          `Since baseline (${base.capturedAt.toLocaleDateString()}, ~${Math.max(
            1,
            Math.round(
              (Date.now() - base.capturedAt.getTime()) / 86_400_000,
            ),
          )} days ago):`,
        );
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor(palette.ink);
      drawDeltaRow(doc, "Health score", base.healthScore, cur.healthScore);
      drawDeltaRow(doc, "Organic clicks (28d)", base.organicClicks, cur.organicClicks);
      drawDeltaRow(doc, "Organic impressions (28d)", base.organicImpressions, cur.organicImpressions);
      drawDeltaRow(doc, "GA4 sessions (28d)", base.ga4Sessions, cur.ga4Sessions);
      drawDeltaRow(doc, "GA4 conversions (28d)", base.ga4Conversions, cur.ga4Conversions);
      if (
        typeof base.ga4RevenueX100 === "number" &&
        typeof cur.ga4RevenueX100 === "number"
      ) {
        drawDeltaRow(
          doc,
          "Organic revenue (28d, $)",
          Math.round(base.ga4RevenueX100 / 100),
          Math.round(cur.ga4RevenueX100 / 100),
        );
      }
      drawDeltaRow(doc, "Top-10 keywords", base.top10Count, cur.top10Count);
      drawDeltaRow(doc, "Backlinks (logged)", base.backlinkCount, cur.backlinkCount);
      drawDeltaRow(doc, "GBP playbook %", base.gbpScore, cur.gbpScore);
      doc.moveDown(0.5);
    }
    if (prior && prior !== base) {
      doc
        .font("Helvetica")
        .fillColor(palette.mute)
        .fontSize(9)
        .text(`Since last snapshot (${prior.capturedAt.toLocaleDateString()}):`);
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor(palette.ink);
      drawDeltaRow(doc, "Health score", prior.healthScore, cur.healthScore);
      drawDeltaRow(doc, "Organic clicks (28d)", prior.organicClicks, cur.organicClicks);
      drawDeltaRow(doc, "Top-10 keywords", prior.top10Count, cur.top10Count);
      doc.moveDown(0.5);
    }
    doc.moveDown(0.5);
  }

  // === Performance highlights === (skip on technical)
  // Reports v2 — 5-page restructure: this is page 3 (data + wins).
  // Cover + exec stays clean on its own pages; data pages start fresh.
  if (!isTechnical(template)) {
    doc.addPage();
    drawSectionHeading(doc, "Performance highlights");
    drawKeyValueRow(doc, "Audits completed this period", String(completedAudits.length));
    drawKeyValueRow(doc, "Tasks completed", `${doneTasks.length} of ${allTasks.length}`);
    drawKeyValueRow(doc, "Open issues from latest audit", String(allIssues.length));
    if (ga4Daily.length > 0) {
      const trend =
        sessionsDeltaPct !== null
          ? ` (${sessionsDeltaPct > 0 ? "+" : ""}${sessionsDeltaPct}% vs prior)`
          : "";
      drawKeyValueRow(
        doc,
        "Organic sessions (28 days)",
        `${totalSessions.toLocaleString()}${trend}`,
      );
    }
    drawKeyValueRow(
      doc,
      "Tech stack",
      client.techStack && client.techStack.length > 0
        ? client.techStack.join(", ")
        : "Not detected",
    );
    doc.moveDown(1.5);
  }

  // === Organic traffic detail === (detailed only, when GA4 data exists)
  if (isDetailed(template) && ga4Daily.length > 0) {
    drawSectionHeading(doc, "Organic traffic — last 28 days");
    drawKeyValueRow(doc, "Sessions", totalSessions.toLocaleString());
    drawKeyValueRow(
      doc,
      "Users",
      ga4Daily.reduce((s, r) => s + r.users, 0).toLocaleString(),
    );
    drawKeyValueRow(
      doc,
      "Pageviews",
      ga4Daily.reduce((s, r) => s + r.pageviews, 0).toLocaleString(),
    );
    if (sessionsDeltaPct !== null) {
      drawKeyValueRow(
        doc,
        "Week-over-week",
        `${sessionsDeltaPct > 0 ? "+" : ""}${sessionsDeltaPct}%`,
      );
    }
    doc.moveDown(0.5);
    drawTrafficSparkline(
      doc,
      ga4Daily.map((r) => r.sessions),
      {
        dates: ga4Daily.map((r) => new Date(r.date + "T00:00:00Z")),
      },
    );
    doc.moveDown(1.5);
  }

  // === Top keywords from Search Console ===
  if (gscTop.length > 0 && !isExecutive(template)) {
    drawSectionHeading(doc, "Top keywords (Search Console, 28 days)");
    drawKeywordTable(doc, gscTop.slice(0, 10));
    doc.moveDown(1.2);
  } else if (gscTop.length > 0 && isExecutive(template)) {
    // Executive: just the top 5 as a tight list
    drawSectionHeading(doc, "Top organic keywords");
    for (const k of gscTop.slice(0, 5)) {
      ensureSpace(doc, 22);
      doc
        .fillColor(palette.ink)
        .font("Helvetica-Bold")
        .fontSize(10)
        .text(k.query, { continued: true });
      doc
        .fillColor(palette.mute)
        .font("Helvetica")
        .text(
          `   ${k.clicks} clicks · pos ${k.position.toFixed(1)}`,
        );
    }
    doc.moveDown(1.2);
  }

  // === Quick wins ===
  if (gscQuickWins.length > 0 && !isExecutive(template)) {
    drawSectionHeading(doc, "Quick wins — keywords ranking 4-15");
    doc
      .fillColor(palette.mute)
      .font("Helvetica")
      .fontSize(9)
      .text(
        "Sitting just outside page 1 with real impressions. One tweak can push them onto page 1, where CTR jumps from <2% to 5-12%.",
        { lineGap: 2 },
      );
    doc.moveDown(0.4);
    drawKeywordTable(doc, gscQuickWins.slice(0, 8), {
      highlightPosition: true,
    });
    doc.moveDown(1.2);
  }

  // === Issues by severity === (always; executive shows top 3 only)
  if (allIssues.length > 0) {
    drawSectionHeading(doc, "Issues by severity");
    const grouped = {
      critical: allIssues.filter((i) => i.severity === "critical"),
      high: allIssues.filter((i) => i.severity === "high"),
      medium: allIssues.filter((i) => i.severity === "medium"),
      low: allIssues.filter((i) => i.severity === "low"),
    };

    // Executive: cap each severity to a small number, drop low altogether
    const severitiesToShow: (keyof typeof grouped)[] =
      isExecutive(template)
        ? ["critical", "high"]
        : ["critical", "high", "medium", "low"];
    const perSevCap =
      isExecutive(template) ? 3 : isDetailed(template) ? 25 : Infinity;

    for (const sev of severitiesToShow) {
      const list = grouped[sev];
      if (list.length === 0) continue;
      ensureSpace(doc, 60);
      doc
        .fillColor(sevColor[sev])
        .fontSize(10)
        .font("Helvetica-Bold")
        .text(`${sev.toUpperCase()} · ${list.length}`);
      doc.moveDown(0.3);
      doc.fillColor(palette.ink).font("Helvetica").fontSize(10);
      for (const issue of list.slice(0, perSevCap)) {
        ensureSpace(doc, 40);
        doc
          .font("Helvetica-Bold")
          .fillColor(palette.ink)
          .text(issue.type.replace(/_/g, " "), { continued: false });
        doc
          .font("Helvetica")
          .fillColor(palette.mute)
          .fontSize(9)
          .text(issue.message, { lineGap: 2 });
        // Technical template: include the URL too
        if (isTechnical(template)) {
          doc
            .font("Helvetica-Oblique")
            .fillColor(palette.mute)
            .fontSize(8)
            .text(issue.url);
        }
        doc.moveDown(0.5);
        doc.fontSize(10);
      }
      if (list.length > perSevCap) {
        doc
          .font("Helvetica-Oblique")
          .fillColor(palette.mute)
          .fontSize(9)
          .text(`+ ${list.length - perSevCap} more`);
      }
      doc.moveDown(0.5);
    }
  }

  // Executive template stops here — short and focused
  if (isExecutive(template)) {
    drawFooter(doc, brand, today);
    doc.end();
    return finished;
  }

  // === Work completed this month === (detailed only)
  if (isDetailed(template)) {
    doc.addPage();
    drawSectionHeading(doc, "Work completed this period");
    if (doneTasks.length === 0) {
      doc
        .fillColor(palette.mute)
        .font("Helvetica")
        .fontSize(10)
        .text("No tasks marked complete in this period.");
    } else {
      doc.fillColor(palette.ink).font("Helvetica").fontSize(10);
      for (const t of doneTasks) {
        ensureSpace(doc, 30);
        doc.font("Helvetica-Bold").text(`✓ ${t.title}`);
        if (t.description)
          doc
            .font("Helvetica")
            .fillColor(palette.mute)
            .fontSize(9)
            .text(t.description);
        doc.moveDown(0.4);
        doc.fontSize(10).fillColor(palette.ink);
      }
    }

    doc.moveDown(1.5);

    // === Links built this period ===
    if (linksBuiltThisPeriod.length > 0) {
      drawSectionHeading(doc, "Links built this period");
      doc.fillColor(palette.ink).font("Helvetica").fontSize(10);
      const total = linksBuiltThisPeriod.length;
      const dofollow = linksBuiltThisPeriod.filter((l) => l.rel === "dofollow")
        .length;
      const avgDa = (() => {
        const withDa = linksBuiltThisPeriod
          .map((l) => l.domainAuthority)
          .filter((d): d is number => typeof d === "number");
        if (withDa.length === 0) return null;
        return Math.round(
          withDa.reduce((s, n) => s + n, 0) / withDa.length,
        );
      })();
      doc
        .font("Helvetica-Bold")
        .text(`${total} link${total === 1 ? "" : "s"} placed`);
      doc
        .font("Helvetica")
        .fillColor(palette.mute)
        .fontSize(9)
        .text(
          `${dofollow} dofollow${avgDa !== null ? ` · avg DA ${avgDa}` : ""}`,
        );
      doc.moveDown(0.6);
      doc.fontSize(10).fillColor(palette.ink);
      for (const l of linksBuiltThisPeriod) {
        ensureSpace(doc, 28);
        doc
          .font("Helvetica-Bold")
          .text(`• ${l.sourceDomain}${l.method ? ` (${l.method})` : ""}`);
        const meta: string[] = [];
        if (l.anchorText) meta.push(`anchor: "${l.anchorText}"`);
        if (l.domainAuthority !== null && l.domainAuthority !== undefined)
          meta.push(`DA ${l.domainAuthority}`);
        if (l.rel) meta.push(l.rel);
        if (l.placedAt)
          meta.push(new Date(l.placedAt).toLocaleDateString());
        if (meta.length > 0) {
          doc
            .font("Helvetica")
            .fillColor(palette.mute)
            .fontSize(9)
            .text(meta.join(" · "));
        }
        if (l.notes) {
          doc
            .font("Helvetica-Oblique")
            .fillColor(palette.mute)
            .fontSize(9)
            .text(l.notes);
        }
        doc.moveDown(0.3);
        doc.fontSize(10).fillColor(palette.ink);
      }
      doc.moveDown(1);
    }

    // === Tracker submissions that went live ===
    if (submissionsLiveThisPeriod.length > 0) {
      drawSectionHeading(doc, "Backlink hub — links marked live");
      doc
        .fillColor(palette.ink)
        .font("Helvetica-Bold")
        .fontSize(10)
        .text(
          `${submissionsLiveThisPeriod.length} link${submissionsLiveThisPeriod.length === 1 ? "" : "s"} from your tracker`,
        );
      doc.moveDown(0.4);
      for (const s of submissionsLiveThisPeriod) {
        ensureSpace(doc, 22);
        doc.font("Helvetica").fontSize(10).text(`• ${s.domain ?? "(unknown)"}`);
        const meta: string[] = [];
        if (s.category) meta.push(s.category.replace(/-/g, " "));
        if (s.da !== null && s.da !== undefined) meta.push(`DA ${s.da}`);
        if (s.submittedAt)
          meta.push(new Date(s.submittedAt).toLocaleDateString());
        if (meta.length > 0) {
          doc
            .font("Helvetica")
            .fillColor(palette.mute)
            .fontSize(9)
            .text(meta.join(" · "));
          doc.fillColor(palette.ink);
        }
        doc.moveDown(0.2);
      }
      doc.moveDown(1);
    }

    // === Guest posts published ===
    if (guestPostsPublishedThisPeriod.length > 0) {
      drawSectionHeading(doc, "Guest posts published");
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor(palette.ink)
        .text(
          `${guestPostsPublishedThisPeriod.length} guest post${guestPostsPublishedThisPeriod.length === 1 ? "" : "s"} live`,
        );
      doc.moveDown(0.4);
      for (const g of guestPostsPublishedThisPeriod) {
        ensureSpace(doc, 28);
        doc
          .font("Helvetica-Bold")
          .fontSize(10)
          .fillColor(palette.ink)
          .text(`• ${g.siteName} — ${g.topic}`);
        const meta: string[] = [];
        if (g.targetKeyword) meta.push(`target: ${g.targetKeyword}`);
        if (g.publishedAt)
          meta.push(new Date(g.publishedAt).toLocaleDateString());
        if (meta.length > 0) {
          doc
            .font("Helvetica")
            .fillColor(palette.mute)
            .fontSize(9)
            .text(meta.join(" · "));
          doc.fillColor(palette.ink);
        }
        doc.moveDown(0.2);
      }
      doc.moveDown(1);
    }

    // === Rank movement ===
    if (rankMovements.length > 0) {
      drawSectionHeading(doc, "Rank movement this period");
      const ups = rankMovements.filter((r) => r.delta > 0);
      const downs = rankMovements.filter((r) => r.delta < 0);
      doc
        .font("Helvetica")
        .fillColor(palette.mute)
        .fontSize(9)
        .text(
          `${ups.length} keyword${ups.length === 1 ? "" : "s"} moved up · ${downs.length} dropped`,
        );
      doc.moveDown(0.6);
      doc.fontSize(10).fillColor(palette.ink);
      for (const m of rankMovements.slice(0, 15)) {
        ensureSpace(doc, 18);
        const arrow = m.delta > 0 ? "▲" : "▼";
        doc
          .font("Helvetica-Bold")
          .text(`${arrow} ${m.query}`, { continued: true })
          .font("Helvetica")
          .fillColor(palette.mute)
          .text(
            `  #${m.prior} → #${m.current} (${m.delta > 0 ? "+" : ""}${m.delta})`,
          );
        doc.fillColor(palette.ink);
      }
      doc.moveDown(1);
    }

    // === Page changes (from page monitor) ===
    if (pageChangesForClient.length > 0) {
      drawSectionHeading(doc, "Page changes detected");
      doc.font("Helvetica").fontSize(10).fillColor(palette.ink);
      for (const c of pageChangesForClient.slice(0, 10)) {
        ensureSpace(doc, 26);
        doc
          .font("Helvetica-Bold")
          .text(`${c.field} changed`, { continued: true })
          .font("Helvetica")
          .fillColor(palette.mute)
          .fontSize(9)
          .text(
            `  on ${c.url ?? "(unknown URL)"} · ${c.detectedAt.toLocaleDateString()}`,
          );
        doc.fontSize(10).fillColor(palette.ink);
      }
      doc.moveDown(1);
    }

    // === AI suggestions applied ===
    if (suggestionsApplied.length > 0) {
      drawSectionHeading(doc, "AI suggestions applied");
      doc
        .font("Helvetica")
        .fillColor(palette.mute)
        .fontSize(9)
        .text(`${suggestionsApplied.length} suggestion${suggestionsApplied.length === 1 ? "" : "s"} applied this period.`);
      doc.moveDown(0.6);
      doc.fontSize(10).fillColor(palette.ink);
      for (const s of suggestionsApplied.slice(0, 12)) {
        ensureSpace(doc, 24);
        doc
          .font("Helvetica-Bold")
          .text(`✓ ${s.type.replace(/_/g, " ")}`);
        if (s.suggestedValue) {
          doc
            .font("Helvetica")
            .fillColor(palette.mute)
            .fontSize(9)
            .text(s.suggestedValue.slice(0, 200));
        }
        doc.moveDown(0.3);
        doc.fontSize(10).fillColor(palette.ink);
      }
      doc.moveDown(1);
    }

    // === Recommendations / next month ===
    // Reports v2 — 5-page restructure: this is page 5 (next steps).
    // Final page is recommendations + tech context so the reader ends
    // the report looking forward, not back.
    doc.addPage();
    drawSectionHeading(doc, "Recommendations · next period");
    if (openTasks.length === 0) {
      doc
        .fillColor(palette.mute)
        .font("Helvetica")
        .fontSize(10)
        .text("No open recommendations. Run a new audit for fresh suggestions.");
    } else {
      const byPriority = {
        high: openTasks.filter((t) => t.priority === "high"),
        medium: openTasks.filter((t) => t.priority === "medium"),
        low: openTasks.filter((t) => t.priority === "low"),
      };
      for (const [p, list] of Object.entries(byPriority) as [
        keyof typeof byPriority,
        typeof openTasks,
      ][]) {
        if (list.length === 0) continue;
        ensureSpace(doc, 40);
        doc
          .fillColor(
            p === "high"
              ? palette.bad
              : p === "medium"
                ? palette.warn
                : palette.mute,
          )
          .font("Helvetica-Bold")
          .fontSize(10)
          .text(`${p.toUpperCase()} PRIORITY`);
        doc.moveDown(0.3);
        for (const t of list.slice(0, 8)) {
          ensureSpace(doc, 30);
          doc
            .fillColor(palette.ink)
            .font("Helvetica-Bold")
            .fontSize(10)
            .text(t.title);
          if (t.whyItMatters)
            doc
              .fillColor(palette.mute)
              .font("Helvetica")
              .fontSize(9)
              .text(t.whyItMatters, { lineGap: 2 });
          doc.moveDown(0.4);
        }
        doc.moveDown(0.4);
      }
    }
  }

  // Technical template: tech-stack focus + security headers info
  if (isTechnical(template)) {
    doc.moveDown(1);
    drawSectionHeading(doc, "Tech stack");
    doc
      .fillColor(palette.ink)
      .font("Helvetica")
      .fontSize(10)
      .text(
        client.techStack && client.techStack.length > 0
          ? client.techStack.join(", ")
          : "Not detected",
      );

    doc.moveDown(1.5);
    drawSectionHeading(doc, "What this report covers");
    doc
      .fillColor(palette.mute)
      .font("Helvetica")
      .fontSize(10)
      .text(
        "Technical template: every issue across all crawled pages, with affected URLs. Use this for engineering handoff or pre/post-deploy verification.",
        { lineGap: 3 },
      );
  }

    drawFooter(doc, brand, today);
    doc.end();
    return await finished;
  } finally {
    releaseLock();
  }
}

function drawFooter(
  doc: PDFKit.PDFDocument,
  brand: Brand,
  today: Date,
) {
  const footerText = brand.name
    ? `Prepared by ${brand.name} · ${today.toLocaleString()}`
    : `Generated by SEO Tool · ${today.toLocaleString()} · Local instance`;
  doc
    .fillColor(palette.mute)
    .font("Helvetica-Oblique")
    .fontSize(8)
    .text(footerText, 56, doc.page.height - 40, {
      align: "center",
      width: doc.page.width - 112,
    });
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
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

function drawKeyValueRow(doc: PDFKit.PDFDocument, key: string, value: string) {
  ensureSpace(doc, 22);
  const startY = doc.y;
  doc
    .fillColor(palette.mute)
    .font("Helvetica")
    .fontSize(10)
    .text(key, doc.page.margins.left, startY, { continued: false });
  doc
    .fillColor(palette.ink)
    .font("Helvetica-Bold")
    .text(value, doc.page.margins.left, startY, {
      align: "right",
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    });
  doc.moveDown(0.4);
}

/**
 * Render a metric row showing prior → current with a coloured delta.
 * For metrics where lower is better (avg position, issues), set inverted.
 */
function drawDeltaRow(
  doc: PDFKit.PDFDocument,
  label: string,
  prior: number | null,
  current: number | null,
  opts?: { inverted?: boolean },
) {
  if (prior === null || current === null) return;
  const delta = current - prior;
  const inverted = opts?.inverted ?? false;
  const isUp = delta > 0;
  const isFlat = Math.abs(delta) < 0.5;
  const direction = isFlat ? "→" : isUp ? "↑" : "↓";
  const isGood = isFlat ? null : inverted ? !isUp : isUp;
  const arrowColor = isFlat
    ? palette.mute
    : isGood
      ? "#34d399"
      : "#f87171";

  ensureSpace(doc, 22);
  const startY = doc.y;
  doc
    .fillColor(palette.mute)
    .font("Helvetica")
    .fontSize(10)
    .text(label, doc.page.margins.left, startY, { continued: false });

  const valueText = `${prior} → ${current}`;
  doc
    .fillColor(palette.ink)
    .font("Helvetica-Bold")
    .text(valueText, doc.page.margins.left, startY, {
      align: "right",
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    });

  // Arrow + delta below the row, right-aligned
  const deltaPct =
    prior !== 0
      ? ` (${delta > 0 ? "+" : ""}${Math.round((delta / prior) * 100)}%)`
      : "";
  doc
    .fontSize(9)
    .fillColor(arrowColor)
    .text(`${direction} ${delta > 0 ? "+" : ""}${delta}${deltaPct}`, {
      align: "right",
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    });
  doc.fillColor(palette.ink).fontSize(10);
  doc.moveDown(0.2);
}

function drawKeywordTable(
  doc: PDFKit.PDFDocument,
  rows: GscKeyword[],
  opts?: { highlightPosition?: boolean },
) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const cols = {
    query: left,
    clicks: left + 270,
    impr: left + 340,
    ctr: left + 400,
    pos: right - 30,
  };

  ensureSpace(doc, 30);
  // Header row
  const headerY = doc.y;
  doc
    .fillColor(palette.mute)
    .font("Helvetica-Bold")
    .fontSize(8)
    .text("QUERY", cols.query, headerY, { characterSpacing: 1 })
    .text("CLICKS", cols.clicks, headerY, { width: 60, align: "right" })
    .text("IMPR.", cols.impr, headerY, { width: 50, align: "right" })
    .text("CTR", cols.ctr, headerY, { width: 50, align: "right" })
    .text("POS", cols.pos, headerY, { width: 30, align: "right" });
  doc.y = headerY + 14;
  doc
    .strokeColor(palette.rule)
    .lineWidth(0.5)
    .moveTo(left, doc.y)
    .lineTo(right, doc.y)
    .stroke();
  doc.y += 3;

  doc.font("Helvetica").fontSize(9);
  for (const r of rows) {
    ensureSpace(doc, 18);
    const y = doc.y;
    // Truncate query so it fits
    const query =
      r.query.length > 50 ? r.query.slice(0, 47) + "…" : r.query;
    doc
      .fillColor(palette.ink)
      .text(query, cols.query, y, { width: 260 })
      .fillColor(palette.mute)
      .text(r.clicks.toLocaleString(), cols.clicks, y, {
        width: 60,
        align: "right",
      })
      .text(r.impressions.toLocaleString(), cols.impr, y, {
        width: 50,
        align: "right",
      })
      .text(`${(r.ctr * 100).toFixed(1)}%`, cols.ctr, y, {
        width: 50,
        align: "right",
      });
    const posTone = opts?.highlightPosition
      ? palette.warn
      : r.position <= 3
        ? palette.good
        : r.position <= 10
          ? palette.brand
          : palette.mute;
    doc
      .fillColor(posTone)
      .font("Helvetica-Bold")
      .text(r.position.toFixed(1), cols.pos, y, {
        width: 30,
        align: "right",
      })
      .font("Helvetica");
    doc.y = y + 14;
  }
}

/**
 * Series renderer for the GA4 organic-traffic chart. When the caller
 * provides per-point dates (`opts.dates`), any Google algorithm update
 * whose rollout window overlaps the chart's range is annotated with a
 * dashed vertical line + a tiny label below — so a traffic drop the
 * reader is looking at lines up visibly against the Google update
 * that probably caused it.
 */
function drawTrafficSparkline(
  doc: PDFKit.PDFDocument,
  values: number[],
  opts?: { dates?: Date[] },
) {
  if (values.length < 2) return;
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const top = doc.y;
  const w = right - left;
  const h = 36;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const step = w / (values.length - 1);

  doc
    .roundedRect(left, top, w, h, 4)
    .fillAndStroke("#f8f8fc", palette.rule);

  // Algorithm-update overlay — drawn behind the trend line so the line
  // stays the dominant visual element. Only fires when caller passes
  // dates aligned 1-1 with values.
  const annotations: { x: number; label: string }[] = [];
  if (opts?.dates && opts.dates.length === values.length) {
    const firstT = opts.dates[0].getTime();
    const lastT = opts.dates[opts.dates.length - 1].getTime();
    if (lastT > firstT) {
      // Lazy require so the report-generator module graph isn't forced
      // to pull algorithm-updates at import time.

      const { ALGO_UPDATES } = require("./algorithm-updates") as {
        ALGO_UPDATES: { date: string; endDate?: string; name: string }[];
      };
      for (const u of ALGO_UPDATES) {
        const startT = new Date(u.date + "T00:00:00Z").getTime();
        if (isNaN(startT)) continue;
        if (startT < firstT || startT > lastT) continue;
        const x = left + ((startT - firstT) / (lastT - firstT)) * w;
        annotations.push({ x, label: u.name });
      }
    }
  }

  // Draw annotation rules first (dashed gray, behind the polyline)
  if (annotations.length > 0) {
    doc.save();
    doc.strokeColor(palette.mute).lineWidth(0.6).dash(2, { space: 3 });
    for (const a of annotations) {
      doc.moveTo(a.x, top + 2).lineTo(a.x, top + h - 2).stroke();
    }
    doc.undash().restore();
  }

  // Build polyline path
  const pts: [number, number][] = values.map((v, i) => [
    left + i * step,
    top + (h - 4) - ((v - min) / range) * (h - 8) - 4,
  ]);
  doc.strokeColor(palette.brand).lineWidth(1.2);
  for (let i = 0; i < pts.length - 1; i++) {
    doc.moveTo(pts[i][0], pts[i][1]).lineTo(pts[i + 1][0], pts[i + 1][1]).stroke();
  }
  doc.y = top + h + 4;

  // Tiny legend below the chart explaining the dashed lines. Only when
  // we actually drew at least one annotation.
  if (annotations.length > 0) {
    const labels = annotations
      .map((a) => a.label)
      .slice(0, 3)
      .join(" · ");
    const extra = annotations.length > 3 ? ` (+${annotations.length - 3} more)` : "";
    doc
      .fillColor(palette.mute)
      .font("Helvetica-Oblique")
      .fontSize(8)
      .text(`Dashed lines mark Google updates: ${labels}${extra}`, left, doc.y, {
        width: w,
      })
      .font("Helvetica");
    doc.y += 4;
  }
}

function drawHealthScoreBlock(
  doc: PDFKit.PDFDocument,
  score: number | null,
  prev: number | null,
) {
  const left = doc.page.margins.left;
  const top = doc.y;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const height = 90;

  doc
    .roundedRect(left, top, width, height, 8)
    .fillAndStroke("#f5f5fa", palette.rule);

  doc
    .fillColor(palette.mute)
    .font("Helvetica")
    .fontSize(9)
    .text("HEALTH SCORE", left + 16, top + 14, { characterSpacing: 1 });

  doc
    .fillColor(scoreColor(score))
    .font("Helvetica-Bold")
    .fontSize(40)
    .text(score === null ? "—" : String(score), left + 16, top + 28);

  doc
    .fillColor(palette.mute)
    .font("Helvetica")
    .fontSize(10)
    .text("of 100", left + 16, top + 70);

  if (prev !== null && score !== null) {
    const delta = score - prev;
    const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "→";
    const tone = delta > 0 ? palette.good : delta < 0 ? palette.bad : palette.mute;
    doc
      .fillColor(tone)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(
        `${arrow} ${delta > 0 ? "+" : ""}${delta} vs last audit`,
        left + 120,
        top + 40,
      );
  }

  // Move cursor below the box
  doc.y = top + height + 10;
}

/**
 * Full-bleed cover page (Reports v2). Brand-color background, top
 * logo, big-number wow (latest health score), client name + URL at
 * the bottom, prepared-by attribution.
 *
 * Renders inside the current page; caller should immediately
 * doc.addPage() after this returns so the content layout starts fresh.
 */
function drawCoverPage(
  doc: PDFKit.PDFDocument,
  opts: {
    clientName: string;
    clientUrl: string;
    score: number | null;
    previousScore: number | null;
    brandColor: string;
    brandName: string | null;
    brandLogo: { buffer: Buffer; mime: string | null } | null;
    template: string;
  },
) {
  const W = doc.page.width;
  const H = doc.page.height;

  // Full-bleed background
  doc.save();
  doc.rect(0, 0, W, H).fill(opts.brandColor);

  // Subtle radial overlay at top-left for depth (approximate via
  // overlapping translucent rectangles — pdfkit has no gradients).
  doc.rect(0, 0, W * 0.7, H * 0.5).fillOpacity(0.08).fill("#ffffff");
  doc.fillOpacity(1);

  // Top: logo + agency name
  const padX = 56;
  const padY = 56;
  if (opts.brandLogo) {
    try {
      doc.image(opts.brandLogo.buffer, padX, padY, { fit: [140, 50] });
    } catch {
      // ignore
    }
  } else if (opts.brandName) {
    doc
      .font("Helvetica-Bold")
      .fillColor("#ffffff")
      .fontSize(14)
      .text(opts.brandName, padX, padY);
  }

  // Top-right: template label
  doc
    .font("Helvetica")
    .fillColor("#ffffff")
    .fillOpacity(0.7)
    .fontSize(9)
    .text(
      opts.template.toUpperCase(),
      W - padX - 200,
      padY + 4,
      { width: 200, align: "right", characterSpacing: 2 },
    )
    .fillOpacity(1);

  // Big number — centered vertically + horizontally. Latest health
  // score is the canonical metric on the cover. Delta vs previous
  // sits beneath if both exist.
  const centerY = H * 0.42;
  const score = opts.score;
  const scoreText = score === null ? "—" : String(score);
  doc
    .font("Helvetica-Bold")
    .fillColor("#ffffff")
    .fontSize(160)
    .text(scoreText, 0, centerY - 70, { width: W, align: "center" });

  doc
    .font("Helvetica")
    .fillColor("#ffffff")
    .fillOpacity(0.75)
    .fontSize(12)
    .text("Health score / 100", 0, centerY + 100, {
      width: W,
      align: "center",
      characterSpacing: 1,
    })
    .fillOpacity(1);

  // Delta vs previous
  if (score !== null && opts.previousScore !== null) {
    const delta = score - opts.previousScore;
    const sign = delta > 0 ? "+" : "";
    doc
      .font("Helvetica-Bold")
      .fillColor("#ffffff")
      .fillOpacity(0.9)
      .fontSize(14)
      .text(
        `${sign}${delta} vs previous (${opts.previousScore})`,
        0,
        centerY + 124,
        { width: W, align: "center" },
      )
      .fillOpacity(1);
  }

  // Bottom-left: client name + URL
  const bottomY = H - padY - 90;
  doc
    .font("Helvetica")
    .fillColor("#ffffff")
    .fillOpacity(0.6)
    .fontSize(9)
    .text("PREPARED FOR", padX, bottomY, { characterSpacing: 2 })
    .fillOpacity(1);
  doc
    .moveDown(0.4)
    .font("Helvetica-Bold")
    .fillColor("#ffffff")
    .fontSize(24)
    .text(opts.clientName, padX, doc.y, { lineGap: 2 });
  doc
    .moveDown(0.2)
    .font("Helvetica")
    .fillColor("#ffffff")
    .fillOpacity(0.7)
    .fontSize(11)
    .text(opts.clientUrl.replace(/^https?:\/\//, ""), padX, doc.y)
    .fillOpacity(1);

  // Bottom-right: period
  const periodLabel = new Date().toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  doc
    .font("Helvetica")
    .fillColor("#ffffff")
    .fillOpacity(0.6)
    .fontSize(9)
    .text("REPORT PERIOD", W - padX - 200, bottomY, {
      width: 200,
      align: "right",
      characterSpacing: 2,
    })
    .fillOpacity(1);
  doc
    .font("Helvetica-Bold")
    .fillColor("#ffffff")
    .fontSize(16)
    .text(periodLabel, W - padX - 200, doc.y + 6, {
      width: 200,
      align: "right",
    });

  // Prepared by line
  if (opts.brandName) {
    doc
      .font("Helvetica")
      .fillColor("#ffffff")
      .fillOpacity(0.55)
      .fontSize(9)
      .text(`Prepared by ${opts.brandName}`, padX, H - padY - 10, {
        characterSpacing: 1,
      })
      .fillOpacity(1);
  }

  doc.restore();
}
