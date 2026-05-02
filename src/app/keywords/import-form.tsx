"use client";

import { useActionState, useRef, useState } from "react";
import { Upload, FileDown, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { importKeywords, type ImportResult } from "./import-actions";

export function CsvImportExport({
  clients,
}: {
  clients: { id: number; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState("");
  const [filename, setFilename] = useState<string | null>(null);

  const [state, formAction, pending] = useActionState<
    ImportResult | null,
    FormData
  >(importKeywords, null);

  const handleFile = (file: File) => {
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result ?? ""));
    reader.readAsText(file);
  };

  return (
    <div className="flex items-center gap-2">
      <a
        href="/keywords/export.csv"
        className="inline-flex h-8 items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2.5 text-xs hover:bg-white/10"
      >
        <FileDown className="size-3" />
        Export CSV
      </a>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2.5 text-xs hover:bg-white/10"
      >
        <Upload className="size-3" />
        {open ? "Close import" : "Import CSV"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="mt-[10vh] w-full max-w-lg rounded-2xl border border-white/10 bg-card/95 p-5 shadow-2xl backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">Import keywords</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Pick a client and paste/upload a CSV. We accept{" "}
              <code className="rounded bg-white/5 px-1 py-0.5 text-[10px]">
                query
              </code>{" "}
              alone, or{" "}
              <code className="rounded bg-white/5 px-1 py-0.5 text-[10px]">
                query,country,device
              </code>
              . Duplicates per client are skipped.
            </p>

            <form action={formAction} className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="clientId">For client</Label>
                <select
                  id="clientId"
                  name="clientId"
                  defaultValue={clients[0]?.id ?? ""}
                  required
                  className="flex h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 py-1 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="csv">CSV content</Label>
                <textarea
                  id="csv"
                  name="csv"
                  value={csv}
                  onChange={(e) => setCsv(e.target.value)}
                  placeholder="query,country,device&#10;best running shoes,US,desktop&#10;..."
                  rows={8}
                  required
                  className="flex w-full rounded-md border border-white/10 bg-card/60 px-3 py-2 font-mono text-xs shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
                <div className="flex items-center justify-between text-[11px]">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="text-muted-foreground hover:text-foreground hover:underline"
                  >
                    or upload a file…
                  </button>
                  {filename && (
                    <span className="text-muted-foreground">
                      Loaded: {filename}
                    </span>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = "";
                  }}
                />
              </div>

              {state && (
                <div
                  className={
                    state.ok
                      ? "flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300"
                      : "flex items-center gap-2 rounded-md border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs text-rose-300"
                  }
                >
                  {state.ok ? (
                    <CheckCircle2 className="size-3.5" />
                  ) : (
                    <AlertCircle className="size-3.5" />
                  )}
                  {state.ok
                    ? `Imported ${state.added} of ${state.total} (${state.skipped} duplicates / blanks skipped).`
                    : state.error}
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button
                  type="submit"
                  disabled={pending || csv.trim().length === 0}
                >
                  {pending ? "Importing…" : "Import"}
                </Button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Close
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
