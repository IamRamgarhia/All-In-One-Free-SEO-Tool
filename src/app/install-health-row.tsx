import Link from "next/link";
import { AlertTriangle, ArrowRight, Clock, PauseCircle } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { HealthIssue } from "@/lib/install-health";
import { issueText, type IssueText, type LooseT } from "@/lib/install-health-text";
import { stepMessageKey } from "@/lib/daily-report";

/**
 * What the banner and Settings → System health share: one way to word an
 * issue, one way to lay it out. Two surfaces wording the same issue two
 * ways is how they end up disagreeing about it.
 */
export async function getHealthText() {
  const locale = await getLocale();
  const t = (await getTranslations("installHealth")) as unknown as LooseT & {
    has?: (key: string) => boolean;
  };
  const tTools = (await getTranslations("tools.catalog")) as unknown as LooseT & {
    has: (key: string) => boolean;
  };
  const tJobs = (await getTranslations("nightlyJobs.steps")) as unknown as LooseT & {
    has: (key: string) => boolean;
  };
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" });
  const dateOnly = new Intl.DateTimeFormat(locale, { dateStyle: "long" });
  const list = new Intl.ListFormat(locale, { style: "long", type: "conjunction" });

  return {
    t,
    formatCheckedAt: (d: Date) => dateTime.format(d),
    text: (issue: HealthIssue): IssueText =>
      issueText(issue, t, {
        // The catalog's own name for the tool when it has one; the id
        // otherwise, which is still what the tool's URL says.
        toolName: (id) => (tTools.has(`${id}.title`) ? tTools(`${id}.title`) : id),
        formatDate: (iso) => {
          const d = new Date(iso);
          return Number.isFinite(d.getTime()) ? dateOnly.format(d) : "—";
        },
        listFormat: (items) => list.format(items),
        jobName: (name) => {
          const key = stepMessageKey(name);
          return tJobs.has(key) ? tJobs(key) : name;
        },
      }),
  };
}

export function IssueRow({
  issue,
  text,
  withIcon = false,
}: {
  issue: HealthIssue;
  text: IssueText;
  withIcon?: boolean;
}) {
  const Icon =
    issue.severity === "broken" ? AlertTriangle : issue.severity === "stalled" ? PauseCircle : Clock;
  const tone =
    issue.severity === "broken"
      ? "text-red-600 dark:text-red-400"
      : issue.severity === "stalled"
        ? "text-amber-600 dark:text-amber-400"
        : "text-muted-foreground";
  return (
    <li className="flex min-w-0 items-start gap-2">
      {withIcon && <Icon className={`mt-0.5 size-3.5 shrink-0 ${tone}`} aria-hidden />}
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium leading-snug">{text.title}</p>
        <p className="mt-0.5 break-words text-xs leading-relaxed text-muted-foreground">{text.evidence}</p>
        {/* The outside world's answer, verbatim: "rest_no_route" is what
            tells someone the plugin is not activated. */}
        {text.detail && (
          <p className="mt-1 break-all rounded bg-muted/50 px-2 py-1 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {text.detail}
          </p>
        )}
        <Link
          href={issue.fixHref}
          className="mt-1 inline-flex min-h-8 items-center gap-1 text-xs font-medium text-foreground underline decoration-dotted underline-offset-2 hover:decoration-solid"
        >
          {text.fixLabel}
          <ArrowRight className="size-3" aria-hidden />
        </Link>
      </div>
    </li>
  );
}
