"use client";

import { useActionState, useRef, useState } from "react";
import { Upload, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  importClientsCsv,
  type ImportClientsResult,
} from "./import-actions";

export function ImportClientsButton() {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState("");

  const [state, formAction, pending] = useActionState<
    ImportClientsResult | null,
    FormData
  >(importClientsCsv, null);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result ?? ""));
    reader.readAsText(file);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 text-xs hover:bg-white/10"
      >
        <Upload className="size-3.5" />
        Import CSV
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="mt-[8vh] w-full max-w-xl rounded-2xl border border-white/10 bg-card/95 p-5 shadow-2xl backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">Import clients</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Bulk-add clients from CSV. Accepted columns:{" "}
              <code className="rounded bg-white/5 px-1 py-0.5">name,url,niche</code>{" "}
              (header optional). We auto-detect tech stack on each one — bigger
              imports take longer.
            </p>

            <form action={formAction} className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="csv">CSV content</Label>
                <textarea
                  id="csv"
                  name="csv"
                  value={csv}
                  onChange={(e) => setCsv(e.target.value)}
                  rows={10}
                  required
                  placeholder="name,url,niche&#10;Acme Coffee,acmecoffee.com,ecommerce&#10;Foo Lawyers,foolaw.com,services&#10;..."
                  className="flex w-full rounded-md border border-white/10 bg-card/60 px-3 py-2 font-mono text-xs"
                />
                <div className="flex items-center justify-between text-[11px]">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="text-muted-foreground hover:text-foreground hover:underline"
                  >
                    or upload a file…
                  </button>
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

              <div className="flex items-center gap-2 pt-2">
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
    </>
  );
}
