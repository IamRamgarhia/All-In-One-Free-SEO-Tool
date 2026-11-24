"use client";

import { startTransition, useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Pencil,
  Plug,
  RefreshCw,
  Send,
  Wrench,
} from "lucide-react";
import { GskSheet, SheetField, ValueRow } from "@/app/settings/gsk-sheet";
import { GoogleSetupDialog } from "@/components/shell/google-setup-dialog";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { fetchGoogleProperties, saveGoogleProperties } from "./google-actions";
import { disconnectPerClientGoogle } from "./per-client-google-actions";
import {
  disconnectWpBridge,
  pushWpFix,
  saveWpCreds,
  type SaveCredsResult,
  type WpFixResult,
} from "./wp-actions";
import {
  deleteSchedule,
  saveSchedule,
  sendReportNow,
  type SaveScheduleResult,
} from "./schedule-actions";

/*
 * The project's settings tab, the way the Settings window works
 * (docs/HANDOFF.md §C): the page shows the current values; changing them
 * opens a sheet from the right. Same server actions and field names as the
 * forms this replaces (google-panel, per-client-google, wp-bridge-panel,
 * report-schedule-card).
 */

type GoogleStatus = {
  configured: boolean;
  connected: boolean;
  credentialsSet: boolean;
  credentialsFromEnv: boolean;
  email: string | null;
};

export type ProjectSettingsProps = {
  projectId: number;
  google: {
    status: GoogleStatus;
    redirectUri: string;
    oauthClientId: string | null;
    hasSecret: boolean;
    /** The OAuth client exists, so a project can connect its own account. */
    hasWorkspaceCreds: boolean;
    /** The project's own Google account, when it has one. */
    projectEmail: string | null;
    gsc: string | null;
    ga4: string | null;
  };
  wordpress: {
    connected: boolean;
    endpoint: string | null;
    looksLikeWordPress: boolean;
  };
  reports: {
    smtpConfigured: boolean;
    schedule: Schedule | null;
  };
};

type Template = "executive" | "detailed" | "technical";
type Schedule = {
  id: number;
  template: Template;
  frequency: "weekly" | "monthly";
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  hourOfDay: number;
  recipients: string[];
  enabled: boolean;
  lastSentAt: Date | null;
  nextSendAt: Date | null;
};

export function ProjectSettings({ projectId, google, wordpress, reports }: ProjectSettingsProps) {
  return (
    <div className="space-y-5">
      <GoogleBlock projectId={projectId} google={google} />
      <WordPressBlock projectId={projectId} wordpress={wordpress} />
      <ReportsBlock projectId={projectId} reports={reports} />
    </div>
  );
}

/**
 * Submits a sheet form to its action without React 19 resetting it: with
 * action={…} the form is cleared once the action returns, so a rejected
 * value (a bad key, an invalid recipient) also wiped everything else the
 * user had just typed.
 */
function submitKeepingFields(dispatch: (data: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => dispatch(data));
  };
}

function Block({ children }: { children: React.ReactNode }) {
  return <section className="gsk-block rounded-2xl border border-border bg-card px-5 py-4">{children}</section>;
}

function BlockHead({
  title,
  description,
  action,
}: {
  title: string;
  description: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="gsk-block-head gsk-block-head--action">
      <div>
        <h2 className="gsk-block-title">{title}</h2>
        <p className="gsk-block-description">{description}</p>
      </div>
      {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}

function Message({ ok, text }: { ok: boolean; text: string }) {
  return (
    <p className={`gsk-result ${ok ? "gsk-status-ok" : "gsk-status-error"}`}>
      {ok ? <CheckCircle2 className="mr-1 inline size-4" /> : <AlertCircle className="mr-1 inline size-4" />}
      {text}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Google                                                              */
/* ------------------------------------------------------------------ */

function GoogleBlock({ projectId, google }: { projectId: number; google: ProjectSettingsProps["google"] }) {
  const t = useTranslations("clientPage.projectSettings");
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const muted = (text: string) => <span className="gsk-value--muted">{text}</span>;
  const configured = google.status.configured;

  return (
    <Block>
      <BlockHead
        title={t("google.title")}
        description={t("google.description")}
        action={
          configured ? (
            <button
              type="button"
              className={google.gsc || google.ga4 ? "gsk-btn" : "gsk-btn gsk-btn--primary"}
              onClick={() => setEditing(true)}
            >
              <Pencil className="size-4" />
              {google.gsc || google.ga4 ? t("edit") : t("google.choose")}
            </button>
          ) : (
            <button type="button" className="gsk-btn gsk-btn--primary" onClick={() => setSetupOpen(true)}>
              <Plug className="size-4" />
              {t("google.connect")}
            </button>
          )
        }
      />
      {configured ? (
        <>
          <ValueRow label={t("google.account")} hint={t("google.accountHint")}>
            {google.projectEmail ? (
              <>
                {google.projectEmail}
                <span className="gsk-tag gsk-tag--brand">{t("google.ownAccount")}</span>
              </>
            ) : (
              <span>{google.status.email ?? t("google.workspaceAccount")}</span>
            )}
          </ValueRow>
          <ValueRow label={t("google.gsc")}>
            {google.gsc ? <span className="font-mono text-[13px]">{google.gsc}</span> : muted(t("notSet"))}
          </ValueRow>
          <ValueRow label={t("google.ga4")}>
            {google.ga4 ? <span className="font-mono text-[13px]">{google.ga4}</span> : muted(t("notSet"))}
          </ValueRow>
        </>
      ) : (
        <ValueRow label={t("google.account")} hint={t("google.notConnectedHint")}>
          {muted(t("google.notConnected"))}
        </ValueRow>
      )}

      {editing ? <GoogleSheet projectId={projectId} google={google} onClose={() => setEditing(false)} /> : null}
      <GoogleSetupDialog
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        initialStatus={google.status}
        redirectUri={google.redirectUri}
        initialClientId={google.oauthClientId}
        hasSecret={google.hasSecret}
        onConnected={() => router.refresh()}
      />
    </Block>
  );
}

function GoogleSheet({
  projectId,
  google,
  onClose,
}: {
  projectId: number;
  google: ProjectSettingsProps["google"];
  onClose: () => void;
}) {
  const t = useTranslations("clientPage.projectSettings");
  const tg = useTranslations("clientPage.google");
  const router = useRouter();
  const [gsc, setGsc] = useState(google.gsc ?? "");
  const [ga4, setGa4] = useState(google.ga4 ?? "");
  const [gscOptions, setGscOptions] = useState<{ value: string; label: string }[]>([]);
  const [ga4Options, setGa4Options] = useState<{ value: string; label: string }[]>([]);
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [opening, setOpening] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const perm = (p: string) =>
    p.replace("siteOwner", tg("permOwner")).replace("siteFullUser", tg("permFull")).replace("siteRestrictedUser", tg("permRestricted"));

  function load(announce: boolean) {
    startLoading(async () => {
      const r = await fetchGoogleProperties(projectId);
      if (!r.ok) {
        setMsg({ ok: false, text: r.error });
        return;
      }
      setGscOptions(r.gsc.map((o) => ({ value: o.siteUrl, label: `${o.siteUrl} (${perm(o.permissionLevel)})` })));
      setGa4Options(r.ga4.map((o) => ({ value: o.id, label: `${o.displayName} · ${o.accountName} (${o.id})` })));
      if (announce) setMsg({ ok: true, text: tg("refreshed") });
    });
  }

  useEffect(() => {
    load(false);
    return () => {
      if (pollRef.current !== null) clearInterval(pollRef.current);
    };
    // Once, when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The project's own Google account: OAuth in a popup, then reload so
  // the page reads the new tokens (same flow as per-client-google.tsx).
  function connectOwnAccount() {
    setOpening(true);
    const w = window.open(`/api/google/auth?clientId=${projectId}&popup=1`, "google-oauth", "width=500,height=700");
    if (!w) {
      setOpening(false);
      return;
    }
    if (pollRef.current !== null) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      if (w.closed) {
        if (pollRef.current !== null) clearInterval(pollRef.current);
        pollRef.current = null;
        setOpening(false);
        window.location.reload();
      }
    }, 500);
  }

  async function disconnectOwnAccount() {
    const ok = await confirmDialog({
      title: t("google.disconnectTitle"),
      description: t("google.disconnectBody"),
      confirmLabel: t("disconnect"),
      destructive: true,
      cancelLabel: t("cancel"),
    });
    if (!ok) return;
    startSaving(async () => {
      await disconnectPerClientGoogle(projectId);
      router.refresh();
      onClose();
    });
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    startSaving(async () => {
      const r = await saveGoogleProperties({ clientId: projectId, gscProperty: gsc || null, ga4PropertyId: ga4 || null });
      if (!r.ok) {
        setMsg({ ok: false, text: r.error });
        return;
      }
      router.refresh();
      onClose();
    });
  }

  // A saved value the account no longer lists stays selectable, so
  // opening the sheet and saving does not silently clear it.
  const withCurrent = (opts: { value: string; label: string }[], current: string) =>
    current && !opts.some((o) => o.value === current) ? [{ value: current, label: current }, ...opts] : opts;

  const picker = (
    id: string,
    value: string,
    setValue: (v: string) => void,
    options: { value: string; label: string }[],
  ) => (
    <select id={id} value={value} onChange={(e) => setValue(e.target.value)} disabled={loading} className="gsk-select">
      <option value="">{loading ? tg("loading") : options.length === 0 ? tg("noProperties") : tg("skip")}</option>
      {withCurrent(options, value).map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );

  return (
    <GskSheet
      title={t("google.sheetTitle")}
      subtitle={t("google.sheetSubtitle")}
      icon={<Plug className="size-4" />}
      closeLabel={t("cancel")}
      onClose={onClose}
    >
      <form onSubmit={save} className="gsk-sheet-form">
        <div className="gsk-drawer__body">
          <div className="gsk-sheet-section">
            <h4 className="gsk-section-title">{t("google.stepAccount")}</h4>
            <p className="gsk-help m-0">{t("google.stepAccountHint")}</p>
            {google.projectEmail ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="gsk-tag gsk-tag--success">{google.projectEmail}</span>
                <button type="button" className="gsk-btn gsk-btn--sm" onClick={connectOwnAccount} disabled={opening}>
                  <ExternalLink className="size-3.5" />
                  {opening ? t("google.opening") : t("google.reconnect")}
                </button>
                <button
                  type="button"
                  className="gsk-btn gsk-btn--sm gsk-btn--danger-text"
                  onClick={disconnectOwnAccount}
                  disabled={saving}
                >
                  {t("disconnect")}
                </button>
              </div>
            ) : google.hasWorkspaceCreds ? (
              <div>
                <button type="button" className="gsk-btn" onClick={connectOwnAccount} disabled={opening}>
                  <ExternalLink className="size-4" />
                  {opening ? t("google.opening") : t("google.useOwnAccount")}
                </button>
              </div>
            ) : (
              <p className="gsk-note m-0">{t("google.needWorkspace")}</p>
            )}
          </div>

          <div className="gsk-sheet-section">
            <h4 className="gsk-section-title">{t("google.stepProperties")}</h4>
            <SheetField label={tg("gscLabel")} htmlFor="ps-gsc" help={tg("gscHelp")}>
              {picker("ps-gsc", gsc, setGsc, gscOptions)}
            </SheetField>
            <SheetField label={tg("ga4Label")} htmlFor="ps-ga4" help={tg("ga4Help")}>
              {picker("ps-ga4", ga4, setGa4, ga4Options)}
            </SheetField>
            <div>
              <button type="button" className="gsk-btn gsk-btn--sm" onClick={() => load(true)} disabled={loading}>
                <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
                {tg("refresh")}
              </button>
            </div>
            {msg ? <Message ok={msg.ok} text={msg.text} /> : null}
          </div>
        </div>
        <footer className="gsk-drawer__footer">
          <div />
          <div className="gsk-drawer__footer-right">
            <button type="button" className="gsk-btn" onClick={onClose}>
              {t("cancel")}
            </button>
            <button type="submit" disabled={saving} className="gsk-btn gsk-btn--primary">
              {saving ? t("saving") : t("saveClose")}
            </button>
          </div>
        </footer>
      </form>
    </GskSheet>
  );
}

/* ------------------------------------------------------------------ */
/* WordPress                                                           */
/* ------------------------------------------------------------------ */

function WordPressBlock({
  projectId,
  wordpress,
}: {
  projectId: number;
  wordpress: ProjectSettingsProps["wordpress"];
}) {
  const t = useTranslations("clientPage.projectSettings");
  const [sheet, setSheet] = useState<"connect" | "fix" | null>(null);
  const { connected, endpoint, looksLikeWordPress } = wordpress;

  return (
    <Block>
      <BlockHead
        title={t("wp.title")}
        description={t("wp.description")}
        action={
          connected ? (
            <>
              <button type="button" className="gsk-btn gsk-btn--primary" onClick={() => setSheet("fix")}>
                <Send className="size-4" />
                {t("wp.pushFix")}
              </button>
              <button type="button" className="gsk-btn" onClick={() => setSheet("connect")}>
                <Pencil className="size-4" />
                {t("edit")}
              </button>
            </>
          ) : looksLikeWordPress ? (
            <button type="button" className="gsk-btn gsk-btn--primary" onClick={() => setSheet("connect")}>
              <Plug className="size-4" />
              {t("wp.connect")}
            </button>
          ) : null
        }
      />
      <ValueRow
        label={t("wp.status")}
        hint={
          !connected && !looksLikeWordPress ? (
            <>
              {t("wp.notWordPressHint")}{" "}
              <button type="button" className="gsk-link" onClick={() => setSheet("connect")}>
                {t("wp.itIsWordPress")}
              </button>
            </>
          ) : undefined
        }
      >
        {connected ? (
          <span className="gsk-tag gsk-tag--success">{t("wp.connected")}</span>
        ) : looksLikeWordPress ? (
          <span className="gsk-tag gsk-tag--warning">{t("wp.notConnected")}</span>
        ) : (
          <span className="gsk-tag gsk-tag--default">{t("wp.notApplicable")}</span>
        )}
      </ValueRow>
      {connected ? (
        <ValueRow label={t("wp.endpoint")}>
          <span className="break-all font-mono text-[13px]">{endpoint}</span>
        </ValueRow>
      ) : null}

      {sheet === "connect" ? (
        <WordPressConnectSheet projectId={projectId} connected={connected} endpoint={endpoint} onClose={() => setSheet(null)} />
      ) : null}
      {sheet === "fix" ? <WordPressFixSheet projectId={projectId} onClose={() => setSheet(null)} /> : null}
    </Block>
  );
}

function WordPressConnectSheet({
  projectId,
  connected,
  endpoint,
  onClose,
}: {
  projectId: number;
  connected: boolean;
  endpoint: string | null;
  onClose: () => void;
}) {
  const t = useTranslations("clientPage.projectSettings");
  const router = useRouter();
  const [state, formAction, pending] = useActionState<SaveCredsResult | null, FormData>(saveWpCreds, null);
  const [disconnecting, startDisconnect] = useTransition();

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      onClose();
    }
  }, [state, router, onClose]);

  async function disconnect() {
    const ok = await confirmDialog({
      title: t("wp.disconnectTitle"),
      description: t("wp.disconnectBody"),
      confirmLabel: t("disconnect"),
      destructive: true,
      cancelLabel: t("cancel"),
    });
    if (!ok) return;
    startDisconnect(async () => {
      await disconnectWpBridge(projectId);
      router.refresh();
      onClose();
    });
  }

  const code = (chunks: React.ReactNode) => <code className="gsk-code">{chunks}</code>;
  const b = (chunks: React.ReactNode) => <strong>{chunks}</strong>;

  return (
    <GskSheet
      title={t("wp.sheetTitle")}
      subtitle={t("wp.sheetSubtitle")}
      icon={<Wrench className="size-4" />}
      closeLabel={t("cancel")}
      onClose={onClose}
    >
      <form className="gsk-sheet-form" onSubmit={submitKeepingFields(formAction)}>
        <input type="hidden" name="clientId" value={projectId} />
        <div className="gsk-drawer__body">
          <div className="gsk-sheet-section">
            <h4 className="gsk-section-title">{t("wp.stepsTitle")}</h4>
            <ol className="gsk-steps">
              <li>
                <span className="gsk-steps__index">1</span>
                <span>{t.rich("wp.step1", { code })}</span>
              </li>
              <li>
                <span className="gsk-steps__index">2</span>
                <span>{t.rich("wp.step2", { b })}</span>
              </li>
              <li>
                <span className="gsk-steps__index">3</span>
                <span>{t("wp.step3")}</span>
              </li>
            </ol>
          </div>
          <div className="gsk-sheet-section">
            <h4 className="gsk-section-title">{t("wp.fieldsTitle")}</h4>
            <SheetField label={t("wp.endpointLabel")} htmlFor="wp-endpoint">
              <input
                id="wp-endpoint"
                name="endpoint"
                type="url"
                required
                defaultValue={endpoint ?? ""}
                // Browsers autofilled a saved email address into this field;
                // a URL type plus autocomplete off stops the heuristic.
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="https://site-du-client.fr/wp-json/seo-tool/v1"
                className="gsk-input"
              />
            </SheetField>
            <SheetField label={t("wp.keyLabel")} htmlFor="wp-key" help={connected ? t("wp.keyHelpEdit") : t("wp.keyHelp")}>
              <input id="wp-key" name="key" type="password" required autoComplete="off" className="gsk-input" />
            </SheetField>
            {state && !state.ok ? <Message ok={false} text={state.error} /> : null}
          </div>
        </div>
        <footer className="gsk-drawer__footer">
          <div>
            {connected ? (
              <button type="button" className="gsk-btn gsk-btn--danger-text" disabled={disconnecting} onClick={disconnect}>
                {t("disconnect")}
              </button>
            ) : null}
          </div>
          <div className="gsk-drawer__footer-right">
            <button type="button" className="gsk-btn" onClick={onClose}>
              {t("cancel")}
            </button>
            <button type="submit" disabled={pending} className="gsk-btn gsk-btn--primary">
              {pending ? t("wp.connecting") : t("wp.connect")}
            </button>
          </div>
        </footer>
      </form>
    </GskSheet>
  );
}

const FIX_TYPES = ["title", "meta_description", "canonical", "robots", "schema"] as const;
type FixType = (typeof FIX_TYPES)[number];

function WordPressFixSheet({ projectId, onClose }: { projectId: number; onClose: () => void }) {
  const t = useTranslations("clientPage.projectSettings");
  const [state, formAction, pending] = useActionState<WpFixResult | null, FormData>(pushWpFix, null);
  const [fixType, setFixType] = useState<FixType>("title");
  const placeholder: Record<Exclude<FixType, "schema">, string> = {
    title: t("wp.phTitle"),
    meta_description: t("wp.phMeta"),
    canonical: "https://site-du-client.fr/page",
    robots: "noindex, follow",
  };

  return (
    <GskSheet
      title={t("wp.fixTitle")}
      subtitle={t("wp.fixSubtitle")}
      icon={<Send className="size-4" />}
      closeLabel={t("close")}
      onClose={onClose}
    >
      <form className="gsk-sheet-form" onSubmit={submitKeepingFields(formAction)}>
        <input type="hidden" name="clientId" value={projectId} />
        <div className="gsk-drawer__body">
          <div className="gsk-sheet-section">
            <SheetField label={t("wp.pageUrl")} htmlFor="wp-url">
              <input id="wp-url" name="url" required placeholder="https://site-du-client.fr/page" className="gsk-input" />
            </SheetField>
            <SheetField label={t("wp.fixType")} htmlFor="wp-fix-type">
              <select
                id="wp-fix-type"
                name="fixType"
                value={fixType}
                onChange={(e) => setFixType(e.target.value as FixType)}
                className="gsk-select"
              >
                {FIX_TYPES.map((f) => (
                  <option key={f} value={f}>
                    {t(`wp.fix_${f}`)}
                  </option>
                ))}
              </select>
            </SheetField>
            <SheetField label={t("wp.newValue")} htmlFor="wp-value" help={t("wp.revisionHint")}>
              {fixType === "schema" ? (
                <textarea
                  id="wp-value"
                  name="value"
                  required
                  rows={8}
                  placeholder='{"@context":"https://schema.org","@type":"Article",…}'
                  className="gsk-textarea font-mono text-xs"
                />
              ) : (
                <input id="wp-value" name="value" required placeholder={placeholder[fixType]} className="gsk-input" />
              )}
            </SheetField>
            {state?.ok ? <Message ok text={t("wp.pushed", { id: state.postId })} /> : null}
            {state && !state.ok ? <Message ok={false} text={state.error} /> : null}
          </div>
        </div>
        <footer className="gsk-drawer__footer">
          <div />
          <div className="gsk-drawer__footer-right">
            <button type="button" className="gsk-btn" onClick={onClose}>
              {t("close")}
            </button>
            <button type="submit" disabled={pending} className="gsk-btn gsk-btn--primary">
              {pending ? t("wp.pushing") : t("wp.push")}
            </button>
          </div>
        </footer>
      </form>
    </GskSheet>
  );
}

/* ------------------------------------------------------------------ */
/* Scheduled reports                                                   */
/* ------------------------------------------------------------------ */

/** Weekday names, Sunday first to match the stored dayOfWeek. 2024-01-07 was a Sunday. */
function weekdayNames(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" });
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2024, 0, 7 + i))));
}

function ReportsBlock({ projectId, reports }: { projectId: number; reports: ProjectSettingsProps["reports"] }) {
  const t = useTranslations("clientPage.projectSettings");
  const tr = useTranslations("clientPage.reportSchedule");
  const locale = useLocale();
  const days = weekdayNames(locale);
  const [editing, setEditing] = useState(false);
  const [sending, startSend] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { schedule, smtpConfigured } = reports;
  const muted = (text: string) => <span className="gsk-value--muted">{text}</span>;
  const date = (d: Date | null) => (d ? new Date(d).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) : null);

  function sendNow() {
    if (!schedule) return;
    setMsg(null);
    startSend(async () => {
      const r = await sendReportNow({ clientId: projectId, template: schedule.template, recipients: schedule.recipients.join(", ") });
      setMsg(r.ok ? { ok: true, text: tr("emailed") } : { ok: false, text: r.error ?? tr("failed") });
    });
  }

  return (
    <Block>
      <BlockHead
        title={t("reports.title")}
        description={t("reports.description")}
        action={
          <>
            {schedule && smtpConfigured ? (
              <button type="button" className="gsk-btn" onClick={sendNow} disabled={sending}>
                <Send className="size-4" />
                {sending ? tr("sending") : tr("sendNow")}
              </button>
            ) : null}
            <button
              type="button"
              className={schedule ? "gsk-btn" : "gsk-btn gsk-btn--primary"}
              onClick={() => setEditing(true)}
            >
              {schedule ? <Pencil className="size-4" /> : <CalendarClock className="size-4" />}
              {schedule ? t("edit") : t("reports.schedule")}
            </button>
          </>
        }
      />
      {!smtpConfigured ? (
        <ValueRow
          label={t("reports.smtp")}
          hint={tr.rich("smtpBody", {
            link: (chunks) => (
              <a href="/settings" className="gsk-link">
                {chunks}
              </a>
            ),
          })}
        >
          <span className="gsk-tag gsk-tag--warning">{tr("smtpMissing")}</span>
        </ValueRow>
      ) : null}
      <ValueRow label={t("reports.status")}>
        {schedule ? (
          <span className="gsk-tag gsk-tag--success">{t("reports.active")}</span>
        ) : (
          <span className="gsk-tag gsk-tag--default">{t("reports.none")}</span>
        )}
      </ValueRow>
      {schedule ? (
        <>
          <ValueRow label={tr("template")}>{tr("tplName", { template: schedule.template })}</ValueRow>
          <ValueRow label={t("reports.when")}>
            {t("reports.whenValue", {
              when:
                schedule.frequency === "monthly"
                  ? tr("monthlyOn", { day: schedule.dayOfMonth ?? 1 })
                  : tr("weeklyOn", { weekday: days[schedule.dayOfWeek ?? 1] }),
              hour: schedule.hourOfDay,
            })}
          </ValueRow>
          <ValueRow label={tr("recipients")}>
            <span className="break-all text-right">{schedule.recipients.join(", ")}</span>
          </ValueRow>
          <ValueRow label={t("reports.lastSent")}>{date(schedule.lastSentAt) ?? muted(t("reports.never"))}</ValueRow>
          <ValueRow label={t("reports.nextSend")}>{date(schedule.nextSendAt) ?? muted("—")}</ValueRow>
        </>
      ) : null}
      {msg ? <Message ok={msg.ok} text={msg.text} /> : null}

      {editing ? <ReportSheet projectId={projectId} schedule={schedule} onClose={() => setEditing(false)} /> : null}
    </Block>
  );
}

function ReportSheet({
  projectId,
  schedule,
  onClose,
}: {
  projectId: number;
  schedule: Schedule | null;
  onClose: () => void;
}) {
  const t = useTranslations("clientPage.projectSettings");
  const tr = useTranslations("clientPage.reportSchedule");
  const locale = useLocale();
  const days = weekdayNames(locale);
  const router = useRouter();
  const [state, formAction, pending] = useActionState<SaveScheduleResult | null, FormData>(saveSchedule, null);
  const [frequency, setFrequency] = useState<Schedule["frequency"]>(schedule?.frequency ?? "monthly");
  const [removing, startRemove] = useTransition();

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      onClose();
    }
  }, [state, router, onClose]);

  async function remove() {
    if (!schedule) return;
    const ok = await confirmDialog({
      title: t("reports.removeTitle"),
      description: t("reports.removeBody"),
      confirmLabel: tr("remove"),
      destructive: true,
      cancelLabel: t("cancel"),
    });
    if (!ok) return;
    startRemove(async () => {
      await deleteSchedule(schedule.id, projectId);
      router.refresh();
      onClose();
    });
  }

  return (
    <GskSheet
      title={t("reports.sheetTitle")}
      subtitle={t("reports.sheetSubtitle")}
      icon={<CalendarClock className="size-4" />}
      closeLabel={t("cancel")}
      onClose={onClose}
    >
      <form className="gsk-sheet-form" onSubmit={submitKeepingFields(formAction)}>
        <input type="hidden" name="clientId" value={projectId} />
        <div className="gsk-drawer__body">
          <div className="gsk-sheet-section">
            <h4 className="gsk-section-title">{t("reports.stepWho")}</h4>
            <SheetField label={tr("recipients")} htmlFor="rs-recipients" help={tr("recipientsHint")}>
              <textarea
                id="rs-recipients"
                name="recipients"
                rows={3}
                required
                defaultValue={schedule?.recipients.join(", ") ?? ""}
                placeholder="client@exemple.fr, equipe@exemple.fr"
                className="gsk-textarea"
              />
            </SheetField>
          </div>
          <div className="gsk-sheet-section">
            <h4 className="gsk-section-title">{t("reports.stepWhat")}</h4>
            <SheetField label={tr("template")} htmlFor="rs-template">
              <select id="rs-template" name="template" defaultValue={schedule?.template ?? "detailed"} className="gsk-select">
                <option value="detailed">{tr("tplDetailed")}</option>
                <option value="executive">{tr("tplExecutive")}</option>
                <option value="technical">{tr("tplTechnical")}</option>
              </select>
            </SheetField>
          </div>
          <div className="gsk-sheet-section">
            <h4 className="gsk-section-title">{t("reports.stepWhen")}</h4>
            <div className="gsk-sheet-grid">
              <SheetField label={tr("frequency")} htmlFor="rs-frequency">
                <select
                  id="rs-frequency"
                  name="frequency"
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as Schedule["frequency"])}
                  className="gsk-select"
                >
                  <option value="monthly">{tr("monthly")}</option>
                  <option value="weekly">{tr("weekly")}</option>
                </select>
              </SheetField>
              {/* The server validates both days whatever the frequency
                  (schedule-actions.ts: a missing one coerces to 0 and fails
                  min(1)), so the day not shown is still sent. Without
                  this a weekly schedule could never be saved. */}
              {frequency === "monthly" ? (
                <input type="hidden" name="dayOfWeek" value={String(schedule?.dayOfWeek ?? 1)} />
              ) : (
                <input type="hidden" name="dayOfMonth" value={String(schedule?.dayOfMonth ?? 1)} />
              )}
              {frequency === "monthly" ? (
                <SheetField label={tr("dayOfMonth")} htmlFor="rs-dom" help={tr("cappedHint")}>
                  <select id="rs-dom" name="dayOfMonth" defaultValue={String(schedule?.dayOfMonth ?? 1)} className="gsk-select">
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>
                        {tr("dayOrdinal", { d })}
                      </option>
                    ))}
                  </select>
                </SheetField>
              ) : (
                <SheetField label={tr("dayOfWeek")} htmlFor="rs-dow">
                  <select id="rs-dow" name="dayOfWeek" defaultValue={String(schedule?.dayOfWeek ?? 1)} className="gsk-select">
                    {days.map((label, i) => (
                      <option key={i} value={i}>
                        {label}
                      </option>
                    ))}
                  </select>
                </SheetField>
              )}
            </div>
            <SheetField label={tr("hourOfDay")} htmlFor="rs-hour" help={tr("hourHint")}>
              <input
                id="rs-hour"
                name="hourOfDay"
                type="number"
                min={0}
                max={23}
                defaultValue={schedule?.hourOfDay ?? 9}
                className="gsk-input w-24"
              />
            </SheetField>
            {state && !state.ok ? <Message ok={false} text={state.error} /> : null}
          </div>
        </div>
        <footer className="gsk-drawer__footer">
          <div>
            {schedule ? (
              <button type="button" className="gsk-btn gsk-btn--danger-text" disabled={removing} onClick={remove}>
                {tr("remove")}
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
