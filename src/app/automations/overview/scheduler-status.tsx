import { CheckCircle2, CircleDashed, Loader2, TriangleAlert } from "lucide-react";
import { schedulerStatus } from "@/lib/scheduler";

function ago(ts: number | null): string {
  if (!ts) return "never";
  const mins = Math.round((Date.now() - ts) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function every(ms: number): string {
  const hours = ms / 3_600_000;
  if (hours >= 24) return `every ${Math.round(hours / 24)}d`;
  if (hours >= 1) return `every ${Math.round(hours)}h`;
  return `every ${Math.round(ms / 60_000)}m`;
}

/**
 * Live state of every background runner.
 *
 * Worth showing because "is the automation actually running?" was
 * previously unanswerable: the runners fired from a dashboard page
 * render, so they only ran when someone was looking, and there was
 * nothing to check. A user whose scheduled reports stopped arriving had
 * no way to tell whether the feature was broken, misconfigured, or
 * simply never triggered.
 */
export async function SchedulerStatusPanel() {
  let rows: Awaited<ReturnType<typeof schedulerStatus>> = [];
  try {
    rows = await schedulerStatus();
  } catch {
    return null;
  }

  const anyNeverRun = rows.some((r) => r.lastFinishedAt === null);

  return (
    <section className="glass-apple relative overflow-hidden rounded-2xl">
      <header className="border-b border-white/[0.06] px-5 py-3">
        <h2 className="text-sm font-semibold">Background scheduler</h2>
        <p className="text-[11px] text-muted-foreground">
          These run on a timer inside the server — they don&apos;t need
          anyone to have the app open.
          {anyNeverRun &&
            " Anything showing “never” will run within a few minutes of the server starting."}
        </p>
      </header>

      <ul className="divide-y divide-white/[0.06]">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              {r.lastError ? (
                <TriangleAlert className="size-4 shrink-0 text-rose-300" />
              ) : r.running ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-cyan-300" />
              ) : r.lastFinishedAt ? (
                <CheckCircle2 className="size-4 shrink-0 text-emerald-300" />
              ) : (
                <CircleDashed className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0">
                <span className="block truncate">{r.label}</span>
                {r.lastError && (
                  <span className="block truncate text-[11px] text-rose-300/80">
                    {r.lastError}
                  </span>
                )}
              </span>
            </span>
            <span className="shrink-0 text-right text-[11px] text-muted-foreground">
              <span className="block">
                {r.running ? "running now" : ago(r.lastFinishedAt)}
              </span>
              <span className="block opacity-60">{every(r.everyMs)}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
