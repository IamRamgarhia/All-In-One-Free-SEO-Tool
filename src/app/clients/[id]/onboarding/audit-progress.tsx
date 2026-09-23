"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { getAuditProgress, type AuditProgress } from "./actions";

/**
 * Live state of the site crawl that starts the moment a client is added.
 *
 * It runs in the background so the wizard stays usable, but background is
 * not the same as invisible: without this the user spends the whole wizard
 * unaware that anything is happening, then wonders why an audit appeared.
 */
export function AuditProgressBar({ clientId }: { clientId: number }) {
  const [p, setP] = useState<AuditProgress | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    async function tick() {
      try {
        const next = await getAuditProgress(clientId);
        if (!alive) return;
        setP(next);
        // Stop polling once there is nothing left to watch, rather than
        // hammering the DB for the rest of the session.
        if (next.status === "running" || next.status === "queued") {
          timer = setTimeout(tick, 2000);
        }
      } catch {
        // Transient — try again rather than leaving a dead bar on screen.
        if (alive) timer = setTimeout(tick, 5000);
      }
    }
    void tick();

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [clientId]);

  if (!p || p.status === "none") return null;

  const running = p.status === "running" || p.status === "queued";
  // Cap at 95% while running: hitting 100% before the findings are scored
  // would claim it is finished when it isn't.
  const pct = running
    ? Math.min(95, Math.round((p.pagesCrawled / p.maxPages) * 100))
    : 100;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center gap-2 text-sm">
        {running && <Loader2 className="size-4 animate-spin text-violet-300" />}
        {p.status === "completed" && (
          <CheckCircle2 className="size-4 text-emerald-400" />
        )}
        {p.status === "failed" && (
          <TriangleAlert className="size-4 text-amber-400" />
        )}
        <span className="font-medium">
          {running && "Checking your site…"}
          {p.status === "completed" && "Site check done"}
          {p.status === "failed" && "Couldn’t finish the site check"}
        </span>
        {running && p.pagesCrawled > 0 && (
          <span className="text-xs text-muted-foreground">
            {p.pagesCrawled} {p.pagesCrawled === 1 ? "page" : "pages"} so far
          </span>
        )}
      </div>

      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            p.status === "failed"
              ? "bg-amber-400/60"
              : p.status === "completed"
                ? "bg-emerald-400/70"
                : "bg-violet-400/70"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {running &&
          "This runs in the background — carry on with the steps below, it’ll be ready by the time you finish."}
        {p.status === "completed" &&
          `Found ${p.issuesCount} ${p.issuesCount === 1 ? "thing" : "things"} to look at${
            p.score !== null ? `, health score ${p.score}/100` : ""
          }. It’s all in the report at the end.`}
        {p.status === "failed" &&
          "The site may have been unreachable. You can re-run it from the client page — the rest of onboarding still works."}
      </p>
    </div>
  );
}
