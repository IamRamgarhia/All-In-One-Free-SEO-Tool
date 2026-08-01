import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { InstallActions } from "./install-actions";

export const dynamic = "force-dynamic";

export default function InstallPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" /> Back to settings
      </Link>

      <PageHeader
        title="Install as an app"
        description="Make SEO Tool launch like a native app — own window, Start Menu entry, optional taskbar pin, and a desktop icon that works even after you've stopped the server."
        icon={Download}
        accent="violet"
      />

      <InstallActions />

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-[14px] font-semibold text-foreground">
          What each option does
        </h2>
        <dl className="mt-3 space-y-3 text-[13px] text-muted-foreground">
          <div>
            <dt className="font-medium text-foreground">Install as PWA</dt>
            <dd className="mt-0.5">
              Opens the app in its own window without browser chrome. Auto-adds
              an entry to your Start Menu. Right-click that entry → Pin to
              taskbar for one-click access. Needs Chrome, Edge, or Brave.
              Requires the server to be running.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">
              Desktop &amp; Start Menu shortcut
            </dt>
            <dd className="mt-0.5">
              Adds a launcher icon that starts the server <em>and</em> opens
              the browser — works even when the server is currently off. This
              is what you want if you ever close the server and need to come
              back later.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Restart / stop</dt>
            <dd className="mt-0.5">
              The power button in the bottom-right corner of every page lets
              you restart or cleanly stop the server. Use restart if the app
              feels stuck; stop when you&apos;re done for the day.
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
