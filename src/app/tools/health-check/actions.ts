"use server";

import { runAudit } from "@/lib/audit";
import { checkRobots } from "@/app/tools/robots/actions";
import { checkHreflang } from "@/app/tools/hreflang/actions";
import { checkSecurity } from "@/app/tools/security/actions";
import { scanCwv } from "@/lib/pagespeed";
import { auditImages } from "@/lib/image-audit";
import { fetchSiteMetadata } from "@/lib/site-metadata";
import { saveSnapshot } from "@/lib/snapshots";
import { inspectHeaders } from "@/app/tools/headers/actions";

/**
 * One omnibus SEO health check — runs every checker we have in parallel
 * for the same URL, aggregates everything into one verdict + a structured
 * findings list. The user clicks once and gets the same data 6 separate
 * single-purpose tools would have produced.
 */

export type HealthFinding = {
  category: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  type: string;
  message: string;
  url?: string;
};

export type HealthSummary = {
  score: number; // 0-100
  performanceScore: number | null;
  totalFindings: number;
  byCategory: Record<string, number>;
  bySeverity: Record<HealthFinding["severity"], number>;
};

export type HealthResult =
  | {
      ok: true;
      url: string;
      finalUrl: string;
      summary: HealthSummary;
      findings: HealthFinding[];
      brand: {
        name: string | null;
        description: string | null;
        logoUrl: string | null;
      };
      raw: {
        cwv: Awaited<ReturnType<typeof scanCwv>> | null;
        robots: Awaited<ReturnType<typeof checkRobots>> | null;
        hreflang: Awaited<ReturnType<typeof checkHreflang>> | null;
        security: Awaited<ReturnType<typeof checkSecurity>> | null;
        image: Awaited<ReturnType<typeof auditImages>> | null;
        headers: Awaited<ReturnType<typeof inspectHeaders>> | null;
      };
    }
  | { ok: false; error: string };

const sevWeight: Record<HealthFinding["severity"], number> = {
  critical: 12,
  high: 6,
  medium: 3,
  low: 1,
  info: 0,
};

export async function runHealthCheck(rawUrl: string): Promise<HealthResult> {
  if (!rawUrl?.trim()) return { ok: false, error: "URL required" };
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

  // All checks fire in parallel; each is best-effort
  const [meta, audit, robots, hreflang, security, cwv, image, headers] =
    await Promise.all([
      fetchSiteMetadata(url).catch(() => null),
      runAudit(url, { maxPages: 1, maxDepth: 0 }).catch(() => null),
      checkRobots(url).catch(() => null),
      checkHreflang(url).catch(() => null),
      checkSecurity(url).catch(() => null),
      scanCwv({ url, strategy: "mobile" }).catch(() => null),
      auditImages(url).catch(() => null),
      inspectHeaders(url).catch(() => null),
    ]);

  if (!meta || !meta.reachable) {
    return { ok: false, error: "Couldn't reach the site." };
  }

  const findings: HealthFinding[] = [];

  // === On-page audit ===
  if (audit && audit.findings) {
    for (const f of audit.findings) {
      findings.push({
        category: "On-page",
        severity: (f.severity as HealthFinding["severity"]) ?? "medium",
        type: f.type,
        message: f.message,
        url: f.url,
      });
    }
  }

  // === Robots / sitemap ===
  if (robots && robots.ok) {
    for (const issue of robots.issues) {
      findings.push({
        category: "Indexability",
        severity: /entire site/i.test(issue) ? "critical" : "medium",
        type: "robots_or_sitemap",
        message: issue,
      });
    }
  }

  // === Hreflang ===
  if (hreflang && hreflang.ok && hreflang.entries.length > 0) {
    for (const issue of hreflang.issues) {
      findings.push({
        category: "International",
        severity: "medium",
        type: "hreflang",
        message: issue,
      });
    }
  }

  // === Security headers ===
  if (security && security.ok) {
    for (const h of security.headers) {
      if (!h.good) {
        findings.push({
          category: "Security",
          severity: "low",
          type: `missing_${h.name}`,
          message: `${h.name} ${h.value ? "weak" : "missing"} — ${h.hint ?? ""}`,
        });
      }
    }
    if (security.observatory && (security.observatory.score ?? 0) < 50) {
      findings.push({
        category: "Security",
        severity: "medium",
        type: "observatory_low",
        message: `Mozilla Observatory grade ${security.observatory.grade ?? "?"} (${security.observatory.score ?? 0}/100). Multiple security headers need attention.`,
      });
    }
    if (security.ssl && security.ssl.grade && /^[CDFE]/.test(security.ssl.grade)) {
      findings.push({
        category: "Security",
        severity: "high",
        type: "ssl_low",
        message: `SSL Labs grade ${security.ssl.grade}. Renew or upgrade your TLS configuration.`,
      });
    }
  }

  // === Core Web Vitals ===
  let performanceScore: number | null = null;
  if (cwv && cwv.ok) {
    performanceScore = cwv.performance;
    if (typeof cwv.performance === "number" && cwv.performance < 50) {
      findings.push({
        category: "Performance",
        severity: "high",
        type: "low_performance",
        message: `PageSpeed performance score ${cwv.performance}/100 — below 50 indicates serious issues.`,
      });
    }
    if (typeof cwv.lcpMs === "number" && cwv.lcpMs > 4000) {
      findings.push({
        category: "Performance",
        severity: "high",
        type: "lcp_poor",
        message: `LCP ${(cwv.lcpMs / 1000).toFixed(1)}s — Google's "poor" threshold is >4s. Identify the LCP element and fix it.`,
      });
    }
    if (typeof cwv.cls === "number" && cwv.cls > 25) {
      findings.push({
        category: "Performance",
        severity: "medium",
        type: "cls_poor",
        message: `CLS ${(cwv.cls / 100).toFixed(2)} — layout shift exceeds Google's "poor" threshold of 0.25.`,
      });
    }
    for (const opp of cwv.opportunities ?? []) {
      if ((opp.savingsMs ?? 0) >= 500) {
        findings.push({
          category: "Performance",
          severity: "low",
          type: opp.id,
          message: `${opp.title} — could save ~${Math.round((opp.savingsMs ?? 0) / 100) / 10}s.`,
        });
      }
    }
  }

  // === Image audit ===
  if (image && image.ok && image.images.length > 0) {
    const noAlt = image.images.filter((i) => i.issues.includes("missing_alt"));
    const oversize = image.images.filter((i) => i.issues.includes("oversize"));
    const noDims = image.images.filter((i) =>
      i.issues.includes("no_dimensions"),
    );
    if (noAlt.length > 0) {
      findings.push({
        category: "Images",
        severity: "medium",
        type: "missing_alt",
        message: `${noAlt.length} image${noAlt.length === 1 ? "" : "s"} missing alt text.`,
      });
    }
    if (oversize.length > 0) {
      findings.push({
        category: "Images",
        severity: "medium",
        type: "oversize_images",
        message: `${oversize.length} image${oversize.length === 1 ? "" : "s"} > 200KB. Compress or convert to WebP.`,
      });
    }
    if (noDims.length > 0) {
      findings.push({
        category: "Images",
        severity: "low",
        type: "no_dimensions",
        message: `${noDims.length} image${noDims.length === 1 ? "" : "s"} missing width/height — causes CLS.`,
      });
    }
  }

  // === Redirects ===
  if (headers && headers.ok && headers.totalHops > 1) {
    findings.push({
      category: "On-page",
      severity: headers.totalHops > 2 ? "medium" : "low",
      type: "redirect_chain",
      message: `${headers.totalHops} hops to reach the final URL. More than 2 wastes crawl budget + slows the page.`,
    });
  }

  // === Aggregate ===
  const byCategory: Record<string, number> = {};
  const bySeverity: Record<HealthFinding["severity"], number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  let deductions = 0;
  for (const f of findings) {
    byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
    bySeverity[f.severity] += 1;
    deductions += sevWeight[f.severity];
  }
  const score = Math.max(0, Math.min(100, 100 - deductions));

  const summary: HealthSummary = {
    score,
    performanceScore,
    totalFindings: findings.length,
    byCategory,
    bySeverity,
  };

  return {
    ok: true,
    url,
    finalUrl: meta.url,
    summary,
    findings,
    brand: {
      name: meta.name,
      description: meta.description,
      logoUrl: meta.logoUrl,
    },
    raw: { cwv, robots, hreflang, security, image, headers },
  };
}

export async function saveHealthSnapshot(opts: {
  url: string;
  result: HealthResult;
  note?: string;
}): Promise<{ ok: true; id: number }> {
  if (!opts.result.ok) {
    return Promise.reject(new Error("Can't save a failed health check"));
  }
  return saveSnapshot({
    clientId: null,
    kind: "cwv",
    label: opts.url,
    note: opts.note ?? "Health check",
    data: opts.result,
    primaryMetric: opts.result.summary.score,
    primaryMetricLabel: "health",
  });
}
