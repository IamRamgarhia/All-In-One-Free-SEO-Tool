import { CheckCircle2, ChevronRight, Clock, XCircle } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
// daily-report, not daily-agent: the latter reaches every job it runs,
// and importing it here would flip this page to `needsAI: required` in
// the capability table. See lib/daily-report.ts.
import {
  decodeSourceCounts,
  readDailyReport,
  stepMessageKey,
  type StoredDailyStep,
} from "@/lib/daily-report";

/**
 * What the nightly sweep actually did, job by job.
 *
 * Ported from upstream. The sweep runs about twenty jobs and every
 * result used to be discarded — only a timestamp was stored — so an
 * install where they all failed looked identical to one where none did.
 *
 * Failures first, with the raw error; successes behind a disclosure,
 * each with what it found ("Mots-clés vérifiés : 8"), because a green
 * tick alone cannot tell a job that worked from one that did nothing.
 */
export async function NightlyJobs() {
  const report = await readDailyReport().catch(() => null);
  const t = await getTranslations("nightlyJobs");
  const locale = await getLocale();
  // Loose views of the same translator, for keys built at run time.
  const tLoose = t as unknown as {
    (key: string, values?: Record<string, string | number>): string;
    has: (key: string) => boolean;
  };
  const tSource = (await getTranslations("rankSource")) as unknown as {
    (key: string): string;
    has: (key: string) => boolean;
  };

  if (!report) {
    // Deliberately not an all-clear: "no sweep recorded" and "every job
    // worked" must never render the same.
    return (
      <section
        id="nightly-jobs"
        className="scroll-mt-20 rounded-lg border border-border bg-card p-4 sm:p-5"
      >
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{t("neverTitle")}</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t("neverBody")}</p>
          </div>
        </div>
      </section>
    );
  }

  const failed = report.steps.filter((s) => !s.ok);
  const ok = report.steps.filter((s) => s.ok);
  const mins = Math.round(report.durationMs / 60000);
  const at = new Date(report.at);
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" });
  const list = new Intl.ListFormat(locale, { style: "long", type: "conjunction" });

  const stepName = (name: string) => {
    const key = `steps.${stepMessageKey(name)}`;
    return tLoose.has(key) ? tLoose(key) : name;
  };

  // A source id ("scrape") in the viewer's words ("Google (navigateur)").
  const sourceLabel = (id: string) => {
    const key = `${id === "scrape" ? "google" : id}.label`;
    return tSource.has(key) ? tSource(key) : id;
  };

  const noteText = (s: StoredDailyStep): string => {
    if (!s.note) return t("noNote");
    const key = `notes.${s.note.key}`;
    if (!tLoose.has(key)) return t("noNote");
    const params = { ...(s.note.params ?? {}) };
    if (typeof params.sources === "string") {
      params.sources = list.format(
        decodeSourceCounts(params.sources).map(({ source, count }) =>
          t("sourceCount", { source: sourceLabel(source), count }),
        ),
      );
    }
    return tLoose(key, params);
  };

  const seconds = (ms: number) => Math.round(ms / 1000);
  const duration = (ms: number) => {
    const total = seconds(ms);
    return total < 60
      ? t("seconds", { count: total })
      : t("minutesSeconds", { minutes: Math.floor(total / 60), seconds: total % 60 });
  };

  return (
    <section
      id="nightly-jobs"
      className="scroll-mt-20 space-y-3 rounded-lg border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold">
          {t("title")}
          {" · "}
          <span className={failed.length > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}>
            {failed.length > 0
              ? t("someFailed", { failed: failed.length, total: report.steps.length })
              : t("allOk", { total: report.steps.length })}
          </span>
        </h2>
        <span className="text-xs text-muted-foreground">
          {t("meta", {
            date: Number.isFinite(at.getTime()) ? dateTime.format(at) : "—",
            duration: mins < 1 ? t("underMinute") : t("minutes", { count: mins }),
          })}
        </span>
      </div>

      {failed.length > 0 && (
        <ul className="space-y-3">
          {failed.map((s) => (
            <li key={s.name} className="flex min-w-0 items-start gap-2">
              <XCircle className="mt-0.5 size-3.5 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-medium leading-snug">{stepName(s.name)}</p>
                {s.error && (
                  <p className="mt-1 break-all rounded bg-muted/50 px-2 py-1 font-mono text-[11px] leading-relaxed text-muted-foreground">
                    {t("error", { detail: s.error })}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {ok.length > 0 && (
        <details className={`group ${failed.length > 0 ? "border-t border-border pt-3" : ""}`}>
          <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-3.5 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
            {t("showOk", { count: ok.length })}
          </summary>
          <ul className="mt-2 space-y-2">
            {ok.map((s) => (
              <li key={s.name} className="flex min-w-0 items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-xs font-medium leading-snug">
                    {stepName(s.name)}
                    {seconds(s.durationMs) >= 1 && (
                      <span className="font-normal text-muted-foreground">
                        {" · "}
                        {duration(s.durationMs)}
                      </span>
                    )}
                  </p>
                  {/* What the job found, in the viewer's language: the
                      difference between knowing it ran and knowing what
                      it did. */}
                  <p className="break-words text-xs leading-relaxed text-muted-foreground">{noteText(s)}</p>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
