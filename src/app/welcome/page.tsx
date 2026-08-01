/**
 * First-run onboarding screen. Visualizes the same workspace-state
 * progression as the NextStep widget but as a full-page stepper so the
 * user sees the whole journey at once. Reachable any time via /welcome
 * — also linked from settings.
 *
 * Steps mark themselves "done" automatically based on workspace state.
 * The first non-done step is "active" and gets a Start CTA.
 */

import { count } from "drizzle-orm";
import {
  Bot,
  ClipboardList,
  FileDown,
  Plug,
  Search,
  Users,
} from "lucide-react";
import { db } from "@/db/client";
import {
  audits,
  clients,
  keywords,
  reportArchives,
} from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { Stepper, type StepperStep } from "@/components/ui/stepper";
import { configuredProviders } from "@/lib/api-keys";
import { getGoogleConnectionStatus } from "@/lib/google-oauth";
import { setSetting } from "@/lib/settings-store";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function dismissAndGoHome() {
  "use server";
  await setSetting("onboarding.dismissed_at", new Date().toISOString());
  redirect("/");
}

export default async function WelcomePage() {
  const [
    providers,
    [{ value: clientCount }],
    gStatus,
    [{ value: auditCount }],
    [{ value: keywordCount }],
    [{ value: reportCount }],
  ] = await Promise.all([
    configuredProviders().catch(() => ({ ids: [], byId: {} })),
    db.select({ value: count() }).from(clients),
    getGoogleConnectionStatus().catch(() => ({
      configured: false,
      connected: false,
      credentialsSet: false,
    })),
    db.select({ value: count() }).from(audits),
    db.select({ value: count() }).from(keywords),
    db.select({ value: count() }).from(reportArchives),
  ]);

  // Build the step list, then mark the first non-done one "active".
  //
  // Order matters. This used to open with "Connect an AI provider",
  // which asked a brand-new user for a credential before showing them
  // anything — backwards from the product's own principle of value
  // before asking for anything. The audit engine needs no AI at all, so
  // the first step is now something that produces a real result in a
  // minute, and the AI key is offered afterwards as an upgrade to work
  // the user has already seen.
  const raw: Omit<StepperStep, "status">[] = [
    {
      id: "client",
      icon: Users,
      title: "Add your first site",
      description:
        "Just paste a URL. We detect the tech stack and niche, and build a 30-day task plan. No account setup, no keys.",
      href: "/clients/new",
    },
    {
      id: "audit",
      icon: ClipboardList,
      title: "Run your first audit",
      description:
        "40+ checks, sorted by severity, in about a minute. This works with nothing else configured — it's the fastest way to see whether the tool is useful to you.",
      href: "/audits",
    },
    {
      id: "ai",
      icon: Bot,
      title: "Add an AI provider (optional)",
      description:
        "Turns audit findings into plain-English explanations and fixes, and unlocks chat, exec summaries and content tools. Gemini and Groq have free tiers.",
      href: "/settings#ai",
    },
    {
      id: "google",
      icon: Plug,
      title: "Connect Google (GSC + GA4)",
      description:
        "Optional but high-leverage. Real keyword data, organic traffic, conversion tracking. Each client picks its own properties.",
      href: "/settings/google",
    },
    {
      id: "keywords",
      icon: Search,
      title: "Track keywords",
      description:
        "Daily rank checks in browser mode (free). Mobile + desktop, per-city if local SEO.",
      href: "/keywords",
    },
    {
      id: "report",
      icon: FileDown,
      title: "Generate a report",
      description:
        "White-labeled PDF, AI-written exec summary, work-completed log. Schedule to send monthly.",
      href: "/reports",
    },
  ];

  const isDone: Record<string, boolean> = {
    ai: providers.ids.length > 0,
    client: clientCount > 0,
    google: gStatus.configured,
    audit: auditCount > 0,
    keywords: keywordCount > 0,
    report: reportCount > 0,
  };

  let activeAssigned = false;
  const steps: StepperStep[] = raw.map((s) => {
    if (isDone[s.id]) return { ...s, status: "done" };
    if (!activeAssigned) {
      activeAssigned = true;
      return { ...s, status: "active" };
    }
    return { ...s, status: "pending" };
  });

  const doneCount = steps.filter((s) => s.status === "done").length;
  const total = steps.length;
  const percent = Math.round((doneCount / total) * 100);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Get started"
        description="Each step unlocks more of the tool. You can skip any step and come back to it later — but doing them in order works best."
        icon={Bot}
        accent="violet"
      />

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[12px]">
          <span className="font-medium text-foreground">
            {doneCount} of {total} complete
          </span>
          <span className="text-muted-foreground tabular-nums">{percent}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <section className="rounded-lg border border-border bg-card p-6">
        <Stepper steps={steps} />
      </section>

      {/* Skip-and-explore escape hatch. Honors "value before asking for
          anything" — the user can dismiss the gate at any step and the
          dashboard will stop redirecting them here on every visit. They
          can still come back to /welcome any time from the nav. */}
      <form action={dismissAndGoHome} className="flex justify-center">
        <button
          type="submit"
          className="text-[12px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Skip for now and explore the dashboard →
        </button>
      </form>

      {doneCount === total && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-[13px]">
          <div className="font-semibold text-emerald-300">
            You&apos;re fully set up.
          </div>
          <p className="mt-1 text-muted-foreground">
            Every tool is now connected and ready. Head back to the dashboard
            and let the daily agent surface what needs your attention.
          </p>
        </div>
      )}
    </div>
  );
}
