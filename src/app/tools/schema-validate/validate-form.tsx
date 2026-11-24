"use client";

import { useActionState } from "react";
import { usePresetUrl } from "@/components/use-preset-url";
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { runValidate, type ValidateState } from "./actions";
import { ClientIdField } from "@/components/client-id-field";
import { ToolStat } from "@/components/tools/tool-stat";

export function ValidateForm() {
  // Opened from a client's file: the page (or site) arrives filled in.
  const presetUrl = usePresetUrl();
  const t = useTranslations("tools.ui.schema-validate");
  const [state, formAction, pending] = useActionState<
    ValidateState | null,
    FormData
  >(runValidate, null);

  return (
    <>
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3"
      >
        <ClientIdField />
        <div className="grid gap-3 md:grid-cols-[1fr_140px]">
          <input
            name="url"
            defaultValue={presetUrl}
            required
            placeholder="https://yoursite.com/article"
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-9 items-center justify-center rounded-md bg-emerald-500/15 px-4 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50"
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 size-3 animate-spin" />
                {t("validating")}
              </>
            ) : (
              <>
                <ShieldCheck className="mr-2 size-3" />
                {t("validate")}
              </>
            )}
          </button>
        </div>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <ToolStat label={t("schemaBlocks")} value={state.result.blocks.length.toString()} />
            <ToolStat label={t("errors")} value={state.result.totalErrors.toString()} tone={state.result.totalErrors > 0 ? "rose" : "emerald"} />
            <ToolStat label={t("warnings")} value={state.result.totalWarnings.toString()} tone={state.result.totalWarnings > 0 ? "amber" : "emerald"} />
          </div>

          {state.result.blocks.length === 0 && (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-300 ring-1 ring-inset ring-amber-500/30">
              {t.rich("noBlocks", {
                code: () => (
                  <code className="rounded bg-white/5 px-1 py-0.5">
                    &lt;script type=&quot;application/ld+json&quot;&gt;
                  </code>
                ),
                head: () => <>&lt;head&gt;</>,
              })}
            </p>
          )}

          {state.result.blocks.map((b, i) => (
            <section
              key={i}
              className="glass-apple relative overflow-hidden rounded-2xl"
            >
              <header className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-5 py-3">
                <div className="flex items-center gap-2">
                  {b.errors.length === 0 ? (
                    <CheckCircle2 className="size-4 text-emerald-300" />
                  ) : (
                    <XCircle className="size-4 text-rose-300" />
                  )}
                  <span className="text-sm font-semibold">
                    {t("blockTitle", {
                      n: i + 1,
                      type: Array.isArray(b.type) ? b.type.join(", ") : (b.type ?? t("unknownType")),
                    })}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {t("blockCounts", { errors: b.errors.length, warnings: b.warnings.length })}
                </span>
              </header>
              <div className="space-y-2 p-5">
                {b.errors.length > 0 && (
                  <ul className="space-y-1 text-xs">
                    {b.errors.map((e, j) => (
                      <li
                        key={j}
                        className="rounded-md bg-rose-500/10 px-2 py-1 text-rose-300 ring-1 ring-inset ring-rose-500/30"
                      >
                        ✗ {e}
                      </li>
                    ))}
                  </ul>
                )}
                {b.warnings.length > 0 && (
                  <ul className="space-y-1 text-xs">
                    {b.warnings.map((w, j) => (
                      <li
                        key={j}
                        className="rounded-md bg-amber-500/10 px-2 py-1 text-amber-300 ring-1 ring-inset ring-amber-500/30"
                      >
                        ⚠ {w}
                      </li>
                    ))}
                  </ul>
                )}
                <pre className="max-h-[280px] overflow-auto rounded-md bg-black/40 p-3 font-mono text-[11px] leading-relaxed">
                  {b.raw}
                </pre>
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}
