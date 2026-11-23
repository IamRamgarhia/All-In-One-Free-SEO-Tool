"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import {
  Download,
  Filter,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import {
  deleteArchivedReport,
  pinArchivedReport,
} from "./actions";

type Row = {
  id: number;
  clientId: number;
  title: string;
  template: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  pdfBytes: number | null;
  pinned: boolean;
  createdAt: Date;
  clientName: string | null;
};

export function ArchiveClient({
  archives,
  clients,
  currentClient,
}: {
  archives: Row[];
  clients: { id: number; name: string }[];
  currentClient: number | null;
}) {
  const t = useTranslations("auditUi.reports.archive");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();

  return (
    <>
      <section className="rounded-2xl border border-white/5 bg-card/40 p-3 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Filter className="size-3 text-muted-foreground" />
          <Link
            href="/reports/archive"
            className={pillClass(currentClient === null)}
          >
            {t("allClients")}
          </Link>
          {clients.map((c) => (
            <Link
              key={c.id}
              href={`/reports/archive?client=${c.id}`}
              className={pillClass(currentClient === c.id)}
            >
              {c.name}
            </Link>
          ))}
        </div>
      </section>

      {archives.length === 0 ? (
        <p className="rounded-2xl border border-white/5 bg-card/40 px-5 py-12 text-center text-sm text-muted-foreground backdrop-blur-md">
          {t("empty")}
        </p>
      ) : (
        <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
          {archives.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 px-5 py-3 text-sm"
            >
              {a.pinned && <Pin className="size-3 shrink-0 text-amber-300" />}
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="truncate font-medium">{a.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  {a.clientName ?? t("deletedClient")}
                  {a.template ? ` · ${a.template}` : ""}
                  {" · "}
                  {a.pdfBytes ? `${Math.round(a.pdfBytes / 1024)} KB` : t("noPdf")}
                  {" · "}
                  {new Date(a.createdAt).toLocaleDateString(locale)}
                </p>
              </div>
              {a.pdfBytes && a.pdfBytes > 0 && (
                <a
                  href={`/api/report-archives/${a.id}/pdf`}
                  className="inline-flex h-7 items-center gap-1 rounded-md bg-emerald-500/15 px-2.5 text-[11px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25"
                  title={t("downloadTitle")}
                >
                  <Download className="size-3" />
                  {t("download")}
                </a>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    await pinArchivedReport(a.id);
                  });
                }}
                className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-amber-500/15 hover:text-amber-300 disabled:opacity-50"
                title={a.pinned ? t("unpin") : t("pin")}
              >
                {a.pinned ? (
                  <PinOff className="size-3.5" />
                ) : (
                  <Pin className="size-3.5" />
                )}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: t("deleteTitle"),
                    description: t("deleteDescription"),
                    confirmLabel: t("deleteConfirm"),
                    destructive: true,
                  });
                  if (!ok) return;
                  startTransition(async () => {
                    await deleteArchivedReport(a.id);
                  });
                }}
                className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-50"
                title={t("delete")}
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function pillClass(active: boolean): string {
  return `rounded-full px-2.5 py-1 ring-1 ring-inset transition-colors ${
    active
      ? "bg-violet-500/15 text-violet-300 ring-violet-500/30"
      : "bg-white/5 text-muted-foreground ring-white/10 hover:bg-white/10"
  }`;
}
