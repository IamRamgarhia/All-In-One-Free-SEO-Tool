"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { compareCompetitors, type CompetitorRow } from "../../pitch-actions";

export function CompetitorCompare({
  prospectUrl,
  prospectHost,
  prospectScore,
  prospectSerious,
  defaultQuery,
  hasSerpApi,
}: {
  prospectUrl: string;
  prospectHost: string;
  prospectScore: number | null;
  prospectSerious: number;
  defaultQuery: string;
  hasSerpApi: boolean;
}) {
  const t = useTranslations("leads.pitch");
  const [query, setQuery] = useState(defaultQuery);
  const [rows, setRows] = useState<CompetitorRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">{t("compareTitle")}</h2>
      {!hasSerpApi ? (
        <p className="text-sm text-muted-foreground">{t("compareNoApi")}</p>
      ) : (
        <>
          <div className="no-print flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="compare-query">
              {t("compareQuery")}
            </label>
            <input
              id="compare-query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("compareQueryPlaceholder")}
              className="h-9 min-w-0 flex-1 basis-56 rounded-md border border-border bg-background px-3 text-sm"
            />
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const r = await compareCompetitors({ query, prospectUrl });
                  if (r.ok) setRows(r.competitors);
                  else setError(r.error);
                })
              }
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
              {t("compareRun")}
            </Button>
          </div>
          <p className="no-print text-xs text-muted-foreground">{t("compareHint")}</p>
          {error ? <p className="text-sm text-amber-500">{error}</p> : null}
          {rows ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-1 pr-3 font-medium">{t("compareSite")}</th>
                    <th className="py-1 pr-3 font-medium">{t("compareScore")}</th>
                    <th className="py-1 font-medium">{t("compareSerious")}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border font-medium">
                    <td className="break-all py-1.5 pr-3">{prospectHost}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{prospectScore ?? "—"}</td>
                    <td className="py-1.5 tabular-nums">{prospectSerious}</td>
                  </tr>
                  {rows.map((r) => (
                    <tr key={r.host} className="border-t border-border">
                      <td className="break-all py-1.5 pr-3">{r.host}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{r.score ?? t("unreachable")}</td>
                      <td className="py-1.5 tabular-nums">{r.score === null ? "—" : r.critical + r.high}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t("compareNone")}</p> : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
