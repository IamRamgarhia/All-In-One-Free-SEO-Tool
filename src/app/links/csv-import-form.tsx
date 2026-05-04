"use client";

import { useActionState, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { importShortLinksCsv, type ImportShortLinksResult } from "./actions";

export function CsvImportForm({
  clients,
}: {
  clients: { id: number; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<
    ImportShortLinksResult | null,
    FormData
  >(importShortLinksCsv, null);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1 rounded-md bg-white/5 px-4 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10 hover:text-foreground"
      >
        <Upload className="size-3" />
        Bulk CSV import
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Upload className="size-4 text-cyan-300" />
          Bulk CSV import
        </h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Format:{" "}
        <code className="rounded bg-white/5 px-1.5 py-0.5">
          destination,label,custom_slug,utm_source,utm_medium,utm_campaign
        </code>
        . Only <strong>destination</strong> is required. Lines starting with{" "}
        <code>#</code> are ignored.
      </p>

      <label className="block space-y-1 text-xs">
        <span className="text-muted-foreground">For client (optional)</span>
        <select
          name="clientId"
          defaultValue=""
          className="flex h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
        >
          <option value="">Workspace-wide</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1 text-xs">
        <span className="text-muted-foreground">CSV body</span>
        <textarea
          name="csv"
          required
          rows={10}
          placeholder={
            "https://yoursite.com/blog/post,January post,jan-post,linkedin,social,jan-launch\nhttps://yoursite.com/case-study"
          }
          className="w-full rounded-md border border-white/10 bg-card/60 px-3 py-2 font-mono text-xs focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-9 items-center rounded-md bg-cyan-500/15 px-4 text-xs font-medium text-cyan-300 ring-1 ring-inset ring-cyan-500/30 hover:bg-cyan-500/25 disabled:opacity-50"
      >
        {pending ? (
          <>
            <Loader2 className="mr-2 size-3 animate-spin" />
            Importing…
          </>
        ) : (
          "Import"
        )}
      </button>

      {state && state.ok && (
        <div className="text-xs text-emerald-300">
          ✓ Imported {state.created}.{" "}
          {state.skipped > 0 && (
            <span className="text-amber-300">
              Skipped {state.skipped} bad row{state.skipped === 1 ? "" : "s"}.
            </span>
          )}
          {state.errors.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-[10px] text-amber-200">
              {state.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {state && !state.ok && (
        <p className="text-xs text-rose-300">{state.error}</p>
      )}
    </form>
  );
}
