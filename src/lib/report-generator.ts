import PDFDocument from "pdfkit";
import { eq, desc, and, gte } from "drizzle-orm";
import { OPEN_ISSUE_STATUS, pickReferenceAudits } from "@/lib/reference-audit";
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
import { generateExecSummary } from "./ai-summary";
import { openToolFindings } from "./tool-findings";
import { groupIssuesByRule } from "./report-issue-groups";
import { planProgress } from "./plan-tasks";
import { mapToolFinding } from "./agent/tool-finding-map";
import type { AlgoUpdate } from "./algorithm-updates";
import { getRankingUpdates } from "./google-updates-store";
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
import { loadBrand, type Brand } from "./brand";
import { isOpenTask } from "./task-status";
import { getRuleById } from "@/audit/catalog";
import { getReportLocale, reportFormat, reportStrings } from "./report-i18n";

type Color = string;

const defaultPalette = {
  ink: "#0f1117" as Color,
  mute: "#5b6173" as Color,
  rule: "#dde0e7" as Color,
  // The app's brand blue; a workspace brand colour overrides it.
  brand: "#0a6fa8" as Color,
  good: "#0f9460" as Color,
  warn: "#b76b00" as Color,
  bad: "#c43151" as Color,
};

// Module-mutable so the existing helpers (88 references) can read it
// without threading palette through every function. Concurrent
// generateReportPdf calls are serialized via _generateLock below so two
// reports don't stomp each other's brand color.
let palette = { ...defaultPalette };

// Report language, set with the palette under the same lock: the
// workspace language (Settings -> General), see report-i18n.ts.
let L = reportStrings("en");
let F = reportFormat("en");

/** Readable name of an issue type: the audit rule's name, not its id. */
function issueTitle(type: string): string {
  if (type.startsWith("seomator:")) {
    const rule = getRuleById(type.slice("seomator:".length));
    if (rule?.name) return rule.name;
  }
  return type.replace(/_/g, " ");
}

// Mutex that serializes report generation. Without this, two concurrent
// calls would race on palette mutation: client A sets brand color, awaits
// I/O, then client B overwrites palette.brand mid-render of A's PDF.
// Real-world risk is low (single-user app, ~5s per report) but the bug
// is real and the cost of fixing is a one-line mutex.
let _generateLock: Promise<void> = Promise.resolve();

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
    const locale = await getReportLocale();
    L = reportStrings(locale);
    F = reportFormat(locale);

  const completedAudits = await db
    .select()
    .from(audits)
    .where(and(eq(audits.clientId, clientId), eq(audits.status, "completed")))
    .orderBy(desc(audits.completedAt));

  // The reference audit and the previous one of the same mode, never the
  // AI checklist (lib/reference-audit.ts).
  const { latest, previous, crawls } = pickReferenceAudits(completedAudits);

  const allIssues = latest
    ? await db
        .select()
        .from(auditIssues)
        .where(and(eq(auditIssues.auditId, latest.id), eq(auditIssues.status, OPEN_ISSUE_STATUS)))
    : [];

  const allTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.clientId, clientId));

  const doneTasks = allTasks.filter((t) => t.status === "done");
  // Skipped means "decided against", and the client report is the wrong
  // place to keep proposing it. It was landing in the recommendations
  // section because this asked for everything that was not done.
  const openTasks = allTasks.filter((t) => isOpenTask(t.status));

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

  /*
   * What the tools found, minus anything the crawl already reported.
   *
   * Some tool findings are the same problem the crawler names in its own
   * vocabulary — the AI-crawler policy check and the crawler's
   * missing_ai_crawler_policy are one issue found twice, and listing
   * both would tell a client they have two problems where they have one.
   * TOOL_FINDING_MAP already knows which signatures mean which crawler
   * finding, so it does the matching rather than a second list of pairs.
   *
   * Unmapped findings always survive: no mapping means the crawler has
   * no equivalent, which is exactly when the tool is telling the client
   * something new.
   */
  // How the engagement is tracking against what the client approved.
  // Null when there is no sent plan, which is legitimate — not every
  // client is on one.
  const planState = await planProgress(clientId);

  const crawlerTypes = new Set(allIssues.map((i) => i.type));
  const toolFindingsForReport = (await openToolFindings(clientId)).filter(
    (f) => {
      const equivalent = mapToolFinding(f.signature);
      return !equivalent || !crawlerTypes.has(equivalent);
    },
  );

  /*
   * Links that went away, and which we CHECKED had gone.
   *
   * Reported, where discovered links deliberately are not. The two are
   * not the same kind of claim. A discovered link comes from a free,
   * partial index — it found one link for a site with thousands — so
   * "you gained 3 links" would understate a month's work to somebody
   * paying for it. A lost link is evidence: the watchdog fetched the
   * source page twice, across two runs, and the link was not there
   * either time.
   *
   * Ordered by domain authority so the ones worth an email come first,
   * which is what "recovery priority" means in practice.
   */
  const linksLostThisPeriod = await db
    .select({
      id: backlinks.id,
      sourceUrl: backlinks.sourceUrl,
      sourceDomain: backlinks.sourceDomain,
      targetUrl: backlinks.targetUrl,
      anchorText: backlinks.anchorText,
      domainAuthority: backlinks.domainAuthority,
      lastSeen: backlinks.lastSeen,
    })
    .from(backlinks)
    .where(
      and(
        eq(backlinks.clientId, clientId),
        eq(backlinks.status, "lost"),
        // When we noticed, not when it vanished — the source page could
        // have been edited any time since the last check, and claiming a
        // date we do not know would be inventing one.
        gte(backlinks.updatedAt, periodCutoff),
      ),
    )
    .orderBy(desc(backlinks.domainAuthority), desc(backlinks.updatedAt));

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

  // Page changes detected via the page-monitor scheduler in the period.
  //
  // Filtered by client in the query. It used to filter by date only and
  // then keep every row with a URL, on the belief that the join limited
  // it to this client. It did not: each client's report would have listed
  // every client's monitored pages.
  const pageChangesForClient = await db
    .select({
      field: pageChanges.field,
      severity: pageChanges.severity,
      oldValue: pageChanges.oldValue,
      newValue: pageChanges.newValue,
      detectedAt: pageChanges.detectedAt,
      url: monitoredPages.url,
    })
    .from(pageChanges)
    .innerJoin(
      monitoredPages,
      eq(pageChanges.monitoredPageId, monitoredPages.id),
    )
    .where(
      and(
        eq(monitoredPages.clientId, clientId),
        gte(pageChanges.detectedAt, periodCutoff),
      ),
    )
    .orderBy(desc(pageChanges.detectedAt))
    .limit(50);

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
      type: issueTitle(i.type),
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
    locale: (await getReportLocale()),
  });
  void topIssue;
  void aiExecutiveSummary;

  const buffers: Buffer[] = [];
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 60, bottom: 60, left: 56, right: 56 },
    info: {
      Title: L.docTitle(client.name),
      Author: brand.name || L.docAuthor,
      Subject: L.docSubject,
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
    template: L.templates[template],
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
    .text(L.seoReport, { characterSpacing: 2 });
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
  const periodLabel = F.monthYear(today);
  doc.fillColor(palette.mute).fontSize(10).text(L.period(periodLabel));
  if (brand.name) {
    doc
      .fillColor(palette.mute)
      .fontSize(9)
      .text(L.preparedBy(brand.name));
  }

  // Template label + variant intro on cover
  doc
    .fillColor(palette.mute)
    .fontSize(9)
    .text(L.template(L.templates[template]));
  const framingIntro = L.framing[template];
  if (framingIntro) {
    doc
      .moveDown(0.3)
      .fillColor(palette.mute)
      .font("Helvetica-Oblique")
      .fontSize(10)
      .text(framingIntro);
  }

  doc.moveDown(2);

  // === Health score block ===
  drawHealthScoreBlock(doc, latest?.score ?? null, previous?.score ?? null);

  doc.moveDown(2);

  // === Executive summary === (always)
  drawSectionHeading(doc, L.execSummary);
  doc
    .fillColor(palette.ink)
    .fontSize(11)
    .font("Helvetica")
    .text(exec.prose, { lineGap: 4 });

  // Where we are against the plan, and — in the early months — why the
  // traffic line is not the thing to read yet.
  //
  // Search takes roughly 60 to 90 days to move, so month one's work
  // appears in month three. A client reading month one, seeing flat
  // traffic and drawing the obvious conclusion is how engagements end at
  // exactly the point where nothing could have shown yet. The honest
  // answer is to point them at what did happen instead.
  if (planState) {
    doc.moveDown(0.6);
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(palette.ink)
      .text(
        L.planLine(
          planState.currentWeek,
          planState.totalWeeks,
          planState.phase ?? null,
          planState.done,
          planState.total,
          planState.overdue,
        ),
      );

    if (planState.currentWeek <= 9) {
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(palette.mute)
        .text(
          L.planPatience,
          { lineGap: 2 },
        );
      doc.fillColor(palette.ink).fontSize(11);
    }
  }

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
      .text(L.dataBehind, { characterSpacing: 1 });
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(9).fillColor(palette.mute);
    for (const dp of exec.dataPoints) {
      doc.text(`• ${dp.label}${L.colon}${dp.value}`, { lineGap: 1 });
    }
    if (exec.source === "template") {
      doc.moveDown(0.3);
      doc.text(
        L.templateSummaryNote,
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
    drawSectionHeading(doc, L.performanceOverTime);
    const cur = snapshotComparison.latest;
    const base = snapshotComparison.baseline;
    const prior = snapshotComparison.prior;
    if (base) {
      doc
        .font("Helvetica")
        .fillColor(palette.mute)
        .fontSize(9)
        .text(
          L.sinceBaseline(
            F.date(base.capturedAt),
            Math.max(1, Math.round((Date.now() - base.capturedAt.getTime()) / 86_400_000)),
          ),
        );
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor(palette.ink);
      drawDeltaRow(doc, L.rowHealthScore, base.healthScore, cur.healthScore);
      drawDeltaRow(doc, L.rowClicks, base.organicClicks, cur.organicClicks);
      drawDeltaRow(doc, L.rowImpressions, base.organicImpressions, cur.organicImpressions);
      drawDeltaRow(doc, L.rowSessions, base.ga4Sessions, cur.ga4Sessions);
      drawDeltaRow(doc, L.rowConversions, base.ga4Conversions, cur.ga4Conversions);
      if (
        typeof base.ga4RevenueX100 === "number" &&
        typeof cur.ga4RevenueX100 === "number"
      ) {
        drawDeltaRow(
          doc,
          L.rowRevenue,
          Math.round(base.ga4RevenueX100 / 100),
          Math.round(cur.ga4RevenueX100 / 100),
        );
      }
      drawDeltaRow(doc, L.rowTop10, base.top10Count, cur.top10Count);
      drawDeltaRow(doc, L.rowBacklinks, base.backlinkCount, cur.backlinkCount);
      drawDeltaRow(doc, L.rowGbp, base.gbpScore, cur.gbpScore);
      doc.moveDown(0.5);
    }
    if (prior && prior !== base) {
      doc
        .font("Helvetica")
        .fillColor(palette.mute)
        .fontSize(9)
        .text(L.sinceSnapshot(F.date(prior.capturedAt)));
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor(palette.ink);
      drawDeltaRow(doc, L.rowHealthScore, prior.healthScore, cur.healthScore);
      drawDeltaRow(doc, L.rowClicks, prior.organicClicks, cur.organicClicks);
      drawDeltaRow(doc, L.rowTop10, prior.top10Count, cur.top10Count);
      doc.moveDown(0.5);
    }
    doc.moveDown(0.5);
  }

  // === Performance highlights === (skip on technical)
  // Reports v2 — 5-page restructure: this is page 3 (data + wins).
  // Cover + exec stays clean on its own pages; data pages start fresh.
  if (!isTechnical(template)) {
    doc.addPage();
    drawSectionHeading(doc, L.highlights);
    drawKeyValueRow(doc, L.auditsCompleted, String(crawls.length));
    drawKeyValueRow(doc, L.tasksCompleted, L.tasksOf(doneTasks.length, allTasks.length));
    drawKeyValueRow(doc, L.openIssues, String(allIssues.length));
    if (ga4Daily.length > 0) {
      const trend =
        sessionsDeltaPct !== null
          ? L.vsPrior(F.pct(sessionsDeltaPct))
          : "";
      drawKeyValueRow(
        doc,
        L.organicSessions28,
        `${F.num(totalSessions)}${trend}`,
      );
    }
    drawKeyValueRow(
      doc,
      L.techStack,
      client.techStack && client.techStack.length > 0
        ? client.techStack.join(", ")
        : L.notDetected,
    );
    doc.moveDown(1.5);
  }

  // === Organic traffic detail === (detailed only, when GA4 data exists)
  if (isDetailed(template) && ga4Daily.length > 0) {
    drawSectionHeading(doc, L.trafficTitle);
    drawKeyValueRow(doc, L.sessions, F.num(totalSessions));
    drawKeyValueRow(
      doc,
      L.users,
      F.num(ga4Daily.reduce((s, r) => s + r.users, 0)),
    );
    drawKeyValueRow(
      doc,
      L.pageviews,
      F.num(ga4Daily.reduce((s, r) => s + r.pageviews, 0)),
    );
    if (sessionsDeltaPct !== null) {
      drawKeyValueRow(
        doc,
        L.weekOverWeek,
        F.pct(sessionsDeltaPct),
      );
    }
    doc.moveDown(0.5);
    drawTrafficSparkline(
      doc,
      ga4Daily.map((r) => r.sessions),
      {
        dates: ga4Daily.map((r) => new Date(r.date + "T00:00:00Z")),
        updates: await getRankingUpdates(),
      },
    );
    doc.moveDown(1.5);
  }

  // === Top keywords from Search Console ===
  if (gscTop.length > 0 && !isExecutive(template)) {
    drawSectionHeading(doc, L.topKeywordsGsc);
    drawKeywordTable(doc, gscTop.slice(0, 10));
    doc.moveDown(1.2);
  } else if (gscTop.length > 0 && isExecutive(template)) {
    // Executive: just the top 5 as a tight list
    drawSectionHeading(doc, L.topKeywords);
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
          `   ${L.clicksPos(F.num(k.clicks), F.dec(k.position))}`,
        );
    }
    doc.moveDown(1.2);
  }

  // === Quick wins ===
  if (gscQuickWins.length > 0 && !isExecutive(template)) {
    drawSectionHeading(doc, L.quickWins);
    doc
      .fillColor(palette.mute)
      .font("Helvetica")
      .fontSize(9)
      .text(
        L.quickWinsHint,
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
    drawSectionHeading(doc, L.issuesBySeverity);
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
    // One entry per rule, with the pages it was found on underneath
    // (lib/report-issue-groups.ts). Executive: the three widest rules and
    // no page list. Detailed: a few pages each. Technical: all of it.
    const maxGroups = isExecutive(template) ? 3 : isDetailed(template) ? 25 : Infinity;
    const maxRows = isExecutive(template) ? 0 : isDetailed(template) ? 5 : 100;
    const textWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    for (const sev of severitiesToShow) {
      const list = grouped[sev];
      if (list.length === 0) continue;
      const { groups, hiddenGroups } = groupIssuesByRule(list, { maxGroups, maxRows });
      ensureSpace(doc, 60);
      doc
        .fillColor(sevColor[sev])
        .fontSize(10)
        .font("Helvetica-Bold")
        .text(`${L.severity[sev]} - ${list.length}`);
      doc.moveDown(0.3);
      for (const g of groups) {
        ensureSpace(doc, 46);
        doc
          .font("Helvetica-Bold")
          .fillColor(palette.ink)
          .fontSize(10)
          .text(issueTitle(g.type), { continued: true })
          .font("Helvetica")
          .fillColor(palette.mute)
          .fontSize(9)
          .text(`  ·  ${L.onPages(g.pageCount)}`);
        if (g.message) {
          doc.font("Helvetica").fillColor(palette.mute).fontSize(9).text(g.message, { lineGap: 2 });
        }
        for (const row of g.rows) {
          ensureSpace(doc, row.detail ? 26 : 14);
          doc
            .font("Helvetica-Oblique")
            .fillColor(palette.mute)
            .fontSize(8)
            .text(row.url, doc.page.margins.left + 10, doc.y, { width: textWidth - 10 });
          if (row.detail) {
            doc
              .font("Helvetica")
              .fillColor(palette.ink)
              .fontSize(8)
              .text(row.detail, doc.page.margins.left + 10, doc.y, { width: textWidth - 10 });
          }
        }
        doc.x = doc.page.margins.left;
        if (g.hidden > 0 && maxRows > 0) {
          doc
            .font("Helvetica-Oblique")
            .fillColor(palette.mute)
            .fontSize(8)
            .text(L.morePages(g.hidden), doc.page.margins.left + 10, doc.y);
          doc.x = doc.page.margins.left;
        }
        doc.moveDown(0.5);
        doc.fontSize(10);
      }
      if (hiddenGroups > 0) {
        doc
          .font("Helvetica-Oblique")
          .fillColor(palette.mute)
          .fontSize(9)
          .text(L.moreRules(hiddenGroups));
      }
      doc.moveDown(0.5);
    }
  }

  // === Found by the tools, outside the crawl ===
  //
  // The crawl is one pass over the site. The tools go deeper and
  // sideways — robots.txt and sitemap health, a certificate about to
  // lapse, canonical chains across a two-hundred-page crawl — and until
  // now none of it reached the client, however serious.
  if (toolFindingsForReport.length > 0) {
    ensureSpace(doc, 80);
    doc.moveDown(0.8);
    drawSectionHeading(doc, L.foundByTools);
    doc
      .font("Helvetica")
      .fillColor(palette.mute)
      .fontSize(9)
      .text(
        L.foundByToolsHint,
      );
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor(palette.ink);
    for (const f of toolFindingsForReport) {
      ensureSpace(doc, 34);
      doc
        .font("Helvetica-Bold")
        .fillColor(sevColor[f.severity as keyof typeof sevColor] ?? palette.ink)
        .fontSize(9)
        .text(L.severity[f.severity as keyof typeof L.severity] ?? f.severity.toUpperCase(), { continued: true })
        .fillColor(palette.ink)
        .fontSize(10)
        .text(`  ${f.title}`);
      doc
        .font("Helvetica")
        .fillColor(palette.mute)
        .fontSize(9)
        .text(L.foundBy(f.toolId));
      doc.moveDown(0.35);
      doc.fontSize(10).fillColor(palette.ink);
    }
    doc.moveDown(0.8);
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
    drawSectionHeading(doc, L.workCompleted);
    if (doneTasks.length === 0) {
      doc
        .fillColor(palette.mute)
        .font("Helvetica")
        .fontSize(10)
        .text(L.noTasksDone);
    } else {
      doc.fillColor(palette.ink).font("Helvetica").fontSize(10);
      for (const t of doneTasks) {
        ensureSpace(doc, 30);
        doc.font("Helvetica-Bold").text(`• ${t.title}`);
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

    // === Links lost this period ===
    if (linksLostThisPeriod.length > 0) {
      drawSectionHeading(doc, L.linksLost);
      doc.fillColor(palette.ink).font("Helvetica").fontSize(10);
      const n = linksLostThisPeriod.length;
      doc
        .font("Helvetica-Bold")
        .text(L.linksLostCount(n));
      doc
        .font("Helvetica")
        .fillColor(palette.mute)
        .fontSize(9)
        .text(
          L.linksLostHint,
        );
      doc.moveDown(0.6);
      doc.fontSize(10).fillColor(palette.ink);
      for (const l of linksLostThisPeriod) {
        ensureSpace(doc, 28);
        doc.font("Helvetica-Bold").text(`• ${l.sourceDomain}`);
        const meta: string[] = [];
        if (l.anchorText) meta.push(L.anchor(l.anchorText));
        if (l.domainAuthority !== null && l.domainAuthority !== undefined)
          meta.push(`DA ${l.domainAuthority}`);
        if (l.lastSeen)
          meta.push(L.lastSeen(F.date(new Date(l.lastSeen))));
        if (meta.length > 0) {
          doc
            .font("Helvetica")
            .fillColor(palette.mute)
            .fontSize(9)
            .text(meta.join(" · "));
          doc.fontSize(10).fillColor(palette.ink);
        }
        doc.moveDown(0.35);
      }
      doc.moveDown(1.2);
    }

    // === Links built this period ===
    if (linksBuiltThisPeriod.length > 0) {
      drawSectionHeading(doc, L.linksBuilt);
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
        .text(L.linksPlaced(total));
      doc
        .font("Helvetica")
        .fillColor(palette.mute)
        .fontSize(9)
        .text(
          L.dofollowAvg(dofollow, avgDa),
        );
      doc.moveDown(0.6);
      doc.fontSize(10).fillColor(palette.ink);
      for (const l of linksBuiltThisPeriod) {
        ensureSpace(doc, 28);
        doc
          .font("Helvetica-Bold")
          .text(`• ${l.sourceDomain}${l.method ? ` (${l.method})` : ""}`);
        const meta: string[] = [];
        if (l.anchorText) meta.push(L.anchor(l.anchorText));
        if (l.domainAuthority !== null && l.domainAuthority !== undefined)
          meta.push(`DA ${l.domainAuthority}`);
        if (l.rel) meta.push(l.rel);
        if (l.placedAt)
          meta.push(F.date(new Date(l.placedAt)));
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
      drawSectionHeading(doc, L.hubLive);
      doc
        .fillColor(palette.ink)
        .font("Helvetica-Bold")
        .fontSize(10)
        .text(
          L.hubCount(submissionsLiveThisPeriod.length),
        );
      doc.moveDown(0.4);
      for (const s of submissionsLiveThisPeriod) {
        ensureSpace(doc, 22);
        doc.font("Helvetica").fontSize(10).text(`• ${s.domain ?? L.unknown}`);
        const meta: string[] = [];
        if (s.category) meta.push(s.category.replace(/-/g, " "));
        if (s.da !== null && s.da !== undefined) meta.push(`DA ${s.da}`);
        if (s.submittedAt)
          meta.push(F.date(new Date(s.submittedAt)));
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
      drawSectionHeading(doc, L.guestPosts);
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor(palette.ink)
        .text(
          L.guestCount(guestPostsPublishedThisPeriod.length),
        );
      doc.moveDown(0.4);
      for (const g of guestPostsPublishedThisPeriod) {
        ensureSpace(doc, 28);
        doc
          .font("Helvetica-Bold")
          .fontSize(10)
          .fillColor(palette.ink)
          .text(`• ${g.siteName} - ${g.topic}`);
        const meta: string[] = [];
        if (g.targetKeyword) meta.push(L.target(g.targetKeyword));
        if (g.publishedAt)
          meta.push(F.date(new Date(g.publishedAt)));
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
      drawSectionHeading(doc, L.rankMovement);
      const ups = rankMovements.filter((r) => r.delta > 0);
      const downs = rankMovements.filter((r) => r.delta < 0);
      doc
        .font("Helvetica")
        .fillColor(palette.mute)
        .fontSize(9)
        .text(
          L.rankSummary(ups.length, downs.length),
        );
      doc.moveDown(0.6);
      doc.fontSize(10).fillColor(palette.ink);
      for (const m of rankMovements.slice(0, 15)) {
        ensureSpace(doc, 18);
        // No arrows: Helvetica (WinAnsi) has none. Sign + colour instead.
        doc
          .font("Helvetica-Bold")
          .fillColor(m.delta > 0 ? palette.good : palette.bad)
          .text(m.delta > 0 ? "+ " : "- ", { continued: true })
          .fillColor(palette.ink)
          .text(m.query, { continued: true })
          .font("Helvetica")
          .fillColor(palette.mute)
          .text(
            L.rankRow(m.prior, m.current, F.signed(m.delta)),
          );
        doc.fillColor(palette.ink);
      }
      doc.moveDown(1);
    }

    // === Page changes (from page monitor) ===
    if (pageChangesForClient.length > 0) {
      drawSectionHeading(doc, L.pageChanges);
      doc.font("Helvetica").fontSize(10).fillColor(palette.ink);
      // Critical first: ten rows by date alone could leave out the one
      // change that took a page out of search.
      const rank = { critical: 0, warning: 1, info: 2 } as const;
      const ordered = [...pageChangesForClient].sort(
        (a, b) =>
          rank[a.severity ?? "info"] - rank[b.severity ?? "info"] ||
          b.detectedAt.getTime() - a.detectedAt.getTime(),
      );
      for (const c of ordered.slice(0, 10)) {
        ensureSpace(doc, 26);
        doc
          .font("Helvetica-Bold")
          .text(L.fieldChanged(c.field, c.severity === "critical"), { continued: true })
          .font("Helvetica")
          .fillColor(palette.mute)
          .fontSize(9)
          .text(
            L.changedOn(c.url ?? L.unknownUrl, F.date(c.detectedAt)),
          );
        doc.fontSize(10).fillColor(palette.ink);
      }
      doc.moveDown(1);
    }

    // === AI suggestions applied ===
    if (suggestionsApplied.length > 0) {
      drawSectionHeading(doc, L.aiApplied);
      doc
        .font("Helvetica")
        .fillColor(palette.mute)
        .fontSize(9)
        .text(L.aiAppliedCount(suggestionsApplied.length));
      doc.moveDown(0.6);
      doc.fontSize(10).fillColor(palette.ink);
      for (const s of suggestionsApplied.slice(0, 12)) {
        ensureSpace(doc, 24);
        doc
          .font("Helvetica-Bold")
          .text(`• ${issueTitle(s.type)}`);
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
    drawSectionHeading(doc, L.recommendations);
    if (openTasks.length === 0) {
      doc
        .fillColor(palette.mute)
        .font("Helvetica")
        .fontSize(10)
        .text(L.noRecommendations);
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
          .text(L.priority[p]);
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
    drawSectionHeading(doc, L.techStack);
    doc
      .fillColor(palette.ink)
      .font("Helvetica")
      .fontSize(10)
      .text(
        client.techStack && client.techStack.length > 0
          ? client.techStack.join(", ")
          : L.notDetected,
      );

    doc.moveDown(1.5);
    drawSectionHeading(doc, L.covers);
    doc
      .fillColor(palette.mute)
      .font("Helvetica")
      .fontSize(10)
      .text(
        L.coversTechnical,
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
    ? L.footerBrand(brand.name, F.dateTime(today))
    : L.footerLocal(F.dateTime(today));
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
  // Helvetica (WinAnsi) has no arrows; the colour carries the direction.
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

  const valueText = L.fromTo(F.num(prior), F.num(current));
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
      ? ` (${F.pct(Math.round((delta / prior) * 100))})`
      : "";
  doc
    .fontSize(9)
    .fillColor(arrowColor)
    .text(`${F.signed(delta)}${deltaPct}`, {
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
    .text(L.colQuery, cols.query, headerY, { characterSpacing: 1 })
    .text(L.colClicks, cols.clicks, headerY, { width: 60, align: "right" })
    .text(L.colImpr, cols.impr, headerY, { width: 50, align: "right" })
    .text(L.colCtr, cols.ctr, headerY, { width: 50, align: "right" })
    .text(L.colPos, cols.pos, headerY, { width: 30, align: "right" });
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
      .text(F.num(r.clicks), cols.clicks, y, {
        width: 60,
        align: "right",
      })
      .text(F.num(r.impressions), cols.impr, y, {
        width: 50,
        align: "right",
      })
      .text(`${F.dec(r.ctr * 100)}%`, cols.ctr, y, {
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
      .text(F.dec(r.position), cols.pos, y, {
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
  opts?: { dates?: Date[]; updates?: readonly AlgoUpdate[] },
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
      // The caller loads the list — it is Google's record plus the daily
      // refresh, which lives in the database — because this draw is sync.
      for (const u of opts.updates ?? []) {
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
    const extraCount = annotations.length > 3 ? annotations.length - 3 : 0;
    doc
      .fillColor(palette.mute)
      .font("Helvetica-Oblique")
      .fontSize(8)
      .text(L.googleUpdates(labels, extraCount), left, doc.y, {
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
    .text(L.healthScore, left + 16, top + 14, { characterSpacing: 1 });

  doc
    .fillColor(scoreColor(score))
    .font("Helvetica-Bold")
    .fontSize(40)
    .text(score === null ? "—" : String(score), left + 16, top + 28);

  doc
    .fillColor(palette.mute)
    .font("Helvetica")
    .fontSize(10)
    .text(L.of100, left + 16, top + 70);

  if (prev !== null && score !== null) {
    const delta = score - prev;
    const tone = delta > 0 ? palette.good : delta < 0 ? palette.bad : palette.mute;
    doc
      .fillColor(tone)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(
        L.vsLastAudit(F.signed(delta)),
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
    .text(L.coverScoreLabel, 0, centerY + 100, {
      width: W,
      align: "center",
      characterSpacing: 1,
    })
    .fillOpacity(1);

  // Delta vs previous
  if (score !== null && opts.previousScore !== null) {
    const delta = score - opts.previousScore;
    doc
      .font("Helvetica-Bold")
      .fillColor("#ffffff")
      .fillOpacity(0.9)
      .fontSize(14)
      .text(
        L.coverDelta(F.signed(delta), opts.previousScore),
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
    .text(L.preparedFor, padX, bottomY, { characterSpacing: 2 })
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
  const periodLabel = F.monthYear(new Date());
  doc
    .font("Helvetica")
    .fillColor("#ffffff")
    .fillOpacity(0.6)
    .fontSize(9)
    .text(L.reportPeriod, W - padX - 200, bottomY, {
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
      .text(L.preparedBy(opts.brandName), padX, H - padY - 10, {
        characterSpacing: 1,
      })
      .fillOpacity(1);
  }

  doc.restore();
}
