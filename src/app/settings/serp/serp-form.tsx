"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Pencil, Search } from "lucide-react";
import { GskSheet, SheetField, ValueRow } from "../gsk-sheet";
import { clearSerpSettings, saveSerpSettings, testSerpSettings, type SerpSaveState } from "./actions";

export type SerpInitial = {
  provider: "serper" | "dataforseo" | null;
  hasSerperKey: boolean;
  dataforseoLogin: string | null;
  hasDataforseoPassword: boolean;
};

const PRICING = {
  serper: "https://serper.dev/",
  dataforseo: "https://dataforseo.com/pricing/serp/google-organic-serp-api",
} as const;

export function SerpForm({ initial }: { initial: SerpInitial }) {
  const t = useTranslations("settings.serp");
  const [editing, setEditing] = useState(false);
  const [testing, startTest] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const configured = initial.provider !== null;

  return (
    <>
      {/* Last on the screen and never the primary button: an option for
          those who want Google's own results by country and accept to pay
          per search, not a step anyone needs. */}
      <section className="gsk-block" id="api">
        <div className="gsk-block-head gsk-block-head--action">
          <div className="min-w-0">
            <h2 className="gsk-block-title">{t("apiTitle")}</h2>
            <p className="gsk-block-description">{t("apiDescription")}</p>
          </div>
          <button
            type="button"
            className="gsk-btn"
            onClick={() => setEditing(true)}
          >
            <Pencil className="size-4" />
            {configured ? t("edit") : t("setUp")}
          </button>
        </div>
        <ValueRow label={t("apiProvider")} hint={configured ? t("apiConfiguredHint") : t("apiNoneHint")}>
          {configured ? t(`provider_${initial.provider}`) : <span className="gsk-value--muted">{t("apiNone")}</span>}
        </ValueRow>
        {configured ? (
          <ValueRow label={t("check")} hint={t("apiCheckHint")}>
            <button
              type="button"
              className="gsk-btn"
              disabled={testing}
              onClick={() => {
                setMsg(null);
                startTest(async () => {
                  const r = await testSerpSettings();
                  if (!r) return;
                  setMsg(r.ok ? { ok: true, text: t("apiOk", { count: r.results }) } : { ok: false, text: r.error });
                });
              }}
            >
              {testing ? t("checking") : t("checkButton")}
            </button>
          </ValueRow>
        ) : null}
        {msg ? (
          <p className={`gsk-result ${msg.ok ? "gsk-status-ok" : "gsk-status-error"}`}>
            {msg.ok ? <CheckCircle2 className="mr-1 inline size-4" /> : <AlertCircle className="mr-1 inline size-4" />}
            {msg.text}
          </p>
        ) : null}
      </section>

      {editing ? <SerpSheet initial={initial} onClose={() => setEditing(false)} /> : null}
    </>
  );
}

function SerpSheet({ initial, onClose }: { initial: SerpInitial; onClose: () => void }) {
  const t = useTranslations("settings.serp");
  const router = useRouter();
  const [state, formAction, pending] = useActionState<SerpSaveState, FormData>(saveSerpSettings, null);
  const [provider, setProvider] = useState<"none" | "serper" | "dataforseo">(initial.provider ?? "none");
  const [clearing, startClear] = useTransition();

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      onClose();
    }
  }, [state, router, onClose]);

  return (
    <GskSheet
      title={t("sheetTitle")}
      subtitle={t("sheetSubtitle")}
      icon={<Search className="size-4" />}
      closeLabel={t("cancel")}
      onClose={onClose}
    >
      <form action={formAction} className="gsk-sheet-form">
        <div className="gsk-drawer__body">
          <div className="gsk-sheet-section">
            <h4 className="gsk-section-title">{t("step1")}</h4>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("step1")}>
              {(["none", "serper", "dataforseo"] as const).map((p) => (
                <label key={p} className={provider === p ? "gsk-btn gsk-btn--primary" : "gsk-btn"}>
                  <input
                    type="radio"
                    name="provider"
                    value={p}
                    checked={provider === p}
                    onChange={() => setProvider(p)}
                    className="sr-only"
                  />
                  {t(`provider_${p}`)}
                </label>
              ))}
            </div>
            {provider !== "none" ? (
              <p className="gsk-help m-0">
                {t(`pricing_${provider}`)}{" "}
                <a href={PRICING[provider]} target="_blank" rel="noreferrer" className="underline">
                  {t("pricingLink")}
                </a>
              </p>
            ) : (
              <p className="gsk-help m-0">{t("noneHint")}</p>
            )}
          </div>

          {provider === "serper" ? (
            <div className="gsk-sheet-section">
              <h4 className="gsk-section-title">{t("step2")}</h4>
              <SheetField label={t("serperKey")} htmlFor="serperKey">
                <input
                  id="serperKey"
                  name="serperKey"
                  type="password"
                  autoComplete="off"
                  placeholder={initial.hasSerperKey ? t("secretKept") : ""}
                  className="gsk-input"
                />
              </SheetField>
            </div>
          ) : null}

          {provider === "dataforseo" ? (
            <div className="gsk-sheet-section">
              <h4 className="gsk-section-title">{t("step2")}</h4>
              <div className="gsk-sheet-grid">
                <SheetField label={t("dataforseoLogin")} htmlFor="dataforseoLogin">
                  <input
                    id="dataforseoLogin"
                    name="dataforseoLogin"
                    autoComplete="off"
                    defaultValue={initial.dataforseoLogin ?? ""}
                    className="gsk-input"
                  />
                </SheetField>
                <SheetField label={t("dataforseoPassword")} htmlFor="dataforseoPassword">
                  <input
                    id="dataforseoPassword"
                    name="dataforseoPassword"
                    type="password"
                    autoComplete="new-password"
                    placeholder={initial.hasDataforseoPassword ? t("secretKept") : ""}
                    className="gsk-input"
                  />
                </SheetField>
              </div>
            </div>
          ) : null}

          {state && !state.ok ? <p className="gsk-result gsk-status-error">{state.error}</p> : null}
        </div>

        <footer className="gsk-drawer__footer">
          <div>
            {initial.provider || initial.hasSerperKey || initial.hasDataforseoPassword ? (
              <button
                type="button"
                className="gsk-btn gsk-btn--danger-text"
                disabled={clearing}
                onClick={() =>
                  startClear(async () => {
                    await clearSerpSettings();
                    router.refresh();
                    onClose();
                  })
                }
              >
                {t("clear")}
              </button>
            ) : null}
          </div>
          <div className="gsk-drawer__footer-right">
            <button type="button" className="gsk-btn" onClick={onClose}>
              {t("cancel")}
            </button>
            <button type="submit" disabled={pending} className="gsk-btn gsk-btn--primary">
              {pending ? t("saving") : t("saveClose")}
            </button>
          </div>
        </footer>
      </form>
    </GskSheet>
  );
}
