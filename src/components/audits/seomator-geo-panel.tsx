import { Sparkles } from "lucide-react";
import { categoryLabel } from "@/lib/seomator-meta";

type CategoryScores = Record<
  string,
  { score: number; pass: number; warn: number; fail: number }
>;

type GeoIssue = {
  type: string;
  severity: string;
  message: string;
  url: string;
};

export function SeomatorGeoPanel({
  categoryScores,
  geoIssues,
}: {
  categoryScores: CategoryScores | null | undefined;
  geoIssues: GeoIssue[];
}) {
  const geo = categoryScores?.geo;
  if (!geo && geoIssues.length === 0) return null;

  const fails = geoIssues.filter((i) =>
    ["critical", "high"].includes(i.severity),
  );
  const warns = geoIssues.filter((i) =>
    ["medium", "low"].includes(i.severity),
  );

  return (
    <section className="rounded-2xl border border-violet-500/25 bg-gradient-to-br from-violet-500/10 via-card/40 to-card/40 px-5 py-4 backdrop-blur-md">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/20 ring-1 ring-violet-400/30">
          <Sparkles className="size-5 text-violet-200" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-tight">
            AI / GEO readiness
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {categoryLabel("geo")} — llms.txt, semantic structure, and AI bot
            access (same category as SEOmator demo audits).
          </p>
          {geo ? (
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5">
                Score{" "}
                <span className="font-semibold tabular-nums text-violet-200">
                  {geo.score}/100
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {geo.pass} passed · {geo.warn} warnings · {geo.fail} failed
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {geoIssues.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {[...fails, ...warns].slice(0, 8).map((issue) => (
            <li
              key={`${issue.type}:${issue.url}:${issue.message.slice(0, 40)}`}
              className="rounded-xl border border-white/5 bg-black/20 px-3 py-2 text-xs"
            >
              <div className="font-medium text-foreground">{issue.message}</div>
              <div className="mt-0.5 truncate text-muted-foreground">
                {issue.url}
              </div>
            </li>
          ))}
          {geoIssues.length > 8 ? (
            <li className="text-xs text-muted-foreground">
              + {geoIssues.length - 8} more GEO findings in the issue list below.
            </li>
          ) : null}
        </ul>
      ) : geo ? (
        <p className="mt-4 text-xs text-emerald-200/90">
          No open GEO issues — category checks passed on crawled pages.
        </p>
      ) : null}
    </section>
  );
}
