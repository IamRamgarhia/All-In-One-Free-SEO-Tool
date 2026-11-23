import { getTranslations, getLocale } from "next-intl/server";
import path from "node:path";
import { statSync, existsSync, readdirSync } from "node:fs";
import {
  Database,
  Download,
  Upload,
  Clock,
  FileText,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { RestoreForm } from "./restore-form";
import { AutoBackupCard } from "./auto-backup-card";
import { getSetting } from "@/lib/settings-store";
import { requireSettingsPage } from "../access";

export const dynamic = "force-dynamic";

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default async function BackupPage() {
  await requireSettingsPage("/settings/backup", { owner: true });
  const tx = await getTranslations("ui.app_settings_backup_page");
  const locale = await getLocale();
  const dbPath = process.env.SEO_DB_PATH ?? path.join(process.cwd(), "data.db");
  const dbAbs = path.resolve(dbPath);
  const dbExists = existsSync(dbAbs);
  const dbSize = dbExists ? statSync(dbAbs).size : 0;
  const dbMtime = dbExists ? statSync(dbAbs).mtime : null;

  // Auto-backup status (defaults: enabled, 24h cadence, keep 7).
  const [
    autoEnabled,
    autoCadence,
    autoRetention,
    autoLastRun,
    autoLastBytes,
    autoLastErr,
  ] = await Promise.all([
    getSetting<boolean>("autobackup.enabled"),
    getSetting<number>("autobackup.cadence_hours"),
    getSetting<number>("autobackup.retention"),
    getSetting<string>("autobackup.last_run_at"),
    getSetting<number>("autobackup.last_bytes"),
    getSetting<string>("autobackup.last_error"),
  ]);

  // Look for prior backup files (.bak-...) in the same folder
  const dir = path.dirname(dbAbs);
  const dbName = path.basename(dbAbs);
  let priorBackups: { name: string; size: number; mtime: Date }[] = [];
  try {
    const all = readdirSync(dir);
    priorBackups = all
      .filter((f) => f.startsWith(`${dbName}.bak-`))
      .map((f) => {
        const fp = path.join(dir, f);
        const s = statSync(fp);
        return { name: f, size: s.size, mtime: s.mtime };
      })
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
      .slice(0, 5);
  } catch {
    priorBackups = [];
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">

      <PageHeader
        title={tx("backupRestore")}
        description={tx("everyClientAuditKeywordRanking")}
        icon={Database}
        accent="cyan"
      />

      {/* Backup ALL */}
      <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3">
        <header>
          <h2 className="text-base font-semibold inline-flex items-center gap-2">
            <Download className="size-4 text-cyan-300" />
            {tx("backUpEverythingRecommended")}
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {tx("oneClickDownloadsTheEntire")}
          </p>
        </header>

        <div className="grid gap-2 sm:grid-cols-3 text-xs">
          <div className="rounded-md bg-white/[0.03] p-2 ring-1 ring-inset ring-white/5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {tx("file")}
            </p>
            <p className="font-mono break-all text-[11px]">{dbAbs}</p>
          </div>
          <div className="rounded-md bg-white/[0.03] p-2 ring-1 ring-inset ring-white/5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {tx("currentSize")}
            </p>
            <p>{fmtBytes(dbSize)}</p>
          </div>
          <div className="rounded-md bg-white/[0.03] p-2 ring-1 ring-inset ring-white/5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {tx("lastModified")}
            </p>
            <p>{dbMtime?.toLocaleString(locale) ?? "—"}</p>
          </div>
        </div>

        <a
          href="/api/backup"
          className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-500/15 px-4 text-sm font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25"
          download
        >
          <Download className="size-4" />
          {tx("downloadDataDb", { v: fmtBytes(dbSize) })}
        </a>
        <p className="text-[10px] text-muted-foreground">
          {tx("toMoveToADifferent")}
        </p>
      </section>

      <AutoBackupCard
        enabled={autoEnabled !== false}
        cadenceHours={typeof autoCadence === "number" && autoCadence > 0 ? autoCadence : 24}
        retention={typeof autoRetention === "number" && autoRetention > 0 ? autoRetention : 7}
        lastRunIso={autoLastRun ?? null}
        lastBytes={typeof autoLastBytes === "number" ? autoLastBytes : null}
        lastError={autoLastErr || null}
      />

      {/* Per-area CSV exports */}
      <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3">
        <header>
          <h2 className="text-base font-semibold inline-flex items-center gap-2">
            <FileText className="size-4 text-violet-300" />
            {tx("exportSpecificDataAsCsv")}
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {tx("forSharingWithExcelGoogle")}
          </p>
        </header>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4 text-xs">
          {[
            { href: "/clients/export.csv", label: tx("clients") },
            { href: "/audits/export.csv", label: tx("audits") },
            { href: "/keywords/export.csv", label: tx("keywords") },
            { href: "/tasks/export.csv", label: tx("tasks") },
            { href: "/backlinks/export.csv", label: tx("backlinks") },
            { href: "/reports/export.csv", label: tx("reports") },
            { href: "/competitors/export.csv", label: tx("competitors") },
            { href: "/monitor/export.csv", label: tx("pageMonitor") },
            { href: "/outreach/export.csv", label: tx("outreach") },
          ].map((x) => (
            <a
              key={x.href}
              href={x.href}
              download
              className="inline-flex items-center justify-between rounded-md bg-white/[0.03] px-3 py-2 ring-1 ring-inset ring-white/5 hover:bg-white/[0.06]"
            >
              <span>{x.label}</span>
              <Download className="size-3 text-muted-foreground" />
            </a>
          ))}
        </div>
      </section>

      {/* Restore */}
      <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3">
        <header>
          <h2 className="text-base font-semibold inline-flex items-center gap-2">
            <Upload className="size-4 text-amber-300" />
            {tx("restoreFromBackup")}
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {tx.rich("uploadAPreviouslyDownloadedData", { b0: (chunks) => <code className="font-mono">{chunks}</code> })}
          </p>
        </header>
        <div className="rounded-md bg-amber-500/10 p-3 text-[11px] text-amber-300 ring-1 ring-inset ring-amber-500/30">
          {tx("restoringReplacesAllCurrentData")}
        </div>
        <RestoreForm />
      </section>

      {/* Prior backups */}
      {priorBackups.length > 0 && (
        <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-2">
          <header>
            <h2 className="text-base font-semibold inline-flex items-center gap-2">
              <Clock className="size-4 text-muted-foreground" />
              {tx("autoSavedBackupsLast5")}
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {tx("createdAutomaticallyBeforeEachRestore")}
            </p>
          </header>
          <ul className="space-y-1 text-xs">
            {priorBackups.map((b) => (
              <li
                key={b.name}
                className="flex items-center justify-between rounded-md bg-white/[0.03] px-3 py-2 ring-1 ring-inset ring-white/5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[11px]">{b.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {b.mtime.toLocaleString(locale)} · {fmtBytes(b.size)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
