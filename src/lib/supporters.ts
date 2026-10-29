/**
 * The maintainer's support tracker: what has come in, what it is for, and
 * who to thank. The figures live in `supporters.json` at the root of the
 * repo, which every install reads over the network — editing that file on
 * GitHub updates every copy with no release.
 *
 * That also means the numbers arrive from the internet, so nothing in here
 * is trusted. `parseSupporters` is the only way in: it clamps every number,
 * truncates every string, and returns `null` rather than a half-built object
 * when the file is missing, malformed or serving something unexpected. A page
 * that gets `null` shows no tracker at all, which is the right failure — an
 * invented total would be worse than no total.
 *
 * Two deliberate differences from the GST app this pattern came from:
 *
 *   - Support is asked for in ONE place (the Support & about page) and on the
 *     maintainer's own dashboard. Never in the client portal, a PDF report or
 *     an invoice. This tool is used in front of paying clients, and a tip jar
 *     on a client's deliverable is the maintainer's problem to carry, not the
 *     user's. `support-surfaces.test.ts` fails the build if that slips.
 *   - The total is one rupee figure even though PayPal is offered, because
 *     two running totals in two currencies is a number nobody can read at a
 *     glance. The maintainer converts and adds.
 */

import { REPO_RAW_URL } from "./repo";

/** The tracker file on the default branch. Built from the one slug we keep. */
export const SUPPORTERS_URL = `${REPO_RAW_URL}/main/supporters.json`;

/** How a payment is labelled so the maintainer can tell who sent it. */
const NOTE_BASE = "SEO Tool support";

/**
 * The note UPI apps prefill when the QR is scanned, carrying the payer's
 * name when they allow it: "SEO Tool support - Kaveri Digital".
 *
 * Kept to letters, digits, spaces, "." and "-" because some UPI apps reject
 * anything else outright, and to 50 characters, which all of them accept.
 */
export function upiNote(payerName = ""): string {
  const name = String(payerName || "")
    .replace(/[^A-Za-z0-9 .-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) return NOTE_BASE;
  return `${NOTE_BASE} - ${name}`.slice(0, 50).trim();
}

export type SupportGoal = { amount: number; label: string };

/**
 * One named supporter and what they gave in total. Separate from `thanks`,
 * which is names alone: a file written before `people` existed has only
 * names, and the page falls back to those rather than showing nothing.
 */
export type Supporter = {
  name: string;
  /** Rupees, combined across repeat payments. */
  amount: number;
  /** ISO date of their most recent payment, or "" when the file omits it. */
  date: string;
};

export type SupportTracker = {
  /** Combined total in rupees. */
  totalReceived: number;
  /** How many people, or null when the file does not say. */
  supporters: number | null;
  goal: SupportGoal | null;
  /** Names to thank, oldest first — the file appends, so the end is newest. */
  thanks: string[];
  /** Named supporters with amounts, oldest first. Empty on older files. */
  people: Supporter[];
  /** ISO date (YYYY-MM-DD), or "" when the file does not say. */
  updated: string;
};

/** A date the file is allowed to state: YYYY-MM-DD, or "" for anything else. */
function isoDate(value: unknown): string {
  const s = String(value ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

/**
 * A number in range, or null.
 *
 * The explicit rejections matter more than the range check. `Number(null)`
 * is `0`, and `Number("")` is `0` too — so a plain `Number(value)` turns a
 * missing total into a confident "₹0 received so far", which is a figure
 * nobody wrote and nobody can correct. Likewise `Number([])`. Absent and
 * zero are different answers and this returns different answers for them.
 */
function finiteInRange(value: unknown, max: number): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean" || typeof value === "object") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

/**
 * The tracker as a page may render it, or `null` when the file cannot be
 * used. Unexpected fields are dropped rather than displayed.
 *
 * `totalReceived` is the one required field: without it there is no tracker
 * worth showing, and a tracker that renders "₹NaN received" is exactly the
 * kind of confidently wrong number this project keeps finding.
 */
export function parseSupporters(raw: unknown): SupportTracker | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  const total = finiteInRange(obj.totalReceived, 1e10);
  if (total === null) return null;

  const supporters = finiteInRange(obj.supporters, 1e7);
  const goalRaw =
    obj.goal && typeof obj.goal === "object" && !Array.isArray(obj.goal)
      ? (obj.goal as Record<string, unknown>)
      : null;
  const goalAmount = goalRaw ? finiteInRange(goalRaw.amount, 1e10) : null;

  return {
    totalReceived: Math.round(total),
    supporters: supporters === null ? null : Math.floor(supporters),
    goal: goalAmount ? { amount: Math.round(goalAmount), label: cleanText(goalRaw?.label, 80) } : null,
    thanks: (Array.isArray(obj.thanks) ? obj.thanks : [])
      .map((n) => cleanText(n, 60))
      .filter(Boolean)
      .slice(-2000),
    // A row needs both a name and a usable amount to be shown. An entry
    // with one of the two is dropped rather than rendered as "Someone —
    // ₹0", which would read as a real payment of nothing.
    people: (Array.isArray(obj.people) ? obj.people : [])
      .filter((p): p is Record<string, unknown> =>
        Boolean(p) && typeof p === "object" && !Array.isArray(p),
      )
      .map((p) => ({
        name: cleanText(p.name, 60),
        amount: finiteInRange(p.amount, 1e9),
        date: isoDate(p.date),
      }))
      .filter((p): p is Supporter => p.name !== "" && p.amount !== null)
      .map((p) => ({ ...p, amount: Math.round(p.amount) }))
      .slice(-2000),
    updated: isoDate(obj.updated),
  };
}

/** Rupees, grouped the Indian way: ₹1,00,000 rather than ₹100,000. */
export function formatRupees(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

/** How far along the goal is, 0-100, clamped so an overshoot still reads full. */
export function goalPercent(total: number, goal: number): number {
  if (!(goal > 0)) return 0;
  return Math.max(0, Math.min(100, (total / goal) * 100));
}

/* ------------------------------------------------------------------ nudge */

/**
 * The dashboard card. It appears once the install has actually done
 * something useful — asking for support before the tool has delivered any
 * is both rude and unconvincing — and then at most once a day.
 */
export const SUPPORT_NUDGE_MIN_AUDITS = 5;
export const SNOOZE_DAYS = 30;

export type NudgeState = {
  /** "Not today": the local date it was dismissed on. */
  hiddenOn?: string;
  /** "Hide for 30 days": epoch ms to stay quiet until. */
  snoozedUntil?: number;
  /** Never ask again. */
  never?: boolean;
};

/**
 * The stored dismissal state, read defensively.
 *
 * It comes out of the settings table as unknown JSON, and a wrong shape here
 * would either crash the dashboard or — worse — silently read as "nothing
 * dismissed" and bring back a card the user put away.
 */
export function parseNudgeState(raw: unknown): NudgeState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  return {
    hiddenOn: typeof o.hiddenOn === "string" ? o.hiddenOn : undefined,
    snoozedUntil:
      typeof o.snoozedUntil === "number" && Number.isFinite(o.snoozedUntil)
        ? o.snoozedUntil
        : undefined,
    never: o.never === true,
  };
}

/** Local calendar date, not UTC — "once a day" means the user's day. */
export function localDay(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function shouldShowSupportNudge(
  auditsRun: number,
  state: NudgeState = {},
  now: Date = new Date(),
): boolean {
  if (!Number.isFinite(auditsRun) || auditsRun < SUPPORT_NUDGE_MIN_AUDITS) return false;
  if (state.never) return false;
  if (state.hiddenOn === localDay(now)) return false;
  return !(Number(state.snoozedUntil) > now.getTime());
}

/** The epoch ms "Hide for 30 days" should store. */
export function snoozeUntil(now: Date = new Date()): number {
  return now.getTime() + SNOOZE_DAYS * 86_400_000;
}

/**
 * A different line each day, so a card that returns daily does not read as
 * the same banner being ignored. Keyed on the day, not random, so it does
 * not change under the user mid-session.
 */
const LINES = [
  "This tool is free, with no ads, no account and no paid tier. It keeps going because people chip in.",
  "One developer builds this in spare hours. A small payment pays for the next fix.",
  "No subscription and nothing locked. If it saves you an afternoon a month, help keep it that way.",
  "Every bug report and every rupee goes into the next release.",
] as const;

export function nudgeLine(now: Date = new Date()): string {
  return LINES[Math.floor(now.getTime() / 86_400_000) % LINES.length];
}
