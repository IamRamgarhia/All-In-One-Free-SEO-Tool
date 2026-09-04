/**
 * Workspace-state-aware "what to do next" pill. Lives in the topbar so it
 * follows the user across every page. Server-rendered: reads minimal
 * workspace state, picks the most-impactful unfinished step, renders a
 * one-line CTA that links to the right page.
 *
 * The list is intentionally ordered: a user without an AI provider should
 * NEVER be told to "run an audit" first — that misses the point.
 */

import Link from "next/link";
import { cookies } from "next/headers";
import { count, eq, gte } from "drizzle-orm";
import { ArrowRight, Sparkles } from "lucide-react";
import { db } from "@/db/client";
import {
  clients,
  audits,
  keywords,
  reportArchives,
  tasks,
} from "@/db/schema";
import { configuredProviders } from "@/lib/api-keys";
import { getAiAvailability } from "@/lib/ai-availability";
import { getGoogleConnectionStatus } from "@/lib/google-oauth";
import { NextStepDismissButton } from "./next-step-dismiss";

const DISMISS_COOKIE_PREFIX = "next-step-dismissed-";

type Step = {
  id: string;
  href: string;
  label: string;
  detail: string;
  primary?: boolean;
};

async function isDismissed(stepId: string): Promise<boolean> {
  try {
    const store = await cookies();
    return store.get(`${DISMISS_COOKIE_PREFIX}${stepId}`)?.value === "1";
  } catch {
    return false;
  }
}

/**
 * Wrap a step so the picker can `await maybe(step)` and have it
 * silently swap to the fallback when the user has dismissed it.
 * The next priority tier in the chain takes over automatically.
 */
async function maybe(step: Step | null): Promise<Step | null> {
  if (!step) return null;
  if (await isDismissed(step.id)) return null;
  return step;
}

async function pickNextStep(): Promise<Step | null> {
  // 1. AI provider — without it most tools degrade. Highest priority.
  //
  // Asks whether AI is available at all, not whether a key exists: a
  // connected Claude or ChatGPT subscription drives the same tools, and
  // testing only for keys kept telling people to set up something they
  // had already set up.
  const { available: aiAvailable } = await getAiAvailability().catch(() => ({
    available: false,
    hasKey: false,
    hasSubscription: false,
    client: null,
  }));
  if (!aiAvailable) {
    const s = await maybe({
      id: "ai",
      href: "/settings#ai",
      label: "Connect an AI provider",
      detail: "Free Gemini or Groq — takes 2 min",
      primary: true,
    });
    if (s) return s;
  }

  // 2. At least one client
  const [{ value: clientCount }] = await db
    .select({ value: count() })
    .from(clients);
  if (clientCount === 0) {
    const s = await maybe({
      id: "client",
      href: "/clients/new",
      label: "Add your first client",
      detail: "Their site URL is all you need to start",
      primary: true,
    });
    if (s) return s;
  }

  // 3. Google connection (workspace-wide). Skippable but worth surfacing.
  const gStatus = await getGoogleConnectionStatus().catch(() => ({
    configured: false,
    connected: false,
    credentialsSet: false,
  }));
  if (!gStatus.configured) {
    const s = await maybe({
      id: "google",
      href: "/settings/google",
      label: "Connect Google (GSC + GA4)",
      detail: "Real keyword + traffic data, one-time setup",
    });
    if (s) return s;
  }

  // 4. First audit
  const [{ value: auditCount }] = await db
    .select({ value: count() })
    .from(audits);
  if (auditCount === 0) {
    const s = await maybe({
      id: "audit",
      href: "/audits",
      label: "Run your first audit",
      detail: "Site-wide scan, ~2 minutes",
      primary: true,
    });
    if (s) return s;
  }

  // 5. First keyword tracked
  const [{ value: keywordCount }] = await db
    .select({ value: count() })
    .from(keywords);
  if (keywordCount === 0) {
    const s = await maybe({
      id: "keywords",
      href: "/keywords",
      label: "Track your first keyword",
      detail: "Daily rank checks, free via browser mode",
    });
    if (s) return s;
  }

  // 6. First report — closes the loop on the value prop
  const [{ value: reportCount }] = await db
    .select({ value: count() })
    .from(reportArchives);
  if (reportCount === 0) {
    const s = await maybe({
      id: "report",
      href: "/reports",
      label: "Generate your first report",
      detail: "PDF, white-labeled, AI summary",
    });
    if (s) return s;
  }

  // 7. Open tasks → highlight if there are any
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [openTasks] = await db
    .select({ value: count() })
    .from(tasks)
    .where(eq(tasks.status, "todo"));
  const [recentlyDone] = await db
    .select({ value: count() })
    .from(tasks)
    .where(gte(tasks.updatedAt, since));
  if ((openTasks?.value ?? 0) > 0 && (recentlyDone?.value ?? 0) < 1) {
    const s = await maybe({
      id: "tasks",
      href: "/tasks",
      label: `${openTasks?.value} open task${openTasks?.value === 1 ? "" : "s"}`,
      detail: "Pick one to work on",
    });
    if (s) return s;
  }

  // Everything bootstrapped (or all suggestions dismissed) — suggest
  // the daily-flow page. Also dismissable.
  return await maybe({
    id: "morning",
    href: "/morning",
    label: "Daily briefing",
    detail: "Today's priorities across all clients",
  });
}

export async function NextStep() {
  let step: Step | null = null;
  try {
    step = await pickNextStep();
  } catch {
    step = null;
  }
  if (!step) return null;

  return (
    <div
      className={`hidden items-center gap-1 rounded-md border pr-1 text-[12px] transition-colors md:inline-flex ${
        step.primary
          ? "border-primary/40 bg-primary/10 text-foreground"
          : "border-border bg-card text-muted-foreground"
      }`}
    >
      <Link
        href={step.href}
        title={step.detail}
        className={`flex items-center gap-2 px-2.5 py-1 transition-colors ${
          step.primary
            ? "hover:bg-primary/20 hover:text-foreground"
            : "hover:bg-accent hover:text-foreground"
        }`}
      >
        <Sparkles
          className={`size-3 ${step.primary ? "text-primary" : "text-muted-foreground"}`}
        />
        <span className="font-medium">{step.label}</span>
        <span className="hidden text-muted-foreground lg:inline">
          — {step.detail}
        </span>
        <ArrowRight className="size-3 opacity-60" />
      </Link>
      <NextStepDismissButton stepId={step.id} />
    </div>
  );
}
