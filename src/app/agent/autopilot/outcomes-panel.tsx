import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowDownRight, ArrowUpRight, Clock, Info, Minus } from "lucide-react";
import { measureFixOutcomes, type OutcomeReport } from "@/lib/fix-outcomes-data";
import {
  REPORTING_LAG_DAYS,
  WINDOW_DAYS,
  type Change,
  type FixOutcome,
} from "@/lib/fix-outcomes";

type Tx = Awaited<ReturnType<typeof getTranslations>>;
type Fmt = Awaited<ReturnType<typeof getFormatter>>;

const MAX_ROWS = 8;

/**
 * « Ces changements ont-ils aidé ? » (porté depuis l'auteur, eb10f33).
 *
 * La page montrait déjà ce que l'agent a modifié : c'est un relevé
 * d'activité. Ce panneau dit ce que cette activité a donné, mesuré dans
 * Search Console, sans jamais revendiquer de causalité. Les baisses sont
 * listées en premier, dans la même typographie que les hausses.
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
    (r): r is { client: (typeof clients)[number]; report: OutcomeReport } =>
      !!r.report && (r.report.outcomes.length > 0 || !!r.report.unavailable),
  );
  if (withSomething.length === 0) return null;

  const [tx, tKinds, format] = await Promise.all([
    getTranslations("ui.app_agent_autopilot_outcomes"),
    getTranslations("ui.app_agent_autopilot_panel"),
    getFormatter(),
  ]);

  return (
    <section className="min-w-0 space-y-3 rounded-xl border border-border bg-card/40 p-4">
      <div>
        <h2 className="text-sm font-medium">{tx("title")}</h2>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {tx("intro", { window: WINDOW_DAYS, lag: REPORTING_LAG_DAYS })}
        </p>
      </div>

      {withSomething.map(({ client, report }) => (
        <div key={client.id} className="min-w-0 space-y-2 border-t border-border pt-3">
          <p className="text-xs font-medium">{client.name}</p>

          {report.unavailable ? (
            // Pas un état vide : « vos changements n'ont rien donné » et
            // « nous ne voyons pas votre Search Console » ne doivent
            // jamais s'afficher pareil.
            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span className="min-w-0">
                {report.unavailable.reason === "no_property"
                  ? tx("unavailableNoProperty", { count: report.unavailable.count })
                  : tx("unavailableGsc", { count: report.unavailable.count })}{" "}
                <Link
                  href={`/clients/${client.id}`}
                  className="rounded text-foreground underline decoration-dotted underline-offset-2 hover:decoration-solid"
                >
                  {tx("seeClient")}
                </Link>
              </span>
            </p>
          ) : (
            <>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {rollupText(report, tx, format)}
              </p>
              {report.notRead > 0 && (
                <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                  <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span className="min-w-0">{tx("notRead", { count: report.notRead })}</span>
                </p>
              )}
              <ul className="space-y-2">
                {report.outcomes.slice(0, MAX_ROWS).map((o) => (
                  <Row
                    key={o.actionId}
                    outcome={o}
                    kindLabel={
                      tKinds.has(`kinds.${o.kind}`)
                        ? tKinds(`kinds.${o.kind}`)
                        : o.kind.replace(/^write_/, "").replace(/_/g, " ")
                    }
                    text={rowText(o, tx, format)}
                  />
                ))}
              </ul>
              {report.outcomes.length > MAX_ROWS && (
                <p className="text-xs text-muted-foreground">
                  {tx("andMore", { count: report.outcomes.length - MAX_ROWS })}{" "}
                  <Link
                    href={`/clients/${client.id}`}
                    className="rounded text-foreground underline decoration-dotted underline-offset-2 hover:decoration-solid"
                  >
                    {tx("seeClient")}
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

function signed(format: Fmt, n: number): string {
  return format.number(n, { signDisplay: "exceptZero" });
}

/** Les parties à zéro sont omises du texte ; le séparateur seulement si les deux restent. */
function both(a: number, b: number): "yes" | "no" {
  return a > 0 && b > 0 ? "yes" : "no";
}

function rollupText(report: OutcomeReport, tx: Tx, format: Fmt): string {
  const r = report.rollup;
  if (r.state === "none_measurable") {
    return tx("rollupNoneMeasurable", {
      total: r.total,
      tooEarly: r.tooEarly,
      thin: r.thin,
      both: both(r.tooEarly, r.thin),
      window: WINDOW_DAYS,
    });
  }
  let text = tx("rollupMeasured", {
    measured: r.measured,
    window: WINDOW_DAYS,
    improved: r.improved,
    declined: r.declined,
    flat: r.flat,
    clicks: signed(format, r.clicksDelta),
    impressions: signed(format, r.impressionsDelta),
  });
  if (r.tooEarly > 0 || r.thin > 0) {
    text += " " + tx("rollupRemainder", {
        tooEarly: r.tooEarly,
        thin: r.thin,
        both: both(r.tooEarly, r.thin),
      });
  }
  return text;
}

function changeText(c: Change, tx: Tx, format: Fmt): string {
  switch (c.direction) {
    case "up":
      return tx("changeUp", { pct: format.number(c.ratio, { style: "percent" }) });
    case "down":
      return tx("changeDown", { pct: format.number(c.ratio, { style: "percent" }) });
    case "flat":
      return tx("changeFlat");
    case "from_zero":
      return tx("changeFromZero");
    case "zero":
      return tx("changeZero");
  }
}

function rowText(o: FixOutcome, tx: Tx, format: Fmt): string {
  if (o.confidence === "too_early") {
    return tx("rowTooEarly", {
      daysAgo: o.daysAgo,
      daysToGo: o.daysToGo,
      window: WINDOW_DAYS,
    });
  }
  if (o.confidence === "thin") {
    return tx("rowThin", {
      before: format.number(o.before.impressions),
      after: format.number(o.after.impressions),
    });
  }
  const delta = format.number(Math.abs(o.positionDelta), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const position =
    o.positionDelta === 0
      ? ""
      : " " +
        (o.positionDelta < 0
          ? tx("positionImproved", { delta })
          : tx("positionSlipped", { delta }));
  return tx("rowMeasured", {
    window: WINDOW_DAYS,
    clicks: changeText(o.clicksChange, tx, format),
    clicksBefore: format.number(o.before.clicks),
    clicksAfter: format.number(o.after.clicks),
    impressions: changeText(o.impressionsChange, tx, format),
    imprBefore: format.number(o.before.impressions),
    imprAfter: format.number(o.after.impressions),
    position,
  });
}

function Row({
  outcome: o,
  kindLabel,
  text,
}: {
  outcome: FixOutcome;
  kindLabel: string;
  text: string;
}) {
  const measured = o.confidence === "measured";
  const Icon = !measured
    ? Clock
    : o.clicksDelta > 0
      ? ArrowUpRight
      : o.clicksDelta < 0
        ? ArrowDownRight
        : Minus;
  const tone = !measured
    ? "text-muted-foreground"
    : o.clicksDelta > 0
      ? "text-emerald-700 dark:text-emerald-300"
      : o.clicksDelta < 0
        ? "text-rose-700 dark:text-rose-300"
        : "text-muted-foreground";

  return (
    <li className="flex min-w-0 items-start gap-2">
      <Icon className={`mt-0.5 size-3.5 shrink-0 ${tone}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium" title={o.url}>
          {kindLabel} · {shortUrl(o.url)}
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">{text}</p>
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
