/**
 * Did the agent's changes actually help?
 *
 * Nothing in this codebase linked an applied change to search
 * performance — checked 19 Nov 2026. The agent could write 40 titles and
 * the monthly report would say "40 changes applied", which is a measure
 * of activity, not of result. Every SEO tool can tell you what it found.
 * Almost none can tell you what its own changes did, because almost none
 * of them make the changes.
 *
 * So this compares each fixed page's Search Console numbers for the 28
 * days BEFORE the change against the 28 days AFTER, and reports the
 * difference per page and in total.
 *
 * WHAT IT REFUSES TO DO, AND WHY THAT IS MOST OF THE FILE
 *
 * The temptation here is enormous and the failure mode is a tool that
 * flatters itself. Four rules:
 *
 *  1. A change needs 28 full days of "after" before it is measured at
 *     all. Anything sooner is noise read as a result — and reading it
 *     early is how you get a report claiming a 40% lift from a title
 *     changed on Tuesday.
 *  2. It never claims causation. Rankings move for algorithm updates,
 *     seasonality and competitors' work. The wording is "changed by",
 *     with the number, and `confidence` says how much weight the page's
 *     own volume can bear.
 *  3. A page with almost no impressions is reported as inconclusive
 *     rather than as a huge percentage swing. Going from 3 to 6
 *     impressions is +100% and means nothing.
 *  4. Losses are reported exactly as prominently as wins. A tool that
 *     only surfaces improvements is a tool whose numbers cannot be
 *     trusted in either direction — and the point of measuring is to
 *     catch a change that hurt.
 */

export type FixWindow = {
  /** The action's id, so a caller can link back to what was changed. */
  actionId: number;
  url: string;
  kind: string;
  appliedAt: Date;
};

export type PeriodMetrics = {
  clicks: number;
  impressions: number;
  /** Average position; lower is better. 0 when unknown. */
  position: number;
};

export type FixOutcome = {
  actionId: number;
  url: string;
  kind: string;
  appliedAt: Date;
  before: PeriodMetrics;
  after: PeriodMetrics;
  clicksDelta: number;
  impressionsDelta: number;
  /** Negative means the page moved UP the results (position got smaller). */
  positionDelta: number;
  /**
   * How much the numbers can bear.
   *
   * - `measured`  enough volume that the direction means something
   * - `thin`      real data, too little of it to read a percentage from
   * - `too_early` fewer than the required days since the change
   */
  confidence: "measured" | "thin" | "too_early";
  /** One line, honest about what it does and does not show. */
  summary: string;
};

/** Days of data needed either side before a change is measured. */
export const WINDOW_DAYS = 28;

/**
 * Impressions in the "before" window below which a percentage is
 * meaningless.
 *
 * 100 over 28 days is about 3-4 a day. Below that, a change of a few
 * impressions produces a double-digit percentage that reads as a result
 * and is weather.
 */
const THIN_IMPRESSIONS = 100;

/** Search Console does not report the last two days reliably. */
export const REPORTING_LAG_DAYS = 2;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

/**
 * The two date ranges to compare for a change applied on `appliedAt`,
 * or null when it is too soon to look.
 *
 * Exported because the honesty of the whole feature lives in this
 * function, and it is worth testing on its own.
 */
export function windowsFor(
  appliedAt: Date,
  now: Date = new Date(),
): {
  before: { start: string; end: string };
  after: { start: string; end: string };
} | null {
  // The newest day Search Console can be trusted for.
  const usableEnd = addDays(now, -REPORTING_LAG_DAYS);

  // The "after" window starts the day after the change — the day of the
  // change itself is excluded, because it contains hours from both
  // states and would contaminate whichever side it was counted in.
  const afterStart = addDays(appliedAt, 1);
  const afterEnd = addDays(afterStart, WINDOW_DAYS - 1);

  if (afterEnd > usableEnd) return null;

  const beforeEnd = addDays(appliedAt, -1);
  const beforeStart = addDays(beforeEnd, -(WINDOW_DAYS - 1));

  return {
    before: { start: ymd(beforeStart), end: ymd(beforeEnd) },
    after: { start: ymd(afterStart), end: ymd(afterEnd) },
  };
}

/** Days until a change becomes measurable. 0 when it already is. */
export function daysUntilMeasurable(
  appliedAt: Date,
  now: Date = new Date(),
): number {
  if (windowsFor(appliedAt, now)) return 0;
  const usableEnd = addDays(now, -REPORTING_LAG_DAYS);
  const afterEnd = addDays(appliedAt, WINDOW_DAYS);
  const ms = afterEnd.getTime() - usableEnd.getTime();
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function pct(before: number, after: number): string {
  if (before === 0) return after > 0 ? "up from zero" : "no change";
  const d = ((after - before) / before) * 100;
  const rounded = Math.round(d);
  if (rounded === 0) return "flat";
  return `${rounded > 0 ? "up" : "down"} ${Math.abs(rounded)}%`;
}

/**
 * Build the outcome for one change from its two periods' metrics.
 *
 * Pure, so the wording and the thresholds are testable without touching
 * Search Console.
 */
export function outcomeFor(
  fix: FixWindow,
  before: PeriodMetrics | null,
  after: PeriodMetrics | null,
  now: Date = new Date(),
): FixOutcome {
  const zero: PeriodMetrics = { clicks: 0, impressions: 0, position: 0 };
  const b = before ?? zero;
  const a = after ?? zero;

  const base = {
    actionId: fix.actionId,
    url: fix.url,
    kind: fix.kind,
    appliedAt: fix.appliedAt,
    before: b,
    after: a,
    clicksDelta: a.clicks - b.clicks,
    impressionsDelta: a.impressions - b.impressions,
    // Both positions must be real numbers for a delta to mean anything.
    // 0 is "not reported", not "position zero", and subtracting it
    // would invent a 40-place improvement out of missing data.
    positionDelta: b.position > 0 && a.position > 0 ? a.position - b.position : 0,
  };

  if (!windowsFor(fix.appliedAt, now)) {
    const days = daysUntilMeasurable(fix.appliedAt, now);
    return {
      ...base,
      confidence: "too_early",
      summary:
        `Applied ${describeWhen(fix.appliedAt, now)}. Needs ${WINDOW_DAYS} ` +
        `full days of data before the effect can be read — about ` +
        `${days} day${days === 1 ? "" : "s"} to go.`,
    };
  }

  if (b.impressions < THIN_IMPRESSIONS && a.impressions < THIN_IMPRESSIONS) {
    return {
      ...base,
      confidence: "thin",
      summary:
        `Too little search traffic on this page to tell — ${b.impressions} ` +
        `impressions before, ${a.impressions} after. The change may still ` +
        `be right; there just is not enough data to measure it.`,
    };
  }

  const clickPhrase = pct(b.clicks, a.clicks);
  const imprPhrase = pct(b.impressions, a.impressions);
  const posPhrase =
    base.positionDelta === 0
      ? ""
      : base.positionDelta < 0
        ? ` Average position improved by ${Math.abs(base.positionDelta).toFixed(1)}.`
        : ` Average position slipped by ${base.positionDelta.toFixed(1)}.`;

  return {
    ...base,
    confidence: "measured",
    // "changed by", never "caused". Rankings move for algorithm updates,
    // seasonality and competitors, and a tool that takes credit for all
    // of it cannot be trusted when it reports a loss.
    summary:
      `In the ${WINDOW_DAYS} days after this change, clicks were ` +
      `${clickPhrase} (${b.clicks} → ${a.clicks}) and impressions ` +
      `${imprPhrase} (${b.impressions.toLocaleString()} → ` +
      `${a.impressions.toLocaleString()}).${posPhrase} Measured, not ` +
      `attributed — other things changed in those 28 days too.`,
  };
}

function describeWhen(d: Date, now: Date): string {
  const days = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export type OutcomeRollup = {
  measured: number;
  thin: number;
  tooEarly: number;
  /** Pages whose clicks went up, among the measured ones. */
  improved: number;
  /** Pages whose clicks went down. Reported as prominently as wins. */
  declined: number;
  flat: number;
  clicksDelta: number;
  impressionsDelta: number;
  /** One paragraph for a report's "what our work did" section. */
  summary: string;
};

/**
 * Totals across every measured change.
 *
 * Only `measured` outcomes contribute to the deltas. Including thin and
 * too-early pages would let a handful of noisy rows swing the headline
 * number, which is precisely the dishonesty this module is built to
 * avoid.
 */
export function rollupOutcomes(outcomes: FixOutcome[]): OutcomeRollup {
  const measured = outcomes.filter((o) => o.confidence === "measured");
  const improved = measured.filter((o) => o.clicksDelta > 0).length;
  const declined = measured.filter((o) => o.clicksDelta < 0).length;
  const flat = measured.length - improved - declined;
  const clicksDelta = measured.reduce((n, o) => n + o.clicksDelta, 0);
  const impressionsDelta = measured.reduce((n, o) => n + o.impressionsDelta, 0);

  const thin = outcomes.filter((o) => o.confidence === "thin").length;
  const tooEarly = outcomes.filter((o) => o.confidence === "too_early").length;

  let summary: string;
  if (outcomes.length === 0) {
    summary = "No changes have been applied and confirmed yet.";
  } else if (measured.length === 0) {
    summary =
      `${outcomes.length} change${outcomes.length === 1 ? "" : "s"} applied, ` +
      `none measurable yet — ${tooEarly} still inside the ${WINDOW_DAYS}-day ` +
      `window and ${thin} on pages with too little search traffic to read.`;
  } else {
    summary =
      `${measured.length} change${measured.length === 1 ? "" : "s"} have ` +
      `${WINDOW_DAYS} days of data either side. ${improved} page${improved === 1 ? "" : "s"} ` +
      `gained clicks, ${declined} lost, ${flat} unchanged — a net ` +
      `${clicksDelta >= 0 ? "+" : ""}${clicksDelta} clicks and ` +
      `${impressionsDelta >= 0 ? "+" : ""}${impressionsDelta.toLocaleString()} ` +
      `impressions. These are measurements, not attributions: Google, ` +
      `competitors and seasonality all moved in the same period.`;
    if (tooEarly > 0 || thin > 0) {
      summary +=
        ` A further ${tooEarly} change${tooEarly === 1 ? " is" : "s are"} too ` +
        `recent to judge and ${thin} ${thin === 1 ? "is" : "are"} on pages ` +
        `with too little traffic to measure.`;
    }
  }

  return {
    measured: measured.length,
    thin,
    tooEarly,
    improved,
    declined,
    flat,
    clicksDelta,
    impressionsDelta,
    summary,
  };
}
