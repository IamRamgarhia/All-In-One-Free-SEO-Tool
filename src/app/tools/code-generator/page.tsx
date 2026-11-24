"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRunRefreshKey } from "@/components/use-run-refresh-key";
import {
  AlertTriangle,
  Check,
  Code2,
  Copy,
  Download,
  Eye,
  Loader2,
  Wand2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { PageHeader } from "@/components/shell/page-header";
import { generateCode, type CodeGenState } from "./actions";
import {
  TARGETS,
  TARGET_GROUPS,
  type GeneratorTarget,
} from "@/lib/code-generator-types";
import { TARGETS_FR, TARGET_GROUP_LABELS_FR } from "@/lib/code-generator-types.fr";
import { RecentRuns } from "@/components/recent-runs";
import { AiDisclaimer } from "@/components/ai-disclaimer";

export default function CodeGeneratorPage() {
  const t = useTranslations("tools.ui.code-generator");
  const tCommon = useTranslations("tools.common");
  const [state, formAction, pending] = useActionState<CodeGenState, FormData>(
    generateCode,
    null,
  );
  const [target, setTarget] = useState<GeneratorTarget>("html-snippet");
  const [task, setTask] = useState("");
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const fr = useLocale() === "fr";
  // Labels, descriptions and warnings in the reader's language; the
  // English table stays the fallback.
  const text = (id: GeneratorTarget) => (fr ? { ...TARGETS[id], ...TARGETS_FR[id] } : TARGETS[id]);
  const spec = useMemo(
    () => (fr ? { ...TARGETS[target], ...TARGETS_FR[target] } : TARGETS[target]),
    [target, fr],
  );

  const refreshKey = useRunRefreshKey(state?.ok ? state : null);

  // Update iframe srcDoc when generated code or preview toggle changes.
  useEffect(() => {
    if (!state?.ok || state.preview !== "iframe" || !iframeRef.current) return;
    iframeRef.current.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui,-apple-system,sans-serif;margin:1rem;background:#fff;color:#111}</style></head><body>${state.code}</body></html>`;
  }, [state, showPreview]);

  function copy() {
    if (!state?.ok) return;
    void navigator.clipboard.writeText(state.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function download() {
    if (!state?.ok) return;
    const blob = new Blob([state.code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `seo-tool-output.${state.fileExt}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function applyPreset() {
    if (t.has(`presets.${target}`)) setTask(t(`presets.${target}`));
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        icon={Code2}
        accent="violet"
      />

      <form action={formAction} className="space-y-3">
        <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{t("outputType")}</p>
            <div className="space-y-2">
              {TARGET_GROUPS.map((g) => (
                <div key={g.label} className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {(fr && TARGET_GROUP_LABELS_FR[g.label]) || g.label}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {g.targets.map((id) => {
                      const meta = text(id);
                      const active = target === id;
                      return (
                        <label key={id}>
                          <input
                            type="radio"
                            name="target"
                            value={id}
                            checked={active}
                            onChange={() => setTarget(id)}
                            className="sr-only"
                          />
                          <span
                            className={`inline-flex cursor-pointer items-center rounded-md px-2 py-1 text-[11px] ring-1 ring-inset transition-colors ${
                              active
                                ? "bg-violet-500/15 text-violet-300 ring-violet-500/30"
                                : "bg-white/5 text-muted-foreground ring-white/10 hover:bg-white/10"
                            }`}
                          >
                            {meta.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md bg-violet-500/5 p-3 text-[11px] ring-1 ring-inset ring-violet-500/20">
            <p className="font-medium text-violet-300">
              {spec.label}
            </p>
            <p className="text-muted-foreground">{spec.description}</p>
            {spec.warning && (
              <p className="mt-1 flex items-start gap-1 text-amber-300">
                <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                {spec.warning}
              </p>
            )}
          </div>

          <label className="space-y-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {t("taskLabel")}
              </span>
              {t.has(`presets.${target}`) && (
                <button
                  type="button"
                  onClick={applyPreset}
                  className="text-[10px] text-violet-300 hover:underline"
                >
                  {t("useExample")}
                </button>
              )}
            </div>
            <textarea
              name="task"
              required
              rows={4}
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder={t("taskPlaceholder")}
              className="w-full rounded-md border border-white/10 bg-card/60 px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>

          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">
              {t("constraints")}
            </span>
            <input
              name="constraints"
              placeholder={t("constraintsPlaceholder")}
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            />
          </label>

          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-10 items-center rounded-md bg-violet-500/15 px-5 text-sm font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50"
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                {t("writing")}
              </>
            ) : (
              <>
                <Wand2 className="mr-2 size-4" />
                {t("generate", { label: spec.label.toLowerCase() })}
              </>
            )}
          </button>
        </section>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && (
        <>
          {state.warning && (
            <div className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-300 ring-1 ring-inset ring-amber-500/30">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{state.warning}</span>
            </div>
          )}

          <section className="glass-apple relative overflow-hidden rounded-2xl">
            <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
              <div>
                <h3 className="text-sm font-semibold">
                  {text(state.target).label}
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  {t("linesMeta", {
                    count: state.code.split("\n").length,
                    language: state.language,
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {state.preview === "iframe" && (
                  <button
                    type="button"
                    onClick={() => setShowPreview((p) => !p)}
                    className="inline-flex items-center gap-1 rounded-md bg-cyan-500/10 px-2 py-0.5 text-[11px] text-cyan-300 ring-1 ring-inset ring-cyan-500/30 hover:bg-cyan-500/20"
                  >
                    <Eye className="size-3" />
                    {showPreview ? t("hidePreview") : t("showPreview")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={copy}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/20"
                >
                  {copied ? (
                    <>
                      <Check className="size-3" /> {tCommon("copied")}
                    </>
                  ) : (
                    <>
                      <Copy className="size-3" /> {tCommon("copy")}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={download}
                  className="inline-flex items-center gap-1 rounded-md bg-violet-500/10 px-2 py-0.5 text-[11px] text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/20"
                >
                  <Download className="size-3" />
                  .{state.fileExt}
                </button>
              </div>
            </header>
            {state.preview === "iframe" && showPreview && (
              <div className="border-b border-white/[0.06] bg-white">
                <iframe
                  ref={iframeRef}
                  title={t("livePreview")}
                  sandbox="allow-same-origin"
                  className="block h-[400px] w-full"
                />
              </div>
            )}
            <pre className="max-h-[600px] overflow-auto bg-black/30 p-4 text-[11px] leading-relaxed">
              <code>{state.code}</code>
            </pre>
          </section>

          <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
            <h3 className="text-sm font-semibold">{t("installTitle")}</h3>
            <ol className="mt-2 space-y-1.5 text-sm">
              {state.installSteps.map((s, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[10px] font-bold text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                    {i + 1}
                  </span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </section>

          <AiDisclaimer variant="inline" />
        </>
      )}

      <RecentRuns toolId="code-generator" refreshKey={refreshKey} />
    </div>
  );
}
