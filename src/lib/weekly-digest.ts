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

import { and, desc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db/client";
import {
  audits,
  auditIssues,
  clients,
  clientMetricSnapshots,
  tasks,
} from "@/db/schema";
import { ALGO_UPDATES } from "./algorithm-updates";
import { getSetting } from "./settings-store";

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

export async function buildWeeklyDigest(): Promise<WeeklyDigest> {
  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const prevWeekStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const allClients = await db.select().from(clients);
  const rows: DigestRow[] = [];
  let auditsRun = 0;
  let tasksDoneThisWeek = 0;
  let clientsImproved = 0;
  let clientsDropped = 0;

  for (const c of allClients) {
    // Latest 8 snapshots — first two power the delta math, the full
    // window feeds the inline sparkbar in the email digest.
    const snaps = await db
      .select()
      .from(clientMetricSnapshots)
      .where(eq(clientMetricSnapshots.clientId, c.id))
      .orderBy(desc(clientMetricSnapshots.capturedAt))
      .limit(8);
    const latest = snaps[0];
    const prev = snaps[1];
    const scoreHistory = snaps
      .slice()
      .reverse()
      .map((s) => s.healthScore)
      .filter((v): v is number => v !== null);

    // Audits run this week
    const recentAudits = await db
      .select()
      .from(audits)
      .where(
        and(eq(audits.clientId, c.id), gte(audits.createdAt, weekStart)),
      );
    auditsRun += recentAudits.length;

    // Tasks completed this week
    const taskCompleted = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.clientId, c.id),
          eq(tasks.status, "done"),
          gte(tasks.updatedAt, weekStart),
        ),
      );
    tasksDoneThisWeek += taskCompleted.length;

    // Open high-severity issues
    const openIssues = await db
      .select({ id: auditIssues.id, severity: auditIssues.severity })
      .from(auditIssues)
      .innerJoin(audits, eq(auditIssues.auditId, audits.id))
      .where(
        and(
          eq(audits.clientId, c.id),
          eq(auditIssues.severity, "high"),
        ),
      );
    const openHighIssues = openIssues.length;

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

    // Highlight + concern
    let highlight = "";
    let concern = "";
    if (taskCompleted.length > 0) {
      highlight = `${taskCompleted.length} task${taskCompleted.length === 1 ? "" : "s"} shipped`;
    } else if (scoreDelta !== null && scoreDelta > 0) {
      highlight = `Score +${scoreDelta}`;
    } else if (clicksDelta !== null && clicksDelta > 0) {
      highlight = `Clicks +${clicksDelta}`;
    }
    if (scoreDelta !== null && scoreDelta <= -5) {
      concern = `Score dropped ${Math.abs(scoreDelta)} points`;
    } else if (openHighIssues > 0) {
      concern = `${openHighIssues} high-severity issue${openHighIssues === 1 ? "" : "s"} unresolved`;
    } else if (clicksDelta !== null && clicksDelta < -50) {
      concern = `Clicks ${clicksDelta}`;
    } else if (recentAudits.length === 0) {
      concern = "No audit this week";
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

  const algoOverlaps = ALGO_UPDATES.filter((u) => {
    const start = new Date(u.date).getTime();
    const end = new Date(u.endDate ?? u.date).getTime();
    return start <= now.getTime() && end >= weekStart.getTime();
  }).map((u) => ({ name: u.name, date: u.date, type: u.type }));

  const textVersion = renderText({
    weekStart,
    weekEnd: now,
    rows,
    auditsRun,
    tasksDoneThisWeek,
    clientsImproved,
    clientsDropped,
    algoOverlaps,
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
  brand?: {
    name: string | null;
    tagline: string | null;
    footerText: string | null;
    website: string | null;
  };
};

function renderText(o: RenderOpts): string {
  const lines: string[] = [];
  lines.push(
    `Weekly digest · ${o.weekStart.toISOString().slice(0, 10)} → ${o.weekEnd.toISOString().slice(0, 10)}`,
  );
  lines.push("");
  lines.push(
    `${o.rows.length} client${o.rows.length === 1 ? "" : "s"} · ${o.auditsRun} audit${o.auditsRun === 1 ? "" : "s"} · ${o.tasksDoneThisWeek} task${o.tasksDoneThisWeek === 1 ? "" : "s"} shipped · ${o.clientsImproved} improved · ${o.clientsDropped} dropped`,
  );
  if (o.algoOverlaps.length > 0) {
    lines.push("");
    lines.push("Google updates this week:");
    for (const u of o.algoOverlaps) lines.push(`  - ${u.name} (${u.type})`);
  }
  lines.push("");
  lines.push("Per client:");
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
      `  ${r.clientName} — ${score}${delta}${trend} · ${parts.join(" · ") || "no change"}`,
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
  const start = o.weekStart.toISOString().slice(0, 10);
  const end = o.weekEnd.toISOString().slice(0, 10);
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Weekly digest</title>
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
<h1>Weekly digest</h1>
<p class="sub">${start} → ${end}</p>
<div class="stats">
  <span class="stat"><b>${o.rows.length}</b> clients</span>
  <span class="stat"><b>${o.auditsRun}</b> audits</span>
  <span class="stat"><b>${o.tasksDoneThisWeek}</b> tasks shipped</span>
  <span class="stat ok"><b>${o.clientsImproved}</b> improved</span>
  <span class="stat bad"><b>${o.clientsDropped}</b> dropped</span>
</div>
${
  o.algoOverlaps.length > 0
    ? `<div class="algo"><b>Google updates this week:</b> ${o.algoOverlaps
        .map((u) => `${esc(u.name)} (${esc(u.type)})`)
        .join(" · ")}</div>`
    : ""
}
<table>
  <thead><tr><th>Client</th><th>Score</th><th>Trend</th><th>Wins</th><th>Concerns</th></tr></thead>
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
 */
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

  await setSetting("digest.last_auto_run_at", thisMonday.toISOString());

  try {
    const digest = await buildWeeklyDigest();
    const { sendMail } = await import("./mailer");
    await sendMail({
      to: [email],
      subject: `Weekly SEO digest — ${digest.weekStart} → ${digest.weekEnd}`,
      text: digest.textVersion,
      html: digest.htmlVersion,
    });
    await setSetting("digest.last_sent_at", new Date().toISOString());
  } catch {
    // Retry next Monday if this failed
  }
}
