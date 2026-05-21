"use client";

import { useState, useTransition } from "react";
import { Loader2, Upload } from "lucide-react";
import { importAhrefsBacklinks, type AhrefsImportResult } from "./actions";

/**
 * Client-side companion to /backlinks honesty banner. Accepts an Ahrefs
 * WMT CSV export and posts it to the server action. Shows the user
 * inserted / duplicate / skipped counts after.
 *
 * Done on the client so we can read the CSV file in-browser before
 * sending text up — keeps the server action small and avoids
 * multipart form handling.
 */
export function ImportAhrefsForm({
  clients,
}: {
  clients: { id: number; name: string }[];
}) {
  const [, startTransition] = useTransition();
  const [clientId, setClientId] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AhrefsImportResult | null>(null);

  if (clients.length === 0) return null;

  return (
    <form
      className="rounded-xl border border-white/[0.06] bg-card/40 px-4 py-3 text-[12px]"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const file = fd.get("csv") as File | null;
        const cid = Number(fd.get("clientId"));
        if (!file || !Number.isFinite(cid) || cid <= 0) return;
        setBusy(true);
        setResult(null);
        const reader = new FileReader();
        reader.onload = () => {
          const text = String(reader.result ?? "");
          startTransition(async () => {
            const r = await importAhrefsBacklinks(cid, text);
            setBusy(false);
            setResult(r);
          });
        };
        reader.onerror = () => {
          setBusy(false);
          setResult({ ok: false, error: "Could not read the file" });
        };
        reader.readAsText(file);
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-foreground">
          <Upload className="size-3.5 text-muted-foreground" />
          Import from Ahrefs Webmaster Tools
        </span>
        <select
          name="clientId"
          required
          value={clientId}
          onChange={(e) => setClientId(Number(e.target.value) || "")}
          className="h-7 rounded-md border border-white/10 bg-white/[0.04] px-2 text-[11px] text-foreground"
        >
          <option value="">Pick a client…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          type="file"
          name="csv"
          accept=".csv,text/csv"
          required
          className="text-[11px] file:mr-2 file:cursor-pointer file:rounded-md file:border-0 file:bg-violet-500/15 file:px-2 file:py-1 file:text-[11px] file:text-violet-300 hover:file:bg-violet-500/25"
        />
        <button
          type="submit"
          disabled={busy || !clientId}
          className="inline-flex h-7 items-center gap-1 rounded-md bg-violet-500/15 px-3 text-[11px] font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : null}
          {busy ? "Importing…" : "Import"}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Export from Ahrefs → Site Explorer → Backlinks → Export CSV. We
        dedupe by source URL, so re-running the import after a fresh
        Ahrefs export only adds new links.
      </p>
      {result && result.ok && (
        <div className="mt-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] text-emerald-200">
          Added {result.inserted} new backlink{result.inserted === 1 ? "" : "s"}.
          Skipped {result.duplicates} duplicate{result.duplicates === 1 ? "" : "s"}
          {result.skipped > 0
            ? `, ${result.skipped} unparseable row${result.skipped === 1 ? "" : "s"}.`
            : "."}
        </div>
      )}
      {result && !result.ok && (
        <div className="mt-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-200">
          {result.error}
        </div>
      )}
    </form>
  );
}
