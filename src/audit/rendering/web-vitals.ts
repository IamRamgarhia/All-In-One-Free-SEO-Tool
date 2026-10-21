import type { CoreWebVitals } from "@/audit/rendering/playwright-renderer";

export type CwvVerdict = "good" | "needs-improvement" | "poor" | "unmeasured";

const THRESHOLDS = {
  lcp: { good: 2500, poor: 4000 },
  cls: { good: 0.1, poor: 0.25 },
  fcp: { good: 1800, poor: 3000 },
  ttfb: { good: 800, poor: 1800 },
  inp: { good: 200, poor: 500 },
} as const;

export function verdictFor(
  metric: keyof typeof THRESHOLDS,
  value: number | undefined,
): CwvVerdict {
  if (value == null || Number.isNaN(value)) return "unmeasured";
  const t = THRESHOLDS[metric];
  if (value <= t.good) return "good";
  if (value <= t.poor) return "needs-improvement";
  return "poor";
}

export function formatCwv(cwv: CoreWebVitals): Record<string, string> {
  return {
    lcp: cwv.lcp != null ? `${(cwv.lcp / 1000).toFixed(2)}s` : "—",
    cls: cwv.cls != null ? cwv.cls.toFixed(3) : "—",
    fcp: cwv.fcp != null ? `${(cwv.fcp / 1000).toFixed(2)}s` : "—",
    ttfb: cwv.ttfb != null ? `${Math.round(cwv.ttfb)}ms` : "—",
    inp: cwv.inp != null ? `${Math.round(cwv.inp)}ms` : "—",
  };
}

export { THRESHOLDS };
