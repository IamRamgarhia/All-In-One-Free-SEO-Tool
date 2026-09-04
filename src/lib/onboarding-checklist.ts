/**
 * Onboarding checklist — server-side detector. Each step is derived from
 * real database state, not a "completed" flag the user has to toggle, so
 * progress is always accurate and recovers if the user wipes / restores
 * their data.db.
 *
 * Called from the dashboard. Results live for one request (force-dynamic
 * page) so users see ticks update as they complete each step.
 */

import { db } from "@/db/client";
import { audits, clients, reportArchives } from "@/db/schema";
import { count, eq, ne } from "drizzle-orm";
import { getAiAvailability } from "./ai-availability";
import { getGoogleConnectionStatus } from "./google-oauth";

export type ChecklistItem = {
  id: string;
  title: string;
  description: string;
  done: boolean;
  cta: string;
  href: string;
};

export async function getOnboardingChecklist(): Promise<{
  steps: ChecklistItem[];
  done: number;
  total: number;
}> {
  // Run all detection queries in parallel
  const [
    [{ value: clientCount }],
    [{ value: completedAuditCount }],
    [{ value: reportCount }],
    googleStatus,
    aiAvailability,
  ] = await Promise.all([
    db.select({ value: count() }).from(clients),
    db
      .select({ value: count() })
      .from(audits)
      .where(eq(audits.status, "completed")),
    db.select({ value: count() }).from(reportArchives),
    getGoogleConnectionStatus().catch(() => ({ connected: false })),
    getAiAvailability().catch(() => ({
      available: false,
      hasKey: false,
      hasSubscription: false,
      client: null,
    })),
  ]);

  const steps: ChecklistItem[] = [
    {
      id: "ai-provider",
      title: "Add an AI key",
      // Explains why a connected chat app does not tick this.
      //
      // It briefly counted a connected subscription and that was wrong:
      // MCP does not let this app call a model, so the AI pages here
      // still fail. Ticking it would have meant the checklist said
      // "done" about features that do not run. Saying plainly that the
      // subscription is connected but powers a different thing is the
      // honest version, and stops the step reading as a bug.
      description: aiAvailability.hasSubscription
        ? `Your chat app (${aiAvailability.client}) is connected and can read your SEO data — but that works inside Claude, not in here. This app's own AI pages (assistant, summaries, content writer) call a model directly, so they need a key or Ollama.`
        : "Paste a free-tier key (Gemini / Groq / DeepSeek) or run Ollama locally. Unlocks the AI assistant, executive summaries, content writer and code generator.",
      done: aiAvailability.available,
      cta: aiAvailability.available ? "Manage AI" : "Add a key",
      href: "/settings#ai",
    },
    {
      id: "first-client",
      title: "Add your first client",
      description:
        "Paste a domain — we auto-extract brand, logo, NAP, social links, and detect their tech stack in seconds.",
      done: clientCount > 0,
      cta: clientCount > 0 ? "View clients" : "Add client",
      href: clientCount > 0 ? "/clients" : "/clients/new",
    },
    {
      id: "google-oauth",
      title: "Connect Google (GSC + GA4)",
      description:
        "One-click OAuth unlocks real ranking + traffic data. Skip if you only want technical audits — most other tools work without it.",
      done: googleStatus.connected,
      cta: googleStatus.connected ? "Manage" : "Connect Google",
      href: "/settings#google",
    },
    {
      id: "first-audit",
      title: "Run your first audit",
      description:
        "30+ checks for indexability, schema, Core Web Vitals, hreflang, security headers, broken links — local and free.",
      done: completedAuditCount > 0,
      cta: completedAuditCount > 0 ? "View audits" : "Run audit",
      href: "/audits",
    },
    {
      id: "first-report",
      title: "Generate your first report",
      description:
        "AI executive summary + white-label PDF + magic-link client portal. Goes from 6 hours/month to 25 minutes/month.",
      done: reportCount > 0,
      cta: reportCount > 0 ? "View reports" : "Generate report",
      href: "/reports",
    },
  ];

  const done = steps.filter((s) => s.done).length;
  return { steps, done, total: steps.length };
}

// Suppress unused warning on ne — kept for future per-status detections.
void ne;
