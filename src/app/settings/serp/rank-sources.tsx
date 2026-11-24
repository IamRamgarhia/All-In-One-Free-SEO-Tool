"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Globe, Layers, Pencil, Shield } from "lucide-react";
import { GskSheet, SheetField, ValueRow } from "../gsk-sheet";
import {
  clearBraveKey,
  saveBraveKey,
  saveCdpUrl,
  saveSearxngUrl,
  testBrave,
  testBrowserEngines,
  testSearxng,
  type SourceSaveState,
  type SourceTestState,
} from "./actions";

export type RankSourcesState = {
  gsc: { connected: number; total: number };
  searxng: { url: string; from: "settings" | "env" } | null;
  brave: "settings" | "env" | null;
  browserDisabled: boolean;
  cdpUrl: string;
  api: "serper" | "dataforseo" | null;
};

type Tag = { label: string; tone: "success" | "default" | "warning" | "brand" };

function TagPill({ tag }: { tag: Tag }) {
  return <span className={`gsk-tag gsk-tag--${tag.tone} shrink-0`}>{tag.label}</span>;
}

/** The answer of one "Test" click, as it happened. */
function TestResult({ result, okText }: { result: SourceTestState; okText: (r: { results: number; detail?: string }) => string }) {
  if (!result) return null;
  return (
    <p
      role="status"
      className={`gsk-result mt-2 ${result.ok ? "gsk-status-ok" : "gsk-status-error"}`}
    >
      {result.ok ? (
        <CheckCircle2 className="mr-1 inline size-4" />
      ) : (
        <AlertCircle className="mr-1 inline size-4" />
      )}
      {result.ok ? okText(result) : result.error}
    </p>
  );
}

export function RankSourcesPanel({ sources }: { sources: RankSourcesState }) {
  const t = useTranslations("settings.serp");
  const [sheet, setSheet] = useState<"searxng" | "brave" | "cdp" | null>(null);

  const order: { key: string; name: string; hint: string; tag: Tag }[] = [
    {
      key: "gsc",
      name: t("order.gsc"),
      hint: t("order.gscHint"),
      tag: {
        label: t("tagGsc", { connected: sources.gsc.connected, total: sources.gsc.total }),
        tone: sources.gsc.connected > 0 ? "success" : "default",
      },
    },
    {
      key: "searxng",
      name: t("order.searxng"),
      hint: t("order.searxngHint"),
      tag: sources.searxng
        ? { label: t("tagConfigured"), tone: "success" }
        : { label: t("tagRecommended"), tone: "brand" },
    },
    {
      key: "brave",
      name: t("order.brave"),
      hint: t("order.braveHint"),
      tag: sources.brave
        ? { label: t("tagConfigured"), tone: "success" }
        : { label: t("tagOptional"), tone: "default" },
    },
    {
      key: "api",
      name: t("order.api"),
      hint: t("order.apiHint"),
      tag: sources.api
        ? { label: t("tagConfigured"), tone: "success" }
        : { label: t("tagOptional"), tone: "default" },
    },
    {
      key: "google",
      name: t("order.google"),
      hint: t("order.googleHint"),
      tag: sources.browserDisabled
        ? { label: t("tagDisabled"), tone: "warning" }
        : { label: t("tagActive"), tone: "success" },
    },
    {
      key: "duckduckgo",
      name: t("order.duckduckgo"),
      hint: t("order.duckduckgoHint"),
      tag: { label: t("tagActive"), tone: "success" },
    },
  ];

  return (
    <>
      <section className="gsk-block">
        <div className="gsk-block-head">
          <h2 className="gsk-block-title">{t("orderTitle")}</h2>
          <p className="gsk-block-description">{t("orderDescription")}</p>
        </div>
        <ol className="m-0 list-none p-0">
          {order.map((o, i) => (
            <li
              key={o.key}
              className="flex items-start gap-3 border-b border-[var(--gsk-stroke)] py-3 last:border-b-0"
            >
              <span className="gsk-steps__index mt-0.5">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-medium text-[var(--gsk-text-1)]">{o.name}</span>
                  <TagPill tag={o.tag} />
                </div>
                <p className="gsk-help m-0 mt-1">{o.hint}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="gsk-help m-0 pb-4">{t("orderRule")}</p>
      </section>

      <SearxngBlock state={sources.searxng} onEdit={() => setSheet("searxng")} />
      <BraveBlock state={sources.brave} onEdit={() => setSheet("brave")} />
      <BrowserBlock
        disabled={sources.browserDisabled}
        cdpUrl={sources.cdpUrl}
        onEdit={() => setSheet("cdp")}
      />

      {sheet === "searxng" ? (
        <SourceSheet
          title={t("searxngSheetTitle")}
          subtitle={t("searxngSheetSubtitle")}
          icon={<Layers className="size-4" />}
          action={saveSearxngUrl}
          onClose={() => setSheet(null)}
        >
          <SheetField label={t("searxngUrl")} htmlFor="searxngUrl" help={t("searxngUrlHelp")}>
            <input
              id="searxngUrl"
              name="searxngUrl"
              inputMode="url"
              autoComplete="off"
              placeholder="http://searxng:8080"
              defaultValue={sources.searxng?.from === "settings" ? sources.searxng.url : ""}
              className="gsk-input"
            />
          </SheetField>
        </SourceSheet>
      ) : null}

      {sheet === "brave" ? (
        <SourceSheet
          title={t("braveSheetTitle")}
          subtitle={t("braveSheetSubtitle")}
          icon={<Shield className="size-4" />}
          action={saveBraveKey}
          onClose={() => setSheet(null)}
          onClear={sources.brave === "settings" ? clearBraveKey : undefined}
        >
          <SheetField label={t("braveKey")} htmlFor="braveKey" help={t("braveKeyHelp")}>
            <input
              id="braveKey"
              name="braveKey"
              type="password"
              autoComplete="off"
              placeholder={sources.brave === "settings" ? t("secretKept") : ""}
              className="gsk-input"
            />
          </SheetField>
        </SourceSheet>
      ) : null}

      {sheet === "cdp" ? (
        <SourceSheet
          title={t("cdpSheetTitle")}
          subtitle={t("cdpSheetSubtitle")}
          icon={<Globe className="size-4" />}
          action={saveCdpUrl}
          onClose={() => setSheet(null)}
        >
          <SheetField label={t("cdpUrl")} htmlFor="cdpUrl" help={t("cdpUrlHelp")}>
            <input
              id="cdpUrl"
              name="cdpUrl"
              inputMode="url"
              autoComplete="off"
              placeholder="http://127.0.0.1:9222"
              defaultValue={sources.cdpUrl}
              className="gsk-input"
            />
          </SheetField>
          <p className="gsk-help m-0">{t("cdpRisks")}</p>
        </SourceSheet>
      ) : null}
    </>
  );
}

function SearxngBlock({
  state,
  onEdit,
}: {
  state: RankSourcesState["searxng"];
  onEdit: () => void;
}) {
  const t = useTranslations("settings.serp");
  const [testing, startTest] = useTransition();
  const [result, setResult] = useState<SourceTestState>(null);

  return (
    <section className="gsk-block" id="searxng">
      <div className="gsk-block-head gsk-block-head--action">
        <div className="min-w-0">
          <h2 className="gsk-block-title">{t("searxngTitle")}</h2>
          <p className="gsk-block-description">{t("searxngDescription")}</p>
        </div>
        <button type="button" className={state ? "gsk-btn" : "gsk-btn gsk-btn--primary"} onClick={onEdit}>
          <Pencil className="size-4" />
          {state ? t("edit") : t("setUp")}
        </button>
      </div>
      <ValueRow
        label={t("searxngUrl")}
        hint={state?.from === "env" ? t("searxngFromEnv") : t("searxngHostHint")}
      >
        {state ? (
          <span className="break-all">{state.url}</span>
        ) : (
          <span className="gsk-value--muted">{t("notConfigured")}</span>
        )}
      </ValueRow>
      {state ? (
        <ValueRow label={t("check")} hint={t("searxngCheckHint")}>
          <button
            type="button"
            className="gsk-btn"
            disabled={testing}
            onClick={() => {
              setResult(null);
              startTest(async () => setResult(await testSearxng()));
            }}
          >
            {testing ? t("checking") : t("checkButton")}
          </button>
        </ValueRow>
      ) : null}
      <TestResult
        result={result}
        okText={(r) => t("searxngOk", { count: r.results, engines: r.detail ?? "" })}
      />
      <div className="pb-4">
        <p className="gsk-help m-0">{t("searxngHowTo")}</p>
        <p className="m-0 mt-2 overflow-x-auto">
          <code className="gsk-code whitespace-nowrap">docker compose --profile searxng up -d</code>
        </p>
        <p className="gsk-help m-0 mt-2">{t("searxngPublicWarning")}</p>
      </div>
    </section>
  );
}

function BraveBlock({ state, onEdit }: { state: RankSourcesState["brave"]; onEdit: () => void }) {
  const t = useTranslations("settings.serp");
  const [testing, startTest] = useTransition();
  const [result, setResult] = useState<SourceTestState>(null);

  return (
    <section className="gsk-block" id="brave">
      <div className="gsk-block-head gsk-block-head--action">
        <div className="min-w-0">
          <h2 className="gsk-block-title">{t("braveTitle")}</h2>
          <p className="gsk-block-description">{t("braveDescription")}</p>
        </div>
        <button type="button" className="gsk-btn" onClick={onEdit}>
          <Pencil className="size-4" />
          {state ? t("edit") : t("setUp")}
        </button>
      </div>
      <ValueRow label={t("braveKey")} hint={t("braveKeyHint")}>
        {state === "settings" ? (
          t("braveKeySaved")
        ) : state === "env" ? (
          t("braveKeyEnv")
        ) : (
          <span className="gsk-value--muted">{t("notConfigured")}</span>
        )}
      </ValueRow>
      {state ? (
        <ValueRow label={t("check")} hint={t("braveCheckHint")}>
          <button
            type="button"
            className="gsk-btn"
            disabled={testing}
            onClick={() => {
              setResult(null);
              startTest(async () => setResult(await testBrave()));
            }}
          >
            {testing ? t("checking") : t("checkButton")}
          </button>
        </ValueRow>
      ) : null}
      <TestResult result={result} okText={(r) => t("braveOk", { count: r.results })} />
    </section>
  );
}

function BrowserBlock({
  disabled,
  cdpUrl,
  onEdit,
}: {
  disabled: boolean;
  cdpUrl: string;
  onEdit: () => void;
}) {
  const t = useTranslations("settings.serp");
  const [testing, startTest] = useTransition();
  const [result, setResult] = useState<Awaited<ReturnType<typeof testBrowserEngines>>>(null);

  return (
    <section className="gsk-block" id="browser">
      <div className="gsk-block-head">
        <h2 className="gsk-block-title">{t("browserTitle")}</h2>
        <p className="gsk-block-description">{t("browserDescription")}</p>
      </div>
      <ValueRow
        label={t("googleRow")}
        hint={
          <>
            {disabled ? t("googleDisabledHint") : t("googleHint")}{" "}
            <Link href="/settings/browser" className="underline">
              {t("browserSettingsLink")}
            </Link>
          </>
        }
      >
        {disabled ? t("tagDisabled") : t("tagActive")}
      </ValueRow>
      <ValueRow label={t("duckduckgoRow")} hint={t("duckduckgoHint")}>
        {t("tagActive")}
      </ValueRow>
      <ValueRow label={t("cdpRow")} hint={t("cdpHint")}>
        <span className="flex flex-wrap items-center justify-end gap-2">
          {cdpUrl ? (
            <span className="break-all">{cdpUrl}</span>
          ) : (
            <span className="gsk-value--muted">{t("cdpNone")}</span>
          )}
          <button type="button" className="gsk-btn gsk-btn--sm" onClick={onEdit}>
            {cdpUrl ? t("edit") : t("setUp")}
          </button>
        </span>
      </ValueRow>
      <ValueRow label={t("check")} hint={t("browserCheckHint")}>
        <button
          type="button"
          className="gsk-btn"
          disabled={testing}
          onClick={() => {
            setResult(null);
            startTest(async () => setResult(await testBrowserEngines()));
          }}
        >
          {testing ? t("checking") : t("checkButton")}
        </button>
      </ValueRow>
      {result ? (
        <div className="pb-4">
          {disabled ? <p className="gsk-help m-0">{t("testRunsAnyway")}</p> : null}
          <TestResult
            result={result.google}
            okText={(r) => t("googleOk", { count: r.results })}
          />
          <TestResult
            result={result.duckduckgo}
            okText={(r) => t("duckduckgoOk", { count: r.results, region: r.detail ?? "" })}
          />
        </div>
      ) : null}
    </section>
  );
}

/** The sheet shared by the three source forms: fields, Cancel / Save. */
function SourceSheet({
  title,
  subtitle,
  icon,
  action,
  onClose,
  onClear,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  action: (prev: SourceSaveState, formData: FormData) => Promise<SourceSaveState>;
  onClose: () => void;
  onClear?: () => Promise<void>;
  children: React.ReactNode;
}) {
  const t = useTranslations("settings.serp");
  const router = useRouter();
  const [state, formAction, pending] = useActionState<SourceSaveState, FormData>(action, null);
  const [clearing, startClear] = useTransition();

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      onClose();
    }
  }, [state, router, onClose]);

  return (
    <GskSheet title={title} subtitle={subtitle} icon={icon} closeLabel={t("cancel")} onClose={onClose}>
      <form action={formAction} className="gsk-sheet-form">
        <div className="gsk-drawer__body">
          <div className="gsk-sheet-section">{children}</div>
          {state && !state.ok ? <p className="gsk-result gsk-status-error">{state.error}</p> : null}
        </div>
        <footer className="gsk-drawer__footer">
          <div>
            {onClear ? (
              <button
                type="button"
                className="gsk-btn gsk-btn--danger-text"
                disabled={clearing}
                onClick={() =>
                  startClear(async () => {
                    await onClear();
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
