import { randomUUID } from "node:crypto";
import { dataVersion, thresholds, tierFor, weights } from "@/lib/geo-audit/data";
import { crawlGeoSite } from "@/lib/geo-audit/crawl";
import { fetchLlmsTxt } from "@/lib/geo-audit/llms";
import { marksItsArticles } from "@/lib/geo-audit/scoring/articles";
import { scoreCitability } from "@/lib/geo-audit/scoring/citability";
import { advisorySignals, scoreContent } from "@/lib/geo-audit/scoring/content";
import {
  aggregate,
  applyImpact,
  composite,
  findingToDict,
  findingsFor,
  markPageLevel,
  mergeFindings,
  prioritize,
  signalRatio,
  signalToDict,
  weightedComposite,
  type Finding,
  type Signal,
} from "@/lib/geo-audit/scoring/model";
import { scorePlatform, type SiteFacts } from "@/lib/geo-audit/scoring/platform";
import { scoreSchema } from "@/lib/geo-audit/scoring/schema-org";
import { scoreTechnical, type GeoPage } from "@/lib/geo-audit/scoring/technical";

const SITE_CATEGORIES = [
  "citability",
  "technical",
  "schema",
  "content",
  "platform",
] as const;

export type GeoAuditFinding = {
  id: string;
  severity: string;
  title: string;
  remediation: string;
  pages: string[];
};

export type GeoSiteAuditResult = {
  composite: number;
  categoryScores: Record<string, number>;
  findings: GeoAuditFinding[];
  envelope: Record<string, unknown>;
};

function scorePage(
  page: GeoPage,
  robots: GeoCrawlResultRobots,
  siteFacts: SiteFacts,
  siteMarksArticles: boolean,
): Record<string, Signal[]> {
  const scored: Record<string, Signal[]> = {};
  if (page.doc) {
    scored.citability = scoreCitability(page.doc, {
      renderedChars: null,
      siteMarksArticles,
    });
    scored.schema = scoreSchema(page, siteMarksArticles);
    scored.content = scoreContent(page, { siteMarksArticles });
  }
  scored.technical = scoreTechnical(page, robots);
  scored.platform = scorePlatform(page, siteFacts);
  return scored;
}

type GeoCrawlResultRobots = Awaited<ReturnType<typeof crawlGeoSite>>["robots"];

function buildSiteFacts(
  robots: GeoCrawlResultRobots,
  pages: GeoPage[],
  llms: { present: boolean; valid: boolean | null },
): SiteFacts {
  const languages = new Set<string>();
  for (const page of pages) {
    if (page.doc?.lang) languages.add(page.doc.lang);
  }
  return {
    sitemaps: robots?.sitemaps ?? [],
    languages,
    llmsPresent: llms.present,
    llmsValid: llms.valid,
  };
}

function classifySnapshot(
  snapshot: {
    pages: string[];
    ratios: Record<string, Array<number | null>>;
  },
  rules: { no_finding_above: number; full_severity_below: number },
) {
  const offenders: Record<string, string[]> = {};
  const severe: Record<string, string[]> = {};
  for (const [signalId, ratios] of Object.entries(snapshot.ratios)) {
    for (let i = 0; i < snapshot.pages.length; i++) {
      const ratio = ratios[i];
      const url = snapshot.pages[i]!;
      if (ratio === null || ratio === undefined) continue;
      if (ratio <= rules.no_finding_above) {
        offenders[signalId] ??= [];
        offenders[signalId]!.push(url);
      }
      if (ratio < rules.full_severity_below) {
        severe[signalId] ??= [];
        severe[signalId]!.push(url);
      }
    }
  }
  return { offenders, severe };
}

function forcedSignal(signal: Signal): Signal {
  return { ...signal, value: 0 };
}

function assemble(params: {
  startUrl: string;
  siteHost: string;
  perCategory: Record<string, Signal[][]>;
  pageFindings: Finding[];
  snapshot: { pages: string[]; ratios: Record<string, Array<number | null>> };
  pagesOk: number;
}): {
  categoryScores: Record<string, number>;
  composite: number;
  findings: Finding[];
  allSignals: Signal[];
  envelopeScores: Record<string, unknown>;
  completeness: Record<string, unknown>;
} {
  const w = weights();
  const categoryWeights = Object.fromEntries(
    SITE_CATEGORIES.map((c) => [c, w[c]!.weight]),
  );
  const categoryScores: Record<string, number> = {};
  const categoryCompleteness: Record<string, Record<string, unknown>> = {};
  const allSignals: Signal[] = [];
  const findings: Finding[] = [...params.pageFindings];

  const rules = thresholds("findings") as {
    no_finding_above: number;
    full_severity_below: number;
  };
  const { offenders, severe } = classifySnapshot(params.snapshot, rules);

  for (const name of SITE_CATEGORIES) {
    const pages = params.perCategory[name] ?? [];
    if (!pages.length) continue;
    const rolled = aggregate(pages);
    const [score, completeness] = composite(rolled);
    categoryScores[name] = score;
    categoryCompleteness[name] = completeness;
    allSignals.push(...rolled);

    const reported = new Set<string>();
    for (const finding of findingsFor(rolled, params.siteHost)) {
      finding.pages = [...new Set(offenders[finding.id] ?? [])].sort();
      reported.add(finding.id);
      findings.push(finding);
    }

    for (const signal of rolled) {
      if (reported.has(signal.id)) continue;
      const ratio = signalRatio(signal);
      if (ratio === null) continue;
      const pagesList = [...new Set(severe[signal.id] ?? [])].sort();
      if (!pagesList.length) continue;
      for (const finding of findingsFor([forcedSignal(signal)], params.siteHost)) {
        markPageLevel(finding);
        finding.pages = pagesList;
        finding.pointsLost = signal.max - (signal.value ?? 0);
        findings.push(finding);
      }
    }
  }

  const [compositeScore, coverage] = weightedComposite(categoryWeights, categoryScores);
  const tier = tierFor(compositeScore);

  const signalCounts = Object.values(categoryCompleteness).map((c) => c.computed as number);
  const signalTotals = Object.values(categoryCompleteness).map((c) => c.total as number);
  const completeness = {
    computed: signalCounts.reduce((a, b) => a + b, 0),
    total: signalTotals.reduce((a, b) => a + b, 0),
    missing: [
      ...Object.values(categoryCompleteness).flatMap((c) => (c.missing as string[]) ?? []),
    ].sort(),
    categories: coverage,
  };

  const tierMeaning =
    params.pagesOk > 1
      ? tier.meaning
          .replace("from this page", "from these pages")
          .replace("on the page", "on these pages")
      : tier.meaning;

  allSignals.push(...advisorySignals());

  const ranked = prioritize(
    applyImpact(mergeFindings(findings), allSignals, categoryWeights),
  );

  return {
    categoryScores,
    composite: compositeScore,
    findings: ranked,
    allSignals,
    envelopeScores: {
      composite: compositeScore,
      tier: tier.label,
      tier_meaning: tierMeaning,
      categories: categoryScores,
    },
    completeness,
  };
}

export async function runGeoSiteAudit(
  url: string,
  options: {
    mode: "quick" | "full";
    maxPages: number;
    signal?: AbortSignal;
  },
): Promise<GeoSiteAuditResult> {
  const maxPages =
    options.mode === "quick" ? Math.min(options.maxPages, 1) : options.maxPages;

  const crawl = await crawlGeoSite(url, {
    maxPages: options.mode === "quick" ? 1 : maxPages,
    signal: options.signal,
  });

  let origin: string;
  try {
    const u = new URL(crawl.startUrl);
    origin = `${u.protocol}//${u.host}`;
  } catch {
    origin = url;
  }

  const llms = await fetchLlmsTxt(origin, options.signal);
  const siteFacts = buildSiteFacts(crawl.robots, crawl.pages, llms);
  const docs = crawl.pages.map((p) => p.doc).filter(Boolean);
  const siteMarksArticles = marksItsArticles(docs as NonNullable<(typeof docs)[number]>[]);

  const perCategory: Record<string, Signal[][]> = Object.fromEntries(
    SITE_CATEGORIES.map((c) => [c, []]),
  );
  const pageFindings: Finding[] = [];
  const snapshot: {
    pages: string[];
    ratios: Record<string, Array<number | null>>;
  } = { pages: [], ratios: {} };

  for (const page of crawl.pages) {
    const scored = scorePage(page, crawl.robots, siteFacts, siteMarksArticles);
    const pageUrl = page.result?.finalUrl ?? page.url;
    const index = snapshot.pages.length;
    snapshot.pages.push(pageUrl);

    for (const [name, signals] of Object.entries(scored)) {
      if (!page.doc && name !== "technical") continue;
      for (const signal of signals) {
        const ratio = signalRatio(signal);
        if (ratio !== null) {
          if (!snapshot.ratios[signal.id]) {
            snapshot.ratios[signal.id] = [];
          }
          while (snapshot.ratios[signal.id]!.length < index) {
            snapshot.ratios[signal.id]!.push(null);
          }
          snapshot.ratios[signal.id]![index] = ratio;
        }
      }
      perCategory[name]?.push(signals);
    }
  }

  for (const [signalId, byPage] of Object.entries(snapshot.ratios)) {
    while (byPage.length < snapshot.pages.length) {
      byPage.push(null);
    }
    snapshot.ratios[signalId] = byPage;
  }

  let siteHost: string;
  try {
    siteHost = new URL(url).host;
  } catch {
    siteHost = url;
  }

  const pagesOk = crawl.pages.filter((p) => p.doc).length;
  const assembled = assemble({
    startUrl: url,
    siteHost,
    perCategory,
    pageFindings,
    snapshot,
    pagesOk,
  });

  const runId = randomUUID();
  const observedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const envelope: Record<string, unknown> = {
    schema_version: "1.2",
    command: "audit",
    ok: true,
    data_version: dataVersion(),
    run_id: runId,
    observed_at: observedAt,
    completeness: assembled.completeness,
    scores: assembled.envelopeScores,
    signals: assembled.allSignals.map(signalToDict),
    findings: assembled.findings.map(findingToDict),
    crawl: {
      start_url: url,
      site: siteHost,
      pages_crawled: crawl.pages.length,
      pages_ok: pagesOk,
      mode: options.mode,
      max_pages: maxPages,
    },
  };

  return {
    composite: assembled.composite,
    categoryScores: assembled.categoryScores,
    findings: assembled.findings.map((f) => ({
      id: f.id,
      severity: f.severity,
      title: f.title,
      remediation: f.remediation,
      pages: f.pages,
    })),
    envelope,
  };
}
