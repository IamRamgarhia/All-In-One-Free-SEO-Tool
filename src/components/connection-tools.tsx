"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { resolveToolCopy } from "@/lib/i18n/tool-copy";
import {
  connectionCoverage,
  groupByMission,
  type CoveredTool,
} from "@/lib/connection-coverage";

/**
 * The tools a connection unlocks, named and linked, under the counts.
 *
 * "ai": what an AI key (or Ollama) unlocks, and what already runs
 * without one. "gsc": the tools that have no data until Search Console
 * is connected. Lists and counts come from connection-coverage.ts, which
 * classes each tool exactly as its card in Settings → Tools does.
 */
export function ConnectionTools({
  kind,
  summary = true,
}: {
  kind: "ai" | "gsc";
  /** Off where the page already states the counts (Settings → AI). */
  summary?: boolean;
}) {
  const t = useTranslations("connectionTools");
  const cov = connectionCoverage();

  if (kind === "gsc") {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          {t("gscSummary", { count: cov.needsGsc.length })}
        </p>
        <ToolList tools={cov.needsGsc} label={t("gscShow", { count: cov.needsGsc.length })} />
      </div>
    );
  }

  const works = cov.partlyKey.length + cov.noAi.length;
  return (
    <div className="space-y-2">
      {summary ? (
        <>
          <p className="text-xs text-muted-foreground">
            {t("aiSummary", {
              needs: cov.needsKey.length,
              total: cov.total,
              works,
              partly: cov.partlyKey.length,
            })}
          </p>
          <p className="text-xs text-muted-foreground">{t("chatNote")}</p>
        </>
      ) : null}
      <ToolList tools={cov.needsKey} label={t("needsShow", { count: cov.needsKey.length })} />
      <ToolList tools={cov.partlyKey} label={t("partlyShow", { count: cov.partlyKey.length })} />
    </div>
  );
}

function ToolList({ tools, label }: { tools: readonly CoveredTool[]; label: string }) {
  const settings = useTranslations("settings.tools");
  const catalog = useTranslations("tools.catalog");
  const nav = useTranslations("nav.items");
  if (tools.length === 0) return null;
  const name = (href: string) =>
    resolveToolCopy(href, { settings, catalog, nav })?.title ?? href;

  return (
    <details className="group rounded-md bg-white/5 px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium [&::-webkit-details-marker]:hidden">
        <span>{label}</span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-2 space-y-2">
        {groupByMission(tools).map((g) => (
          <div key={g.id}>
            <p className="text-[11px] text-muted-foreground">
              {settings(`categories.${g.id}.label`)}
            </p>
            <ul className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1">
              {g.tools.map((tool) => (
                <li key={tool.href} className="min-w-0">
                  <Link
                    href={tool.href}
                    className="text-xs text-foreground underline-offset-2 hover:underline"
                  >
                    {name(tool.href)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}
