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

export const dynamic = "force-dynamic";

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
  const raw: Omit<StepperStep, "status">[] = [
    {
      id: "ai",
      icon: Bot,
      title: "Connect an AI provider",
      description:
        "Free Gemini or Groq is plenty. Powers chat, executive summaries, content generation, OCR, AI visibility.",
      href: "/settings#ai",
    },
    {
      id: "client",
      icon: Users,
      title: "Add your first client",
      description:
        "Paste a URL — we'll auto-detect tech stack, niche, and generate a 30-day task plan.",
      href: "/clients/new",
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
      id: "audit",
      icon: ClipboardList,
      title: "Run your first audit",
      description:
        "30 SEO checks, severity-classified, with one-click fixes via the WordPress bridge.",
      href: "/audits",
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
