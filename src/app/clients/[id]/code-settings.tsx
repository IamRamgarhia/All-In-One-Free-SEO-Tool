"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Code2, Pencil } from "lucide-react";
import { GskSheet, SheetField, ValueRow } from "@/app/settings/gsk-sheet";
import type { ClientCodeView } from "@/lib/code-agent-view";
import { saveClientCode, type SaveCodeResult } from "./code-actions";

export type ClientCodeSettingsProps = {
  projectId: number;
  settings: {
    localPath: string | null;
    githubRepo: string | null;
    baseBranch: string;
    prMode: "off" | "pr" | "pr_batch";
    enabled: boolean;
  };
  view: ClientCodeView;
};

const PR_MODES = ["off", "pr", "pr_batch"] as const;

/**
 * The client's code, in the project's settings tab (owners and managers
 * only; the page decides): where the source lives, the GitHub repository,
 * how Claude Code hands work back, and its switch for this client, off by
 * default. Values here, changes in a sheet, like the blocks above it.
 *
 * Says plainly what is missing on this machine (Claude Code, gh, git) and
 * that "Copy the prompt" on the Tasks page works without any of it.
 */
export function ClientCodeSettings({ projectId, settings, view }: ClientCodeSettingsProps) {
  const t = useTranslations("clientCode.settings");
  const tc = useTranslations("clientCode");
  const [editing, setEditing] = useState(false);
  const muted = (text: string) => <span className="gsk-value--muted">{text}</span>;
  const status = view.forcedOff ? "forcedOff" : settings.enabled ? "on" : "off";

  return (
    <section id="code" className="gsk-block scroll-mt-20 rounded-2xl border border-border bg-card px-5 py-4">
      <div className="gsk-block-head gsk-block-head--action">
        <div>
          <h2 className="gsk-block-title">{t("title")}</h2>
          <p className="gsk-block-description">{t("description")}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" className="gsk-btn" onClick={() => setEditing(true)}>
            <Pencil className="size-4" />
            {t("edit")}
          </button>
        </div>
      </div>

      <ValueRow label={t("status")} hint={t(`statusHint.${status}`)}>
        <span
          className={`gsk-tag ${status === "on" ? "gsk-tag--success" : status === "forcedOff" ? "gsk-tag--warning" : "gsk-tag--default"}`}
        >
          {t(`statusValue.${status}`)}
        </span>
      </ValueRow>
      <ValueRow label={t("folder")}>
        {settings.localPath ? <span className="break-all font-mono text-[13px]">{settings.localPath}</span> : muted(t("notSet"))}
      </ValueRow>
      <ValueRow label={t("repo")}>
        {settings.githubRepo ? (
          <span className="break-all font-mono text-[13px]">
            {settings.githubRepo} <span className="text-muted-foreground">({settings.baseBranch})</span>
          </span>
        ) : (
          muted(t("notSet"))
        )}
      </ValueRow>
      <ValueRow label={t("handBack")} hint={t(`modeHint.${settings.prMode}`)}>
        {t(`mode.${settings.prMode}`)}
      </ValueRow>
      <ValueRow label={t("machine")} hint={t("machineHint")}>
        <span className="flex flex-wrap gap-1.5">
          {(["claude", "gh", "git"] as const).map((tool) => (
            <span key={tool} className={`gsk-tag ${view.tools[tool] ? "gsk-tag--success" : "gsk-tag--default"}`}>
              {t(`tools.${tool}`)} · {view.tools[tool] ? t("found") : t("notFound")}
            </span>
          ))}
        </span>
      </ValueRow>

      <p className="gsk-note mt-3">
        {tc("manual.short")}{" "}
        <Link href={`/tasks?client=${projectId}`} className="text-violet-300 hover:underline">
          {t("openTasks")}
        </Link>
      </p>

      {editing ? (
        <CodeSheet projectId={projectId} settings={settings} view={view} onClose={() => setEditing(false)} />
      ) : null}
    </section>
  );
}

function CodeSheet({
  projectId,
  settings,
  view,
  onClose,
}: {
  projectId: number;
  settings: ClientCodeSettingsProps["settings"];
  view: ClientCodeView;
  onClose: () => void;
}) {
  const t = useTranslations("clientCode.settings");
  const router = useRouter();
  const [repo, setRepo] = useState(settings.githubRepo ?? "");
  const [mode, setMode] = useState<(typeof PR_MODES)[number]>(settings.prMode);
  const [state, dispatch, pending] = useActionState<SaveCodeResult | null, FormData>(saveClientCode, null);

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
      icon={<Code2 className="size-4" />}
      closeLabel={t("cancel")}
      onClose={onClose}
    >
      <form
        className="gsk-sheet-form"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() => dispatch(data));
        }}
      >
        <input type="hidden" name="clientId" value={projectId} />
        <input type="hidden" name="prMode" value={repo.trim() ? mode : "off"} />
        <div className="gsk-drawer__body">
          <div className="gsk-sheet-section">
            <h4 className="gsk-section-title">{t("stepSource")}</h4>
            <SheetField label={t("folder")} htmlFor="code-folder" help={t("folderHelp")}>
              <input
                id="code-folder"
                name="localPath"
                defaultValue={settings.localPath ?? ""}
                placeholder={t("folderPlaceholder")}
                className="gsk-input font-mono"
                autoComplete="off"
                spellCheck={false}
              />
            </SheetField>
            <SheetField label={t("repo")} htmlFor="code-repo" help={t("repoHelp")}>
              <input
                id="code-repo"
                name="githubRepo"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="agence/site-client"
                className="gsk-input font-mono"
                autoComplete="off"
                spellCheck={false}
              />
            </SheetField>
            <SheetField label={t("branch")} htmlFor="code-branch" help={t("branchHelp")}>
              <input
                id="code-branch"
                name="baseBranch"
                defaultValue={settings.baseBranch}
                placeholder="main"
                className="gsk-input font-mono"
                autoComplete="off"
                spellCheck={false}
              />
            </SheetField>
          </div>

          <div className="gsk-sheet-section">
            <h4 className="gsk-section-title">{t("handBack")}</h4>
            <div role="radiogroup" aria-label={t("handBack")} className="space-y-2">
              {PR_MODES.map((m) => {
                const disabled = m !== "off" && !repo.trim();
                const active = (repo.trim() ? mode : "off") === m;
                return (
                  <label
                    key={m}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-sm ${
                      active ? "border-violet-500/40 bg-violet-500/10" : "border-border"
                    } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    <input
                      type="radio"
                      name="prModeChoice"
                      value={m}
                      checked={active}
                      disabled={disabled}
                      onChange={() => setMode(m)}
                      className="mt-1"
                    />
                    <span className="min-w-0">
                      <span className="block font-medium">{t(`mode.${m}`)}</span>
                      <span className="gsk-help block">{t(`modeHint.${m}`)}</span>
                    </span>
                  </label>
                );
              })}
              {!repo.trim() ? <p className="gsk-help m-0">{t("needRepo")}</p> : null}
            </div>
          </div>

          <div className="gsk-sheet-section">
            <h4 className="gsk-section-title">{t("stepAgent")}</h4>
            <label className="gsk-sheet-switch">
              <span className="min-w-0 flex-1">
                <span className="block text-sm">{t("switchLabel")}</span>
                <span className="gsk-help mt-0.5 block">
                  {view.forcedOff ? t("statusHint.forcedOff") : t("switchHelp")}
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                name="codeAgentEnabled"
                defaultChecked={settings.enabled && !view.forcedOff}
                disabled={view.forcedOff}
                className="gsk-switch"
              />
            </label>
            <ul className="gsk-help m-0 list-disc space-y-1 pl-5">
              <li>{t("safety.click")}</li>
              <li>{t("safety.branch")}</li>
              <li>{t("safety.documents")}</li>
              <li>{t("safety.token")}</li>
            </ul>
            {!view.tools.claude ? <p className="gsk-note m-0">{t("claudeMissing")}</p> : null}
          </div>

          {state && !state.ok ? (
            <p className="gsk-result gsk-status-error" role="alert">
              <AlertCircle className="mr-1 inline size-4" />
              {t(`errors.${state.code}`)}
            </p>
          ) : null}
          {state?.ok ? (
            <p className="gsk-result gsk-status-ok">
              <CheckCircle2 className="mr-1 inline size-4" />
              {t("saved")}
            </p>
          ) : null}
        </div>
        <footer className="gsk-drawer__footer">
          <div />
          <div className="gsk-drawer__footer-right">
            <button type="button" className="gsk-btn" onClick={onClose}>
              {t("cancel")}
            </button>
            <button type="submit" disabled={pending} className="gsk-btn gsk-btn--primary">
              {pending ? t("saving") : t("save")}
            </button>
          </div>
        </footer>
      </form>
    </GskSheet>
  );
}
