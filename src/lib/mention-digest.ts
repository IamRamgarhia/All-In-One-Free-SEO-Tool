/**
 * Weekly brand-mention digest. Bundles each client's mentions from the
 * past 7 days into a single owner-facing email. Fires every Friday from
 * the daily-agent runner — falls back silently if SMTP isn't configured
 * or if there are no fresh mentions.
 */

import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db/client";
import { brandMentions, clients } from "@/db/schema";
import { sendMail, getSmtpConfig } from "./mailer";
import { getSetting, setSetting } from "./settings-store";

const RUNNER_INTERVAL_MS = 6 * 24 * 60 * 60 * 1000;

export async function sendWeeklyMentionDigests(): Promise<{
  sent: number;
  reason?: string;
}> {
  const lastRun = await getSetting<number>(
    "mention_digest_runner.last_run",
  ).catch(() => null);
  if (
    typeof lastRun === "number" &&
    Date.now() - lastRun < RUNNER_INTERVAL_MS
  ) {
    return { sent: 0, reason: "throttled" };
  }
  // Run on Fridays (UTC) — skip other days.
  const today = new Date();
  if (today.getUTCDay() !== 5) return { sent: 0, reason: "not friday" };

  const smtp = await getSmtpConfig();
  if (!smtp) return { sent: 0, reason: "no smtp" };

  // Recipient = the workspace owner. We use the SMTP from-email as the
  // pragmatic owner-address for self-hosted single-user deployments.
  const recipient = smtp.fromEmail;
  if (!recipient) return { sent: 0, reason: "no recipient" };

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients);

  const byClient: {
    name: string;
    positive: number;
    neutral: number;
    negative: number;
    items: { source: string; title: string; url: string; sentiment: number }[];
  }[] = [];

  for (const c of allClients) {
    const mentions = await db
      .select()
      .from(brandMentions)
      .where(
        and(
          eq(brandMentions.clientId, c.id),
          gte(brandMentions.capturedAt, cutoff),
        ),
      )
      .orderBy(desc(brandMentions.publishedAt))
      .limit(40);
    if (mentions.length === 0) continue;
    byClient.push({
      name: c.name,
      positive: mentions.filter((m) => m.sentiment > 0).length,
      neutral: mentions.filter((m) => m.sentiment === 0).length,
      negative: mentions.filter((m) => m.sentiment < 0).length,
      items: mentions.slice(0, 8).map((m) => ({
        source: m.source,
        title: m.title ?? "(untitled)",
        url: m.url,
        sentiment: m.sentiment,
      })),
    });
  }

  if (byClient.length === 0) {
    await setSetting("mention_digest_runner.last_run", Date.now());
    return { sent: 0, reason: "no mentions" };
  }

  const subject = `Weekly brand-mentions digest — ${byClient.length} client${
    byClient.length === 1 ? "" : "s"
  }`;
  const text = buildText(byClient);
  const html = buildHtml(byClient);

  const result = await sendMail({
    to: [recipient],
    subject,
    text,
    html,
  });

  await setSetting("mention_digest_runner.last_run", Date.now());

  if (!result.ok) return { sent: 0, reason: result.error };
  return { sent: 1 };
}

function buildText(
  rows: {
    name: string;
    positive: number;
    neutral: number;
    negative: number;
    items: { source: string; title: string; url: string; sentiment: number }[];
  }[],
): string {
  const lines: string[] = [
    "Weekly brand-mentions digest",
    "============================",
    "",
  ];
  for (const r of rows) {
    lines.push(
      `${r.name} — ${r.positive} positive, ${r.neutral} neutral, ${r.negative} negative`,
    );
    for (const it of r.items) {
      const tag =
        it.sentiment > 0 ? "[+]" : it.sentiment < 0 ? "[-]" : "[ ]";
      lines.push(`  ${tag} (${it.source}) ${it.title.slice(0, 100)}`);
      lines.push(`     ${it.url}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function buildHtml(
  rows: {
    name: string;
    positive: number;
    neutral: number;
    negative: number;
    items: { source: string; title: string; url: string; sentiment: number }[];
  }[],
): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const sections = rows
    .map((r) => {
      const items = r.items
        .map((it) => {
          const tone =
            it.sentiment > 0 ? "#10b981" : it.sentiment < 0 ? "#f87171" : "#9ca3af";
          return `<li style="margin:.4rem 0">
  <span style="color:${tone};font-weight:600">●</span>
  <span style="color:#6b7280;font-size:.85em">[${esc(it.source)}]</span>
  <a href="${esc(it.url)}" style="color:#111;text-decoration:none">${esc(it.title.slice(0, 120))}</a>
</li>`;
        })
        .join("");
      return `<section style="margin:1.5rem 0">
  <h2 style="margin:0 0 .25rem">${esc(r.name)}</h2>
  <div style="color:#6b7280;font-size:.9em">
    ${r.positive} positive · ${r.neutral} neutral · ${r.negative} negative
  </div>
  <ul style="padding-left:1rem;margin:.5rem 0 0;list-style:none">${items}</ul>
</section>`;
    })
    .join("");

  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:680px;margin:1rem auto;color:#111;line-height:1.5">
<h1 style="font-size:1.4rem;margin:0 0 1rem">Weekly brand-mentions digest</h1>
${sections}
<p style="color:#6b7280;font-size:.8em;margin-top:2rem">Auto-generated by your SEO tool. <em>Reply to manage.</em></p>
</body></html>`;
}
