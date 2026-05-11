import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Bug,
  Server,
  Globe,
  Cpu,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { listErrors } from "@/lib/error-log";
import { resolveErrorAction, clearResolvedAction } from "./actions";
import { ErrorRowControls } from "./row-controls";
import { ErrorRow } from "./error-row";

export const dynamic = "force-dynamic";

const SOURCE_META = {
  server: {
    icon: Server,
    label: "Server",
    tone: "text-rose-300 bg-rose-500/10 ring-rose-500/30",
  },
  client: {
    icon: Globe,
    label: "Browser",
    tone: "text-amber-300 bg-amber-500/10 ring-amber-500/30",
  },
  worker: {
    icon: Cpu,
    label: "Worker",
    tone: "text-violet-300 bg-violet-500/10 ring-violet-500/30",
  },
} as const;

export default async function ErrorsPage() {
  const errors = await listErrors({ limit: 200, includeResolved: false });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" /> Back to settings
      </Link>

      <PageHeader
        title="Error log"
        description="Every server-side exception, browser error, and worker failure in one place. Use the Copy button to grab a GitHub-issue-ready bundle. Auto-dedupes — same error counts up instead of spamming. Resolved errors don't show here; clear them when you've fixed them."
        icon={Bug}
        accent="rose"
        actions={
          <form action={clearResolvedAction}>
            <button
              type="submit"
              className="inline-flex h-8 items-center rounded-md bg-white/5 px-3 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10 hover:text-foreground"
            >
              Clear all resolved
            </button>
          </form>
        }
      />

      {errors.length === 0 ? (
        <section className="glass-apple rounded-2xl px-8 py-16 text-center">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-xl bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/30">
            <CheckCircle2 className="size-6 text-emerald-300" />
          </div>
          <h2 className="text-base font-semibold">No errors. Nice.</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            When something throws — a failed audit, a flaky AI provider, a JS
            error in the browser — it shows up here. You'll see what
            happened, how often, when, and a copy-as-GitHub-issue button.
          </p>
        </section>
      ) : (
        <div className="space-y-3">
          {errors.map((e) => {
            const sourceMeta = SOURCE_META[e.source];
            const SourceIcon = sourceMeta.icon;
            return (
              <section
                key={e.id}
                className="glass-apple relative overflow-hidden rounded-2xl"
              >
                <header className="border-b border-white/[0.06] px-5 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${sourceMeta.tone}`}
                      >
                        <SourceIcon className="size-3" />
                        {sourceMeta.label}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {e.context}
                      </span>
                      {e.occurrences > 1 && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-300 ring-1 ring-inset ring-rose-500/30">
                          ×{e.occurrences}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {e.lastSeenAt.toLocaleString()}
                    </div>
                  </div>
                </header>
                <div className="space-y-2 p-5">
                  <ErrorRow error={e} />
                  <ErrorRowControls error={e} resolveAction={resolveErrorAction} />
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
