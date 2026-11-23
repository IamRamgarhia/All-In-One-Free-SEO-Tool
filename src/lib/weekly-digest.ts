/**
 * Weekly digest builder. The Monday-morning agency-owner summary across
 * every client. Returns plain text + HTML so the user can paste into
 * email or Slack.
 *
 * Sections:
 *   - Per-client one-line (score change, top win, top concern)
 *   - Aggregate stats (audits run, tasks completed, score drops/climbs)
 *   - Cross-client wins / losses
 *   - Algorithm updates that overlapped the week
 *   - Cap on length (~60 lines) so it stays scan-friendly
 */

import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  audits,
  auditIssues,
  clients,
  clientMetricSnapshots,
  tasks,
} from "@/db/schema";
import { updatesNear } from "./algorithm-updates";
import { getRankingUpdates } from "./google-updates-store";
import { getSetting } from "./settings-store";
import type { Locale } from "@/i18n/config";
import { getReportLocale } from "./report-i18n";

const plural = (n: number, one: string, other: string) => (n === 1 ? one : other);

/**
 * Every word of the digest, in each interface language. The digest goes
 * to the agency (on screen and by email), so it follows the workspace
 * language (Settings → General), like the reports.
 */
const TEXT = {
  en: {
    date: (d: Date) => d.toISOString().slice(0, 10),
    tasksShipped: (n: number) => `${n} task${n === 1 ? "" : "s"} shipped`,
    scoreUp: (d: number) => `Score +${d}`,
    clicksUp: (d: number) => `Clicks +${d}`,
    scoreDropped: (d: number) => `Score dropped ${d} points`,
    highIssues: (n: number) => `${n} high-severity issue${n === 1 ? "" : "s"} unresolved`,
    clicksDown: (d: number) => `Clicks ${d}`,
    noAudit: "No audit this week",
    title: "Weekly digest",
    summary: (clients: number, audits: number, tasks: number, improved: number, dropped: number) =>
      `${clients} client${clients === 1 ? "" : "s"} · ${audits} audit${audits === 1 ? "" : "s"} · ${tasks} task${tasks === 1 ? "" : "s"} shipped · ${improved} improved · ${dropped} dropped`,
    googleUpdates: "Google updates this week:",
    perClient: "Per client:",
    noChange: "no change",
    statClients: "clients",
    statAudits: "audits",
    statTasks: "tasks shipped",
    statImproved: "improved",
    statDropped: "dropped",
    colClient: "Client",
    colScore: "Score",
    colTrend: "Trend",
    colWins: "Wins",
    colConcerns: "Concerns",
    subject: (start: string, end: string) => `Weekly SEO digest — ${start} → ${end}`,
  },
  fr: {
    date: (d: Date) => d.toLocaleDateString("fr-FR"),
    tasksShipped: (n: number) => `${n} ${plural(n, "tâche terminée", "tâches terminées")}`,
    scoreUp: (d: number) => `Score +${d}`,
    clicksUp: (d: number) => `Clics +${d}`,
    scoreDropped: (d: number) => `Score en baisse de ${d} ${plural(d, "point", "points")}`,
    highIssues: (n: number) =>
      `${n} ${plural(n, "problème de gravité élevée non résolu", "problèmes de gravité élevée non résolus")}`,
    clicksDown: (d: number) => `Clics ${d}`,
    noAudit: "Aucun audit cette semaine",
    title: "Synthèse hebdomadaire",
    summary: (clients: number, audits: number, tasks: number, improved: number, dropped: number) =>
      `${clients} client${clients > 1 ? "s" : ""} · ${audits} audit${audits > 1 ? "s" : ""} · ${tasks} ${plural(tasks, "tâche terminée", "tâches terminées")} · ${improved} en progrès · ${dropped} en recul`,
    googleUpdates: "Mises à jour de Google cette semaine :",
    perClient: "Par client :",
    noChange: "aucun changement",
    statClients: "clients",
    statAudits: "audits",
    statTasks: "tâches terminées",
    statImproved: "en progrès",
    statDropped: "en recul",
    colClient: "Client",
    colScore: "Score",
    colTrend: "Tendance",
    colWins: "Réussites",
    colConcerns: "Points d’attention",
    subject: (start: string, end: string) => `Synthèse SEO hebdomadaire — du ${start} au ${end}`,
  },
} satisfies Record<Locale, unknown>;

type DigestText = (typeof TEXT)["en"];

export type DigestRow = {
  clientId: number;
  clientName: string;
  url: string;
  scoreLatest: number | null;
  scoreDelta: number | null;
  clicksDelta: number | null;
  tasksDoneThisWeek: number;
  openHighIssues: number;
  highlight: string;
  concern: string;
  /**
   * Last 8 health-score snapshots (oldest → newest). Powers the inline
   * sparkbar in the HTML digest and the unicode trend strip in the text
   * digest. May be shorter than 8 for new clients.
   */
  scoreHistory: number[];
};

export type WeeklyDigest = {
  weekStart: string;
  weekEnd: string;
  rows: DigestRow[];
  totals: {
    auditsRun: number;
    tasksDone: number;
    clientsImproved: number;
    clientsDropped: number;
  };
  algoOverlaps: { name: string; date: string; type: string }[];
  textVersion: string;
  htmlVersion: string;
};

export async function buildWeeklyDigest(
  opts: { locale?: Locale } = {},
): Promise<WeeklyDigest> {
  const L: DigestText = TEXT[opts.locale ?? (await getReportLocale())];
  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const allClients = await db.select().from(clients);
  const rows: DigestRow[] = [];
  let auditsRun = 0;
  let tasksDoneThisWeek = 0;
  let clientsImproved = 0;
  let clientsDropped = 0;

  // Batch-load everything once instead of 4 queries per client. With 20
  // clients the old loop fired 80 round-trips through Drizzle/better-sqlite3
  // — fast in absolute terms but wasteful and N+1-shaped. inArray() turns
  // it into 4 total queries regardless of client count.
  const clientIds = allClients.map((c) => c.id);

  type SnapRow = typeof clientMetricSnapshots.$inferSelect;
  type AuditRow = typeof audits.$inferSelect;
  type TaskRow = typeof tasks.$inferSelect;
  const snapsByClient = new Map<number, SnapRow[]>();
  const auditsByClient = new Map<number, AuditRow[]>();
  const tasksByClient = new Map<number, TaskRow[]>();
  const highIssuesByClient = new Map<number, number>();

  if (clientIds.length > 0) {
    // Snapshots — pull all from the last 90 days for these clients in
    // one go, then group + sort + slice in memory. Old loop did
    // `desc + limit 8` per client; this gives the same window cheaply.
    const snapCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const allSnaps = await db
      .select()
      .from(clientMetricSnapshots)
      .where(
        and(
          inArray(clientMetricSnapshots.clientId, clientIds),
          gte(clientMetricSnapshots.capturedAt, snapCutoff),
        ),
      )
      .orderBy(desc(clientMetricSnapshots.capturedAt));
    for (const s of allSnaps) {
      const arr = snapsByClient.get(s.clientId) ?? [];
      if (arr.length < 8) arr.push(s); // already desc-ordered
      snapsByClient.set(s.clientId, arr);
    }

    const allRecentAudits = await db
      .select()
      .from(audits)
      .where(
        and(
          inArray(audits.clientId, clientIds),
          gte(audits.createdAt, weekStart),
        ),
      );
    for (const a of allRecentAudits) {
      const arr = auditsByClient.get(a.clientId) ?? [];
      arr.push(a);
      auditsByClient.set(a.clientId, arr);
    }
    auditsRun = allRecentAudits.length;

    const allDoneTasks = await db
      .select()
      .from(tasks)
      .where(
        and(
          inArray(tasks.clientId, clientIds),
          eq(tasks.status, "done"),
          gte(tasks.updatedAt, weekStart),
        ),
      );
    for (const t of allDoneTasks) {
      const arr = tasksByClient.get(t.clientId) ?? [];
      arr.push(t);
      tasksByClient.set(t.clientId, arr);
    }
    tasksDoneThisWeek = allDoneTasks.length;

    const allHighIssues = await db
      .select({ clientId: audits.clientId })
      .from(auditIssues)
      .innerJoin(audits, eq(auditIssues.auditId, audits.id))
      .where(
        and(
          inArray(audits.clientId, clientIds),
          eq(auditIssues.severity, "high"),
        ),
      );
    for (const row of allHighIssues) {
      highIssuesByClient.set(
        row.clientId,
        (highIssuesByClient.get(row.clientId) ?? 0) + 1,
      );
    }
  }

  for (const c of allClients) {
    const snaps = snapsByClient.get(c.id) ?? [];
    const latest = snaps[0];
    const prev = snaps[1];
    const scoreHistory = snaps
      .slice()
      .reverse()
      .map((s) => s.healthScore)
      .filter((v): v is number => v !== null);

    const recentAudits = auditsByClient.get(c.id) ?? [];
    const taskCompleted = tasksByClient.get(c.id) ?? [];
    const openHighIssues = highIssuesByClient.get(c.id) ?? 0;

    const scoreLatest = latest?.healthScore ?? null;
    const scoreDelta =
      latest?.healthScore !== null && prev?.healthScore !== null && latest && prev
        ? (latest.healthScore as number) - (prev.healthScore as number)
        : null;
    const clicksDelta =
      latest?.organicClicks !== null && prev?.organicClicks !== null && latest && prev
        ? (latest.organicClicks as number) - (prev.organicClicks as number)
        : null;

    if (scoreDelta !== null) {
      if (scoreDelta >= 5) clientsImproved += 1;
      else if (scoreDelta <= -5) clientsDropped += 1;
    }

    let highlight = "";
    let concern = "";
    if (taskCompleted.length > 0) {
      highlight = L.tasksShipped(taskCompleted.length);
    } else if (scoreDelta !== null && scoreDelta > 0) {
      highlight = L.scoreUp(scoreDelta);
    } else if (clicksDelta !== null && clicksDelta > 0) {
      highlight = L.clicksUp(clicksDelta);
    }
    if (scoreDelta !== null && scoreDelta <= -5) {
      concern = L.scoreDropped(Math.abs(scoreDelta));
    } else if (openHighIssues > 0) {
      concern = L.highIssues(openHighIssues);
    } else if (clicksDelta !== null && clicksDelta < -50) {
      concern = L.clicksDown(clicksDelta);
    } else if (recentAudits.length === 0) {
      concern = L.noAudit;
    }

    rows.push({
      clientId: c.id,
      clientName: c.name,
      url: c.url,
      scoreLatest,
      scoreDelta,
      clicksDelta,
      tasksDoneThisWeek: taskCompleted.length,
      openHighIssues,
      highlight,
      concern,
      scoreHistory,
    });
  }

  // Sort by clients with the most concerning movement first
  rows.sort((a, b) => {
    const aBad = (a.scoreDelta ?? 0) < 0 ? Math.abs(a.scoreDelta ?? 0) : 0;
    const bBad = (b.scoreDelta ?? 0) < 0 ? Math.abs(b.scoreDelta ?? 0) : 0;
    return bBad - aBad;
  });

  const algoOverlaps = updatesNear(
    await getRankingUpdates(),
    weekStart.toISOString(),
    now.toISOString(),
    0,
  ).map((u) => ({ name: u.name, date: u.date, type: u.type }));

  const textVersion = renderText({
    weekStart,
    weekEnd: now,
    rows,
    auditsRun,
    tasksDoneThisWeek,
    clientsImproved,
    clientsDropped,
    algoOverlaps,
    L,
  });
  const brand = {
    name: (await getSetting<string>("brand.name")) ?? null,
    tagline: (await getSetting<string>("brand.tagline")) ?? null,
    footerText: (await getSetting<string>("brand.footer_text")) ?? null,
    website: (await getSetting<string>("brand.website")) ?? null,
  };
  const htmlVersion = renderHtml({
    weekStart,
    weekEnd: now,
    rows,
    auditsRun,
    tasksDoneThisWeek,
    clientsImproved,
    clientsDropped,
    algoOverlaps,
    brand,
    L,
  });

  return {
    weekStart: weekStart.toISOString().slice(0, 10),
    weekEnd: now.toISOString().slice(0, 10),
    rows,
    totals: { auditsRun, tasksDone: tasksDoneThisWeek, clientsImproved, clientsDropped },
    algoOverlaps,
    textVersion,
    htmlVersion,
  };
}

type RenderOpts = {
  weekStart: Date;
  weekEnd: Date;
  rows: DigestRow[];
  auditsRun: number;
  tasksDoneThisWeek: number;
  clientsImproved: number;
  clientsDropped: number;
  algoOverlaps: { name: string; date: string; type: string }[];
  L: DigestText;
  brand?: {
    name: string | null;
    tagline: string | null;
    footerText: string | null;
    website: string | null;
  };
};

function renderText(o: RenderOpts): string {
  const { L } = o;
  const lines: string[] = [];
  lines.push(`${L.title} · ${L.date(o.weekStart)} → ${L.date(o.weekEnd)}`);
  lines.push("");
  lines.push(
    L.summary(o.rows.length, o.auditsRun, o.tasksDoneThisWeek, o.clientsImproved, o.clientsDropped),
  );
  if (o.algoOverlaps.length > 0) {
    lines.push("");
    lines.push(L.googleUpdates);
    for (const u of o.algoOverlaps) lines.push(`  - ${u.name} (${u.type})`);
  }
  lines.push("");
  lines.push(L.perClient);
  for (const r of o.rows) {
    const score = r.scoreLatest !== null ? `${r.scoreLatest}` : "—";
    const delta =
      r.scoreDelta !== null
        ? r.scoreDelta > 0
          ? ` +${r.scoreDelta}`
          : ` ${r.scoreDelta}`
        : "";
    const parts: string[] = [];
    if (r.highlight) parts.push(`✓ ${r.highlight}`);
    if (r.concern) parts.push(`! ${r.concern}`);
    const trend =
      r.scoreHistory.length >= 2 ? "  " + unicodeSparkline(r.scoreHistory) : "";
    lines.push(
      `  ${r.clientName} — ${score}${delta}${trend} · ${parts.join(" · ") || L.noChange}`,
    );
  }
  return lines.join("\n");
}

/**
 * 8-step block-character sparkline. Renders cleanly in any monospace
 * email client or terminal. Values are mapped to ▁▂▃▄▅▆▇█.
 */
function unicodeSparkline(values: number[]): string {
  const blocks = "▁▂▃▄▅▆▇█";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((v) => {
      const idx = Math.min(7, Math.floor(((v - min) / range) * 8));
      return blocks[idx];
    })
    .join("");
}

/**
 * Inline HTML sparkbar — chunks of `<span>` elements with widths driven
 * by score values. Pure CSS, no SVG. Renders in every email client
 * (Gmail, Outlook, Apple Mail) because it's just inline-block divs with
 * background-color. Width is fixed at 84px so the table stays scannable.
 */
function htmlSparkbar(values: number[]): string {
  if (values.length < 2) {
    return `<span style="color:#999;font-size:11px;">—</span>`;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const first = values[0];
  const last = values[values.length - 1];
  const trendColor =
    last > first ? "#059669" : last < first ? "#dc2626" : "#6b7280";
  const bars = values
    .map((v) => {
      const pct = Math.max(15, ((v - min) / range) * 100);
      return `<span style="display:inline-block;width:8px;margin-right:1px;height:${pct.toFixed(0)}%;background:${trendColor};border-radius:1px;vertical-align:bottom;"></span>`;
    })
    .join("");
  return `<span style="display:inline-block;height:18px;line-height:0;white-space:nowrap;vertical-align:middle;">${bars}</span>`;
}

function renderHtml(o: RenderOpts): string {
  const { L } = o;
  const start = L.date(o.weekStart);
  const end = L.date(o.weekEnd);
  return `<!doctype html>
<html lang="${L === TEXT.fr ? "fr" : "en"}"><head><meta charset="utf-8"><title>${L.title}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; max-width: 720px; margin: 24px auto; padding: 0 16px; color: #1a1a1a; line-height: 1.5; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #666; font-size: 14px; margin: 0 0 24px; }
  .stats { display: flex; flex-wrap: wrap; gap: 12px; margin: 16px 0 24px; }
  .stat { background: #f5f5f7; padding: 8px 12px; border-radius: 8px; font-size: 13px; }
  .algo { background: #fff7ed; border: 1px solid #fed7aa; padding: 10px 12px; border-radius: 8px; font-size: 13px; margin-bottom: 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; padding: 8px 10px; background: #f5f5f7; border-bottom: 1px solid #e5e5e7; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #666; }
  td { padding: 10px; border-bottom: 1px solid #e5e5e7; }
  td.score { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  td.trend { width: 90px; padding: 6px 10px; }
  .up { color: #059669; }
  .down { color: #dc2626; }
  .ok { color: #059669; }
  .bad { color: #d97706; }
</style></head><body>
<h1>${L.title}</h1>
<p class="sub">${start} → ${end}</p>
<div class="stats">
  <span class="stat"><b>${o.rows.length}</b> ${L.statClients}</span>
  <span class="stat"><b>${o.auditsRun}</b> ${L.statAudits}</span>
  <span class="stat"><b>${o.tasksDoneThisWeek}</b> ${L.statTasks}</span>
  <span class="stat ok"><b>${o.clientsImproved}</b> ${L.statImproved}</span>
  <span class="stat bad"><b>${o.clientsDropped}</b> ${L.statDropped}</span>
</div>
${
  o.algoOverlaps.length > 0
    ? `<div class="algo"><b>${L.googleUpdates}</b> ${o.algoOverlaps
        .map((u) => `${esc(u.name)} (${esc(u.type)})`)
        .join(" · ")}</div>`
    : ""
}
<table>
  <thead><tr><th>${L.colClient}</th><th>${L.colScore}</th><th>${L.colTrend}</th><th>${L.colWins}</th><th>${L.colConcerns}</th></tr></thead>
  <tbody>
    ${o.rows
      .map(
        (r) => `<tr>
      <td>${esc(r.clientName)}</td>
      <td class="score">${r.scoreLatest ?? "—"}${r.scoreDelta !== null ? `<span class="${r.scoreDelta > 0 ? "up" : r.scoreDelta < 0 ? "down" : ""}"> ${r.scoreDelta > 0 ? "+" : ""}${r.scoreDelta}</span>` : ""}</td>
      <td class="trend">${htmlSparkbar(r.scoreHistory)}</td>
      <td class="ok">${r.highlight ? "✓ " + esc(r.highlight) : ""}</td>
      <td class="bad">${r.concern ? esc(r.concern) : ""}</td>
    </tr>`,
      )
      .join("")}
  </tbody>
</table>
${
  o.brand?.footerText || o.brand?.name
    ? `<footer style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e5e7;font-size:11px;color:#888;text-align:center;line-height:1.5;">
  ${
    o.brand?.name
      ? `<div><strong style="color:#444;">${esc(o.brand.name)}</strong>${o.brand.tagline ? ` · ${esc(o.brand.tagline)}` : ""}</div>`
      : ""
  }
  ${o.brand?.footerText ? `<div>${esc(o.brand.footerText)}</div>` : ""}
  ${o.brand?.website ? `<div><a href="${esc(o.brand.website)}" style="color:#888;text-decoration:none;">${esc(o.brand.website.replace(/^https?:\/\//, ""))}</a></div>` : ""}
</footer>`
    : ""
}
</body></html>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Auto-send tick. Fires from the dashboard alongside the other tick runners.
 * Sends the weekly digest once per Monday 09:00 UTC if enabled in settings.
 *
 * Ordering: write `last_auto_run_at` only AFTER the send completes
 * successfully. The old behavior wrote it up-front (before send) — if
 * the send then crashed or threw, the user lost the digest for that
 * week with no retry. An in-memory `digestInFlight` flag prevents the
 * dashboard tick (which can fire every few seconds while a user is on
 * the page) from spawning concurrent sends while the first is still
 * working.
 */
let digestInFlight = false;
export async function tickWeeklyDigestRunner(): Promise<void> {
  const { getSetting, setSetting } = await import("./settings-store");
  const enabled = await getSetting<boolean>("digest.auto_send_enabled");
  if (!enabled) return;
  const email = await getSetting<string>("digest.recipient_email");
  if (!email) return;

  const now = new Date();
  if (now.getUTCDay() !== 1) return; // Monday
  if (now.getUTCHours() < 9) return;

  const thisMonday = new Date(now);
  thisMonday.setUTCHours(9, 0, 0, 0);

  const lastRunIso = await getSetting<string>("digest.last_auto_run_at");
  if (lastRunIso) {
    const lastRun = new Date(lastRunIso);
    if (lastRun >= thisMonday) return;
  }

  if (digestInFlight) return; // Another tick is mid-send
  digestInFlight = true;
  try {
    const locale = await getReportLocale();
    const digest = await buildWeeklyDigest({ locale });
    const L = TEXT[locale];
    const { sendMail } = await import("./mailer");
    await sendMail({
      to: [email],
      subject:
        locale === "fr"
          ? L.subject(L.date(new Date(`${digest.weekStart}T12:00:00Z`)), L.date(new Date(`${digest.weekEnd}T12:00:00Z`)))
          : L.subject(digest.weekStart, digest.weekEnd),
      text: digest.textVersion,
      html: digest.htmlVersion,
    });
    // Only mark as "ran" once send actually succeeded. Failed sends
    // retry on the next tick within the same Monday window.
    await setSetting("digest.last_auto_run_at", thisMonday.toISOString());
    await setSetting("digest.last_sent_at", new Date().toISOString());
  } catch {
    // Don't write last_auto_run_at — next tick will retry
  } finally {
    digestInFlight = false;
  }
}
