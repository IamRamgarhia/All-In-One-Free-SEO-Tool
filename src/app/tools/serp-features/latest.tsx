import { CheckCircle2, XCircle } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";

export function LatestSnapshots({
  latest,
}: {
  latest: {
    query: string;
    country: string;
    hasAio: boolean;
    aioIncludesUs: boolean;
    hasFeaturedSnippet: boolean;
    featuredOwnedByUs: boolean;
    ourPosition: number | null;
    paaQuestions: string[];
    capturedAt: Date;
  }[];
}) {
  const t = useTranslations("tools.ui.serp-features");
  const locale = useLocale();
  if (latest.length === 0) {
    return (
      <section className="glass-apple rounded-2xl p-5 text-sm text-muted-foreground">
        {t("empty")}
      </section>
    );
  }
  return (
    <section className="glass-apple relative overflow-hidden rounded-2xl">
      <header className="border-b border-white/[0.06] px-5 py-3">
        <h3 className="text-sm font-semibold">{t("latestTitle")}</h3>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-white/[0.02] text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">{t("colQuery")}</th>
              <th className="px-4 py-2 text-center">{t("colPos")}</th>
              <th className="px-4 py-2 text-center">{t("colAio")}</th>
              <th className="px-4 py-2 text-center">{t("colInAio")}</th>
              <th className="px-4 py-2 text-center">{t("colFs")}</th>
              <th className="px-4 py-2 text-center">{t("colOwnFs")}</th>
              <th className="px-4 py-2 text-right">{t("colPaa")}</th>
              <th className="px-4 py-2 text-right">{t("colWhen")}</th>
            </tr>
          </thead>
          <tbody>
            {latest.map((s) => (
              <tr
                key={`${s.query}|${s.capturedAt.toISOString()}`}
                className="border-t border-white/[0.04]"
              >
                <td className="px-4 py-1.5 font-medium">
                  {s.query} <span className="text-[10px] text-muted-foreground">({s.country})</span>
                </td>
                <td className="px-4 py-1.5 text-center tabular-nums">
                  {s.ourPosition ? `#${s.ourPosition}` : "—"}
                </td>
                <Cell value={s.hasAio} />
                <Cell value={s.aioIncludesUs} highlight={s.hasAio} />
                <Cell value={s.hasFeaturedSnippet} />
                <Cell value={s.featuredOwnedByUs} highlight={s.hasFeaturedSnippet} />
                <td className="px-4 py-1.5 text-right text-muted-foreground tabular-nums">
                  {s.paaQuestions.length}
                </td>
                <td className="px-4 py-1.5 text-right text-muted-foreground">
                  {s.capturedAt.toLocaleDateString(locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Cell({ value, highlight }: { value: boolean; highlight?: boolean }) {
  return (
    <td className="px-4 py-1.5 text-center">
      {value ? (
        <CheckCircle2 className={`mx-auto size-3 ${highlight === false ? "text-amber-300" : "text-emerald-300"}`} />
      ) : (
        <XCircle className="mx-auto size-3 text-muted-foreground/40" />
      )}
    </td>
  );
}
