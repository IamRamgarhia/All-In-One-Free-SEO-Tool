import path from "node:path";
import { statSync, existsSync, readdirSync } from "node:fs";
import Link from "next/link";
import {
  ArrowLeft,
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

export const dynamic = "force-dynamic";

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default async function BackupPage() {
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
      <Link
        href="/settings"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" /> Back to settings
      </Link>

      <PageHeader
        title="Backup & restore"
        description="Every client, audit, keyword, ranking, report, AI chat, error log, integration credential lives in one SQLite file. Back it up to save everything. Restore overwrites the running database with whatever file you upload."
        icon={Database}
        accent="cyan"
      />

      {/* Backup ALL */}
      <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3">
        <header>
          <h2 className="text-base font-semibold inline-flex items-center gap-2">
            <Download className="size-4 text-cyan-300" />
            Back up everything (recommended)
          </h2>
          <p className="text-[11px] text-muted-foreground">
            One click → downloads the entire data.db file. The single-file
            backup is the whole point of SQLite — no per-table fuss.
          </p>
        </header>

        <div className="grid gap-2 sm:grid-cols-3 text-xs">
          <div className="rounded-md bg-white/[0.03] p-2 ring-1 ring-inset ring-white/5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              File
            </p>
            <p className="font-mono break-all text-[11px]">{dbAbs}</p>
          </div>
          <div className="rounded-md bg-white/[0.03] p-2 ring-1 ring-inset ring-white/5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Current size
            </p>
            <p>{fmtBytes(dbSize)}</p>
          </div>
          <div className="rounded-md bg-white/[0.03] p-2 ring-1 ring-inset ring-white/5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Last modified
            </p>
            <p>{dbMtime?.toLocaleString() ?? "—"}</p>
          </div>
        </div>

        <a
          href="/api/backup"
          className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-500/15 px-4 text-sm font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25"
          download
        >
          <Download className="size-4" />
          Download data.db ({fmtBytes(dbSize)})
        </a>
        <p className="text-[10px] text-muted-foreground">
          To move to a different computer: download this file, install on the
          new machine, then upload it via Restore below. Done.
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
            Export specific data as CSV
          </h2>
          <p className="text-[11px] text-muted-foreground">
            For sharing with Excel / Google Sheets. Pick what to export — each
            link downloads a CSV instantly.
          </p>
        </header>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4 text-xs">
          {[
            { href: "/clients/export.csv", label: "Clients" },
            { href: "/audits/export.csv", label: "Audits" },
            { href: "/keywords/export.csv", label: "Keywords" },
            { href: "/tasks/export.csv", label: "Tasks" },
            { href: "/backlinks/export.csv", label: "Backlinks" },
            { href: "/reports/export.csv", label: "Reports" },
            { href: "/competitors/export.csv", label: "Competitors" },
            { href: "/monitor/export.csv", label: "Page monitor" },
            { href: "/outreach/export.csv", label: "Outreach" },
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
            Restore from backup
          </h2>
          <p className="text-[11px] text-muted-foreground">
            Upload a previously-downloaded data.db. The current data.db is
            saved as <code className="font-mono">data.db.bak-...</code>{" "}
            before overwriting, so you have a safety net.
          </p>
        </header>
        <div className="rounded-md bg-amber-500/10 p-3 text-[11px] text-amber-300 ring-1 ring-inset ring-amber-500/30">
          ⚠ Restoring REPLACES all current data. The server needs a restart
          after upload to release the file handle. Stop the dev server + re-run
          the installer to fully reload.
        </div>
        <RestoreForm />
      </section>

      {/* Prior backups */}
      {priorBackups.length > 0 && (
        <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-2">
          <header>
            <h2 className="text-base font-semibold inline-flex items-center gap-2">
              <Clock className="size-4 text-muted-foreground" />
              Auto-saved backups (last 5)
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Created automatically before each restore. Files live next to
              your data.db.
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
                    {b.mtime.toLocaleString()} · {fmtBytes(b.size)}
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
