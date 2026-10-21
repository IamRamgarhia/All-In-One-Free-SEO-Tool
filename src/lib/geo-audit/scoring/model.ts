import { load, thresholds } from "@/lib/geo-audit/data";

export const DETERMINISTIC = "deterministic";
export const HEURISTIC = "heuristic";
export const LIVE = "live";
export const ADVISORY = "advisory";

export const SCORED_CLASSES = new Set([DETERMINISTIC, HEURISTIC, LIVE]);

export const NOT_APPLICABLE = "not applicable";

const SEVERITY_ORDER = ["critical", "high", "medium", "low"] as const;
export const PAGE_LEVEL_CEILING = "medium";
export const PROMOTION_CEILING = "high";

export type Signal = {
  id: string;
  cls: string;
  max: number;
  value: number | null;
  detail: Record<string, unknown>;
  page?: string | null;
  skippedReason?: string | null;
};

export type Finding = {
  id: string;
  severity: string;
  effort: string;
  title: string;
  remediation: string;
  pages: string[];
  excerpt?: string | null;
  pointsLost: number;
  impact?: number | null;
  pageLevel?: boolean;
  priority?: number;
};

export function signalComputed(signal: Signal): boolean {
  return signal.value !== null;
}

export function signalApplicable(signal: Signal): boolean {
  return !(signal.skippedReason ?? "").startsWith(NOT_APPLICABLE);
}

export function signalRatio(signal: Signal): number | null {
  if (signal.value === null || signal.max === 0) return null;
  return signal.value / signal.max;
}

export function signalToDict(signal: Signal): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: signal.id,
    class: signal.cls,
    value: signal.value === null ? null : Math.round(signal.value * 100) / 100,
    max: signal.max,
    page: signal.page ?? null,
    detail: signal.detail,
  };
  if (signal.skippedReason) out.skipped_reason = signal.skippedReason;
  return out;
}

export function findingToDict(finding: Finding): Record<string, unknown> {
  return {
    id: finding.id,
    severity: finding.severity,
    effort: finding.effort,
    priority: finding.priority ?? 0,
    points_lost: Math.round(finding.pointsLost * 100) / 100,
    impact: finding.impact === null || finding.impact === undefined ? null : Math.round(finding.impact * 100) / 100,
    page_level: finding.pageLevel ?? false,
    pages: finding.pages,
    title: finding.title,
    remediation: finding.remediation,
    excerpt: finding.excerpt ?? null,
  };
}

export function demote(severity: string): string {
  const index = SEVERITY_ORDER.indexOf(severity as (typeof SEVERITY_ORDER)[number]);
  const i = index >= 0 ? index : SEVERITY_ORDER.length - 1;
  return SEVERITY_ORDER[Math.min(i + 1, SEVERITY_ORDER.length - 1)]!;
}

export function promote(severity: string): string {
  const index = SEVERITY_ORDER.indexOf(severity as (typeof SEVERITY_ORDER)[number]);
  const ceiling = SEVERITY_ORDER.indexOf(PROMOTION_CEILING);
  const i = index >= 0 ? index : SEVERITY_ORDER.length - 1;
  return SEVERITY_ORDER[Math.min(i, Math.max(i - 1, ceiling))]!;
}

export function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function ramp(value: number, floor: number, good: number): number {
  if (good <= floor) return value >= good ? 1 : 0;
  return clamp01((value - floor) / (good - floor));
}

export function composite(signals: Signal[]): [number, Record<string, unknown>] {
  const scored = signals.filter((s) => SCORED_CLASSES.has(s.cls) && signalApplicable(s));
  const computed = scored.filter((s) => signalComputed(s));
  const available = computed.reduce((sum, s) => sum + s.max, 0);
  const earned = computed.reduce((sum, s) => sum + (s.value ?? 0), 0);
  const score = available ? Math.round((earned / available) * 100) : 0;
  return [
    score,
    {
      computed: computed.length,
      total: scored.length,
      missing: scored.filter((s) => !signalComputed(s)).map((s) => s.id).sort(),
    },
  ];
}

function suppressedByCause(signals: Signal[]): Set<string> {
  const declared = (load("findings").consequences ?? {}) as Record<
    string,
    { floor?: number; suppresses?: string[] }
  >;
  const values = Object.fromEntries(signals.map((s) => [s.id, s.value]));
  const suppressed = new Set<string>();
  for (const [cause, rule] of Object.entries(declared)) {
    if (!rule || typeof rule !== "object") continue;
    const value = values[cause];
    if (value !== null && value !== undefined && value <= (rule.floor ?? 0)) {
      for (const id of rule.suppresses ?? []) suppressed.add(id);
    }
  }
  return suppressed;
}

export function findingsFor(signals: Signal[], page: string): Finding[] {
  const rules = thresholds("findings") as {
    no_finding_above: number;
    full_severity_below: number;
  };
  const suppressed = suppressedByCause(signals);
  const signalsMap = (load("findings").signals ?? {}) as Record<
    string,
    {
      severity: string;
      effort: string;
      title: string;
      remediation: string;
      partial?: { when_present: string[]; title: string; remediation: string };
    }
  >;
  const out: Finding[] = [];

  for (const signal of signals) {
    if (suppressed.has(signal.id)) continue;
    const ratio = signalRatio(signal);
    if (ratio === null || ratio > rules.no_finding_above) continue;
    const template = signalsMap[signal.id];
    if (!template) continue;
    let severity =
      ratio < rules.full_severity_below
        ? template.severity
        : demote(template.severity);
    let wording = template;
    const partial = template.partial;
    const present = signal.detail.present;
    if (
      partial &&
      Array.isArray(present) &&
      partial.when_present.some((p) => (present as string[]).includes(p))
    ) {
      wording = { ...template, title: partial.title, remediation: partial.remediation };
    }
    out.push({
      id: signal.id,
      severity,
      effort: template.effort,
      title: wording.title,
      remediation: wording.remediation,
      pages: [page],
      excerpt: (signal.detail.worst_example as string | undefined) ?? null,
      pointsLost: signal.max - (signal.value ?? 0),
    });
  }
  return out;
}

function encodesTo(value: unknown, encoded: string): boolean {
  try {
    return JSON.stringify(value) === encoded;
  } catch {
    return false;
  }
}

function sharedDetail(signals: Signal[]): Record<string, unknown> {
  if (!signals.length) return {};
  const reserved = new Set([
    "pages_measured",
    "pages_total",
    "mean",
    "min",
    "max",
    "worst_page",
  ]);
  const first = signals[0]!.detail;
  const shared: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(first)) {
    if (reserved.has(key)) continue;
    let encoded: string;
    try {
      encoded = JSON.stringify(value);
    } catch {
      continue;
    }
    if (
      signals.slice(1).every(
        (s) => key in s.detail && encodesTo(s.detail[key], encoded),
      )
    ) {
      shared[key] = value;
    }
  }
  return shared;
}

function typicalPresent(signals: Signal[]): string[] | null {
  const counts = new Map<string, number>();
  const values = new Map<string, string[]>();
  for (const signal of signals) {
    const present = signal.detail.present;
    if (!Array.isArray(present)) continue;
    const key = JSON.stringify(present);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    values.set(key, present as string[]);
  }
  if (!counts.size) return null;
  let bestKey = "";
  let best = 0;
  for (const [key, count] of counts) {
    if (count > best) {
      best = count;
      bestKey = key;
    }
  }
  return values.get(bestKey) ?? null;
}

export function aggregate(perPage: Signal[][]): Signal[] {
  const order: string[] = [];
  const grouped = new Map<string, Signal[]>();
  for (const signals of perPage) {
    for (const signal of signals) {
      if (!grouped.has(signal.id)) {
        grouped.set(signal.id, []);
        order.push(signal.id);
      }
      grouped.get(signal.id)!.push(signal);
    }
  }

  const out: Signal[] = [];
  for (const signalId of order) {
    const group = grouped.get(signalId)!;
    const first = group[0]!;
    const computed = group.filter((s) => signalComputed(s));
    if (!computed.length) {
      const unmeasured = group.filter((s) => signalApplicable(s));
      const src = unmeasured[0] ?? first;
      const reason =
        src.skippedReason ?? "not measured on any page";
      out.push({
        id: signalId,
        cls: first.cls,
        max: first.max,
        value: null,
        detail: { reason },
        skippedReason: reason,
      });
      continue;
    }

    const values = computed.map((s) => s.value ?? 0);
    const worst = computed.reduce((a, b) =>
      (a.value ?? 0) <= (b.value ?? 0) ? a : b,
    );
    const detail: Record<string, unknown> = {
      pages_measured: computed.length,
      pages_total: group.length,
      mean: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100,
      min: Math.round(Math.min(...values) * 100) / 100,
      max: Math.round(Math.max(...values) * 100) / 100,
      worst_page: worst.page,
      ...sharedDetail(computed),
    };
    const typical = typicalPresent(computed);
    if (typical !== null && !("present" in detail)) {
      detail.present = typical;
    }
    if (worst.detail.worst_example) {
      detail.worst_example = worst.detail.worst_example;
    }
    out.push({
      id: signalId,
      cls: first.cls,
      max: first.max,
      value: values.reduce((a, b) => a + b, 0) / values.length,
      detail,
    });
  }
  return out;
}

export function weightedComposite(
  categories: Record<string, number>,
  scores: Record<string, number | null | undefined>,
): [number, Record<string, unknown>] {
  const computed: Record<string, number> = {};
  for (const [name, value] of Object.entries(scores)) {
    if (value !== null && value !== undefined) computed[name] = value;
  }
  const totalWeight = Object.keys(computed)
    .filter((name) => name in categories)
    .reduce((sum, name) => sum + categories[name]!, 0);
  if (!totalWeight) {
    return [
      0,
      {
        computed: [],
        declared: Object.keys(categories).sort(),
        missing: Object.keys(categories).sort(),
      },
    ];
  }
  const earned = Object.entries(computed)
    .filter(([name]) => name in categories)
    .reduce((sum, [name, value]) => sum + categories[name]! * value, 0);
  return [
    Math.round(earned / totalWeight),
    {
      computed: Object.keys(computed).sort(),
      declared: Object.keys(categories).sort(),
      missing: Object.keys(categories)
        .filter((n) => !(n in computed))
        .sort(),
      weights_used: Object.fromEntries(
        Object.keys(computed)
          .filter((n) => n in categories)
          .sort()
          .map((n) => [n, categories[n]!]),
      ),
    },
  ];
}

export function mergeFindings(findings: Finding[]): Finding[] {
  const merged = new Map<string, Finding>();
  for (const finding of findings) {
    const existing = merged.get(finding.id);
    if (!existing) {
      merged.set(finding.id, {
        ...finding,
        pages: [...finding.pages],
      });
      continue;
    }
    for (const page of finding.pages) {
      if (!existing.pages.includes(page)) existing.pages.push(page);
    }
    existing.pointsLost = Math.max(existing.pointsLost, finding.pointsLost);
    if (finding.impact != null) {
      existing.impact = Math.max(existing.impact ?? 0, finding.impact);
    }
    const fi = SEVERITY_ORDER.indexOf(finding.severity as (typeof SEVERITY_ORDER)[number]);
    const ei = SEVERITY_ORDER.indexOf(existing.severity as (typeof SEVERITY_ORDER)[number]);
    if (fi >= 0 && ei >= 0 && fi < ei) existing.severity = finding.severity;
    existing.excerpt = existing.excerpt ?? finding.excerpt;
  }
  for (const f of merged.values()) {
    f.pages.sort();
  }
  return [...merged.values()];
}

export function applyImpact(
  findings: Finding[],
  signals: Signal[],
  categoryWeights: Record<string, number>,
): Finding[] {
  const available: Record<string, number> = {};
  for (const signal of signals) {
    if (!signalComputed(signal) || !SCORED_CLASSES.has(signal.cls)) continue;
    const category = signal.id.split(".", 1)[0]!;
    available[category] = (available[category] ?? 0) + signal.max;
  }
  for (const finding of findings) {
    const category = finding.id.split(".", 1)[0]!;
    const weight = categoryWeights[category];
    const total = available[category];
    if (weight && total) {
      finding.impact = (finding.pointsLost / total) * weight;
    }
  }
  return findings;
}

export function markPageLevel(finding: Finding): Finding {
  finding.pageLevel = true;
  finding.severity = demote(finding.severity);
  const ceiling = SEVERITY_ORDER.indexOf(PAGE_LEVEL_CEILING);
  const idx = SEVERITY_ORDER.indexOf(finding.severity as (typeof SEVERITY_ORDER)[number]);
  if (idx >= 0 && idx < ceiling) {
    finding.severity = PAGE_LEVEL_CEILING;
  }
  return finding;
}

export function prioritize(findings: Finding[]): Finding[] {
  const declared =
    ((load("findings").blocking as { ids?: string[] } | undefined)?.ids) ?? [];
  const blocking = Object.fromEntries(declared.map((id, rank) => [id, rank]));

  const value = (f: Finding) => f.impact ?? f.pointsLost;

  const rank = (finding: Finding): [number, number, number, string] => {
    if (finding.id in blocking && !finding.pageLevel) {
      return [0, blocking[finding.id]!, 0, finding.id];
    }
    const sev = SEVERITY_ORDER.indexOf(finding.severity as (typeof SEVERITY_ORDER)[number]);
    return [1, sev >= 0 ? sev : SEVERITY_ORDER.length, -value(finding), finding.id];
  };

  const ordered = [...findings].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) {
      if (ra[i]! < rb[i]!) return -1;
      if (ra[i]! > rb[i]!) return 1;
    }
    return 0;
  });
  ordered.forEach((f, i) => {
    f.priority = i + 1;
  });
  return ordered;
}

export function buildSignal(
  signalId: string,
  spec: { class: string; max: number },
  result: [number | null, Record<string, unknown>],
  page: string,
): Signal {
  const [points, detail] = result;
  return {
    id: signalId,
    cls: spec.class,
    max: spec.max,
    value: points,
    detail,
    page,
    skippedReason: points === null ? (detail.reason as string | undefined) ?? null : null,
  };
}
