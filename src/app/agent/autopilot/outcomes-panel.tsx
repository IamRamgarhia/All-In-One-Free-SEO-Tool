import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Clock, Info, Minus } from "lucide-react";
import { measureFixOutcomes } from "@/lib/fix-outcomes-data";
import type { FixOutcome } from "@/lib/fix-outcomes";

/**
 * "Did the agent's changes actually help?"
 *
 * The page already showed everything the agent HAS changed. That is a
 * record of activity. This is the only place in the product that says
 * what the activity did — and before this nothing in the codebase
 * linked an applied change to search performance at all.
 *
 * Deliberately shows declines in the same list, at the top, in the same
 * typeface. A panel that surfaced only improvements would be worth
 * nothing in either direction: the reason to measure is to catch a
 * change that hurt while it is still cheap to revert.
 */
export async function OutcomesPanel({
  clients,
}: {
  clients: { id: number; name: string }[];
}) {
  const reports = await Promise.all(
    clients.map(async (c) => ({
      client: c,
      report: await measureFixOutcomes(c.id).catch(() => null),
    })),
  );

  const withSomething = reports.filter(
    (r) => r.report && (r.report.outcomes.length > 0 || r.report.unavailable),
  );
  if (withSomething.length === 0) return null;

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card/40 p-4">
      <div>
        <h2 className="text-sm font-medium">Did these changes help?</h2>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          Each confirmed change compared against the same page&apos;s Search
          Console numbers for the 28 days before and after. Measurements, not
          attributions — Google, your competitors and the season all moved in
          the same period.
        </p>
      </div>

      {withSomething.map(({ client, report }) => (
        <div key={client.id} className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-medium">{client.name}</p>

          {report!.unavailable ? (
            /* NOT an empty state. "Your changes did nothing" and "we
               cannot see your Search Console" must never render the
               same, and on this install every client is the latter. */
            <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 size-3 shrink-0" />
              {report!.unavailable}
            </p>
          ) : (
            <>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {report!.rollup.summary}
              </p>
              {report!.outcomes.length > 0 && (
                <ul className="space-y-1.5">
                  {report!.outcomes.slice(0, 8).map((o) => (
                    <Row key={o.actionId} outcome={o} />
                  ))}
                </ul>
              )}
              {report!.outcomes.length > 8 && (
                <p className="text-[11px] text-muted-foreground">
                  and {report!.outcomes.length - 8} more.{" "}
                  <Link
                    href={`/clients/${client.id}`}
                    className="rounded text-foreground underline decoration-dotted underline-offset-2 hover:decoration-solid"
                  >
                    See the client
                  </Link>
                </p>
              )}
            </>
          )}
        </div>
      ))}
    </section>
  );
}

function Row({ outcome: o }: { outcome: FixOutcome }) {
  const Icon =
    o.confidence !== "measured"
      ? Clock
      : o.clicksDelta > 0
        ? ArrowUpRight
        : o.clicksDelta < 0
          ? ArrowDownRight
          : Minus;

  const tone =
    o.confidence !== "measured"
      ? "text-muted-foreground"
      : o.clicksDelta > 0
        ? "text-emerald-400"
        : o.clicksDelta < 0
          ? "text-red-400"
          : "text-muted-foreground";

  return (
    <li className="flex min-w-0 items-start gap-2">
      <Icon className={`mt-0.5 size-3.5 shrink-0 ${tone}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium">
          {o.kind.replace(/_/g, " ")} · {shortUrl(o.url)}
        </p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {o.summary}
        </p>
      </div>
    </li>
  );
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname === "/" ? u.hostname : u.pathname;
  } catch {
    return url;
  }
}
