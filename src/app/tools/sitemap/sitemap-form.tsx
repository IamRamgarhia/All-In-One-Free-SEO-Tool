"use client";

import { useActionState, useState } from "react";
import { usePresetSite } from "@/components/use-preset-url";
import { Loader2, Download, Copy, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { generateSitemap, type SitemapResult } from "./actions";

const TABS = ["xml", "txt", "html"] as const;

export function SitemapForm() {
  // Opened from a client's file: the page (or site) arrives filled in.
  const presetSite = usePresetSite();
  const t = useTranslations("tools.ui.sitemap");
  const tCommon = useTranslations("tools.common");
  const [state, formAction, pending] = useActionState<
    SitemapResult | null,
    FormData
  >(generateSitemap, null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("xml");
  const [copied, setCopied] = useState(false);

  const content = state?.ok
    ? tab === "xml"
      ? state.xml
      : tab === "txt"
        ? state.txt
        : state.html
    : "";
  const filename = state?.ok
    ? tab === "xml"
      ? "sitemap.xml"
      : tab === "txt"
        ? "sitemap.txt"
        : "sitemap.html"
    : "";
  const mime =
    tab === "xml" ? "application/xml" : tab === "txt" ? "text/plain" : "text/html";

  return (
    <>
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl p-5"
      >
        <div className="grid gap-3 md:grid-cols-[1fr_140px_auto]">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">{t("startUrl")}</span>
            <input
              name="url"
              defaultValue={presetSite}
              required
              placeholder="https://example.com"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">{t("maxPages")}</span>
            <input
              name="maxPages"
              type="number"
              min={10}
              max={2000}
              defaultValue={300}
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-9 items-center self-end rounded-md bg-cyan-500/15 px-4 text-xs font-medium text-cyan-300 ring-1 ring-inset ring-cyan-500/30 hover:bg-cyan-500/25 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              t("generate")
            )}
          </button>
        </div>
        <label className="mt-3 inline-flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            name="respectRobots"
            defaultChecked
            className="size-3.5"
          />
          {t("respectRobots")}
        </label>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {t("hint")}
        </p>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <header className="border-b border-white/[0.06] px-5 py-4">
            <h2 className="text-base font-semibold">
              {t("discovered", { count: state.pageCount, host: state.hostLabel })}
            </h2>
            {state.errorCount > 0 && (
              <p className="mt-0.5 text-[11px] text-amber-300">
                {t("fetchErrors", { count: state.errorCount })}
              </p>
            )}
          </header>

          <div className="flex items-center justify-between gap-2 border-b border-white/[0.05] px-5 py-2">
            <div className="flex gap-1">
              {TABS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  className={`rounded-md px-3 py-1 text-[11px] font-medium uppercase tracking-wider ${
                    tab === k
                      ? "bg-white/10 text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(content);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }}
                className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2.5 py-1 text-[10px] text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10 hover:text-foreground"
              >
                {copied ? (
                  <>
                    <Check className="size-3" />
                    {tCommon("copied")}
                  </>
                ) : (
                  <>
                    <Copy className="size-3" />
                    {tCommon("copy")}
                  </>
                )}
              </button>
              <a
                href={`data:${mime};charset=utf-8,${encodeURIComponent(content)}`}
                download={filename}
                className="inline-flex items-center gap-1 rounded-md bg-cyan-500/15 px-2.5 py-1 text-[10px] font-medium text-cyan-300 ring-1 ring-inset ring-cyan-500/30 hover:bg-cyan-500/25"
              >
                <Download className="size-3" />
                {t("downloadFile", { filename })}
              </a>
            </div>
          </div>

          <pre className="max-h-[480px] overflow-auto p-5 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {content}
          </pre>
        </section>
      )}
    </>
  );
}
