import { CheckCircle2, Clock, XCircle } from "lucide-react";
// daily-report, not daily-agent: the latter reaches every job it runs,
// and importing it here flipped this page to `needsAI: required` in the
// capability table. See lib/daily-report.ts.
import { readDailyReport } from "@/lib/daily-report";

/**
 * What the nightly sweep actually did, job by job.
 *
 * The sweep runs 24 jobs and every result used to be discarded — only
 * a timestamp was stored, the scheduler runner had no `summarise`, and
 * no screen in the app showed a step. An install where twenty of them
 * failed every night was indistinguishable from one where none did.
 *
 * This is the page that makes "~20 automated jobs every day" a checkable
 * statement rather than a promise. Failures first, with the line the job
 * itself wrote — "checked 12 keywords, 18 could not be read" is the
 * sentence that tells someone what is happening, and reducing it to a
 * red cross would throw away the only useful part.
 */
export async function NightlyJobs() {
  const report = await readDailyReport().catch(() => null);

  if (!report) {
    return (
      <section className="rounded-xl border border-border bg-card/40 p-4">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-medium">
              The nightly sweep has not finished yet
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              It runs once every 24 hours and does about two dozen jobs — rank
              checks, audit refreshes, robots and sitemap watches, traffic-drop
              alerts, competitor and brand monitoring. Nothing here means it has
              not completed since this record started being kept, not that
              anything is wrong.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const failed = report.steps.filter((s) => !s.ok);
  const ok = report.steps.filter((s) => s.ok);
  const mins = Math.round(report.durationMs / 60000);

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">
          Nightly jobs — {ok.length} of {report.steps.length} ok
        </h2>
        <span className="text-[11px] text-muted-foreground">
          {new Date(report.at).toLocaleString()} · took{" "}
          {mins < 1 ? "under a minute" : `${mins} min`}
        </span>
      </div>

      {failed.length > 0 && (
        <ul className="space-y-1.5">
          {failed.map((s) => (
            <li key={s.name} className="flex min-w-0 items-start gap-2">
              <XCircle className="mt-0.5 size-3.5 shrink-0 text-red-400" />
              <div className="min-w-0">
                <p className="font-mono text-[11px] font-medium">{s.name}</p>
                {s.detail && (
                  <p className="break-words text-[11px] leading-relaxed text-muted-foreground">
                    {s.detail}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {ok.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground hover:text-foreground">
            {failed.length > 0 ? `and ${ok.length} that worked` : "Show all"}
          </summary>
          <ul className="mt-2 space-y-1">
            {ok.map((s) => (
              <li key={s.name} className="flex min-w-0 items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-emerald-400/70" />
                <div className="min-w-0">
                  <p className="font-mono text-[11px]">{s.name}</p>
                  {/* The job's own sentence. This is where "every keyword
                      has a reading from the last 7 days" or "no clients"
                      lives, and it is the difference between knowing the
                      automation ran and knowing what it found. */}
                  {s.detail && (
                    <p className="break-words text-[11px] leading-relaxed text-muted-foreground">
                      {s.detail}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
