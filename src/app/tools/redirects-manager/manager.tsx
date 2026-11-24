"use client";

import { useState, useTransition } from "react";
import { usePresetPath } from "@/components/use-preset-url";
import { CornerDownRight, Plus, Trash2 } from "lucide-react";
import {
  addRule,
  deleteRule,
  deleteNotFound,
  resolve404,
} from "./actions";
import type { RedirectRule, NotFoundLog } from "@/db/schema";
import { useTranslations, useLocale } from "next-intl";

export function Manager({
  rules,
  notFound,
}: {
  rules: RedirectRule[];
  notFound: NotFoundLog[];
}) {
  // Opened from a client's file: the page to redirect arrives filled in.
  const presetPath = usePresetPath();
  const t = useTranslations("tools.ui.redirects-manager");
  const locale = useLocale();
  const [, startMut] = useTransition();
  const [resolveId, setResolveId] = useState<number | null>(null);
  const [resolveTarget, setResolveTarget] = useState("");
  const [tab, setTab] = useState<"rules" | "404">("rules");

  return (
    <>
      <div className="flex flex-wrap gap-2 border-b border-white/[0.06]">
        {(["rules", "404"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              tab === key
                ? "border-amber-400 text-amber-300"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {key === "rules"
              ? t("tabRules", { count: rules.length })
              : t("tab404", { count: notFound.filter((n) => !n.resolved).length })}
          </button>
        ))}
      </div>

      {tab === "rules" && (
        <>
          <form
            action={async (fd) => {
              await addRule(fd);
            }}
            className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3"
          >
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_120px]">
              <input
                name="sourcePath"
                defaultValue={presetPath === "/" ? "" : presetPath}
                required
                placeholder="/old-path"
                className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
              <input
                name="targetUrl"
                required
                placeholder={t("targetPlaceholder")}
                className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
              <select
                name="statusCode"
                defaultValue={301}
                className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
              >
                <option value={301}>{t("status301")}</option>
                <option value={302}>{t("status302")}</option>
                <option value={307}>{t("status307")}</option>
                <option value={308}>{t("status308")}</option>
                <option value={410}>{t("status410")}</option>
              </select>
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_140px]">
              <input
                name="note"
                placeholder={t("notePlaceholder")}
                className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
              <button
                type="submit"
                className="inline-flex h-9 items-center justify-center rounded-md bg-amber-500/15 px-4 text-xs font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30 hover:bg-amber-500/25"
              >
                <Plus className="mr-2 size-3" />
                {t("addRule")}
              </button>
            </div>
          </form>

          {rules.length === 0 ? (
            <p className="rounded-md bg-white/[0.02] px-3 py-2 text-sm text-muted-foreground">
              {t("noRules")}
            </p>
          ) : (
            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <ul className="divide-y divide-white/[0.05]">
                {rules.map((r) => (
                  <li
                    key={r.id}
                    className="grid grid-cols-[100px_1fr_auto_auto] gap-3 px-5 py-2 text-xs"
                  >
                    <span className="text-amber-300 tabular-nums">{r.statusCode}</span>
                    <div className="min-w-0">
                      <code className="truncate">{r.sourcePath}</code>
                      <CornerDownRight className="mx-1 inline size-3 text-muted-foreground" />
                      <code className="truncate text-muted-foreground">{r.targetUrl}</code>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {r.note ?? ""}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        startMut(async () => {
                          await deleteRule(r.id);
                        })
                      }
                      aria-label={t("deleteRule")}
                      title={t("deleteRule")}
                      className="inline-flex h-6 items-center rounded-md bg-rose-500/10 px-2 text-rose-300 ring-1 ring-inset ring-rose-500/30 hover:bg-rose-500/20"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="text-[10px] text-muted-foreground">
            {t("exportHint")}
          </p>
        </>
      )}

      {tab === "404" && (
        <>
          {notFound.length === 0 ? (
            <p className="rounded-md bg-white/[0.02] px-3 py-2 text-sm text-muted-foreground">
              {t.rich("no404", {
                body: "{ sourcePath: '/path' }",
                endpoint: "/api/v1/track-404",
                code: (chunks) => (
                  <code className="rounded bg-white/5 px-1 py-0.5">
                    {chunks}
                  </code>
                ),
              })}
            </p>
          ) : (
            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <ul className="divide-y divide-white/[0.05]">
                {notFound.map((n) => (
                  <li
                    key={n.id}
                    className={`px-5 py-2 text-xs ${n.resolved ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <code className="truncate font-medium">{n.sourcePath}</code>
                      <span className="text-muted-foreground tabular-nums">
                        {t("hits", {
                          count: n.hits,
                          date: n.lastSeen.toLocaleDateString(locale),
                        })}
                      </span>
                      {!n.resolved && (
                        <button
                          type="button"
                          onClick={() =>
                            setResolveId(resolveId === n.id ? null : n.id)
                          }
                          className="inline-flex h-7 items-center rounded-md bg-amber-500/15 px-2 text-amber-300 ring-1 ring-inset ring-amber-500/30 hover:bg-amber-500/25"
                        >
                          {t("resolve")}
                        </button>
                      )}
                      {n.resolved && n.resolvedToUrl && (
                        <span className="text-[10px] text-emerald-300 truncate max-w-[40%]">
                          ✓ → {n.resolvedToUrl}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          startMut(async () => {
                            await deleteNotFound(n.id);
                          })
                        }
                        aria-label={t("delete404")}
                        title={t("delete404")}
                        className="inline-flex h-6 items-center rounded-md bg-rose-500/10 px-2 text-rose-300 ring-1 ring-inset ring-rose-500/30 hover:bg-rose-500/20"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                    {resolveId === n.id && (
                      <form
                        action={async (fd) => {
                          fd.set("id", String(n.id));
                          fd.set("targetUrl", resolveTarget);
                          await resolve404(fd);
                          setResolveId(null);
                          setResolveTarget("");
                        }}
                        className="mt-2 flex items-center gap-2"
                      >
                        <input
                          value={resolveTarget}
                          onChange={(e) => setResolveTarget(e.target.value)}
                          placeholder={t("resolvePlaceholder")}
                          className="h-7 flex-1 rounded-md border border-white/10 bg-card/60 px-2 text-xs"
                        />
                        <button
                          type="submit"
                          disabled={!resolveTarget.trim()}
                          className="inline-flex h-7 items-center rounded-md bg-emerald-500/15 px-3 text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50"
                        >
                          {t("create301")}
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
