"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteClient } from "../actions";

type CountsToDelete = {
  audits: number;
  auditIssues: number;
  tasks: number;
  keywords: number;
  rankings: number;
  backlinks: number;
  reports: number;
  snapshots: number;
};

export function DeleteClientButton({
  clientId,
  clientName,
  counts,
}: {
  clientId: number;
  clientName: string;
  counts: CountsToDelete;
}) {
  const [open, setOpen] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const canDelete = typedName.trim().toLowerCase() === clientName.toLowerCase();

  const totalRows =
    counts.audits +
    counts.auditIssues +
    counts.tasks +
    counts.keywords +
    counts.rankings +
    counts.backlinks +
    counts.reports +
    counts.snapshots;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canDelete || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteClient(clientId);
        // Server action redirects on success — this line typically unreached
      } catch (err) {
        setError((err as Error).message || "Delete failed");
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        onClick={() => {
          setOpen(true);
          setTypedName("");
          setError(null);
        }}
      >
        <Trash2 className="mr-1.5 size-3.5" />
        Delete client…
      </Button>
      <p className="mt-2 text-xs text-muted-foreground">
        Removes the client + everything attached to it. You'll get a clear
        confirmation before anything is touched.
      </p>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-rose-500/30 bg-card shadow-2xl shadow-rose-500/10"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center gap-2 border-b border-rose-500/20 bg-rose-500/[0.06] px-5 py-3">
              <AlertTriangle className="size-4 text-rose-300" />
              <h3 className="flex-1 text-sm font-semibold text-rose-200">
                Delete &quot;{clientName}&quot; — this cannot be undone
              </h3>
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                disabled={pending}
                aria-label="Close"
                className="rounded-md p-1 text-muted-foreground hover:bg-white/5 disabled:opacity-50"
              >
                <X className="size-3.5" />
              </button>
            </header>

            <div className="space-y-3 p-5 text-sm">
              <p className="text-muted-foreground">
                This will permanently delete the following from your local
                database (<span className="font-mono text-xs">data.db</span>):
              </p>

              <ul className="space-y-1 rounded-md bg-rose-500/[0.04] p-3 text-xs ring-1 ring-inset ring-rose-500/20">
                {counts.audits > 0 && (
                  <li>
                    <strong>{counts.audits.toLocaleString()}</strong> audit
                    {counts.audits === 1 ? "" : "s"}
                  </li>
                )}
                {counts.auditIssues > 0 && (
                  <li>
                    <strong>{counts.auditIssues.toLocaleString()}</strong> audit
                    issue{counts.auditIssues === 1 ? "" : "s"}
                  </li>
                )}
                {counts.tasks > 0 && (
                  <li>
                    <strong>{counts.tasks.toLocaleString()}</strong> task
                    {counts.tasks === 1 ? "" : "s"}
                  </li>
                )}
                {counts.keywords > 0 && (
                  <li>
                    <strong>{counts.keywords.toLocaleString()}</strong> tracked
                    keyword{counts.keywords === 1 ? "" : "s"}
                  </li>
                )}
                {counts.rankings > 0 && (
                  <li>
                    <strong>{counts.rankings.toLocaleString()}</strong>{" "}
                    historical rank record
                    {counts.rankings === 1 ? "" : "s"}
                  </li>
                )}
                {counts.backlinks > 0 && (
                  <li>
                    <strong>{counts.backlinks.toLocaleString()}</strong>{" "}
                    backlink{counts.backlinks === 1 ? "" : "s"}
                  </li>
                )}
                {counts.reports > 0 && (
                  <li>
                    <strong>{counts.reports.toLocaleString()}</strong> saved
                    report{counts.reports === 1 ? "" : "s"}
                  </li>
                )}
                {counts.snapshots > 0 && (
                  <li>
                    <strong>{counts.snapshots.toLocaleString()}</strong> metric
                    snapshot{counts.snapshots === 1 ? "" : "s"}
                  </li>
                )}
                {totalRows === 0 && (
                  <li className="text-muted-foreground">
                    No related records — just the client row itself.
                  </li>
                )}
                <li className="mt-2 border-t border-rose-500/15 pt-2 text-rose-200">
                  Plus: the client&apos;s brand info, integrations
                  (GSC/GA4/GBP/WP bridge tokens), share-link, and onboarding
                  state.
                </li>
              </ul>

              <p className="text-[11px] text-amber-300">
                <strong>Cannot be undone.</strong> Restore is only possible
                from a backup of your data.db file.
              </p>

              <form onSubmit={onSubmit} className="space-y-2">
                <label className="block space-y-1 text-xs">
                  <span className="text-muted-foreground">
                    Type{" "}
                    <span className="rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-rose-300">
                      {clientName}
                    </span>{" "}
                    to confirm:
                  </span>
                  <input
                    type="text"
                    value={typedName}
                    onChange={(e) => setTypedName(e.target.value)}
                    placeholder={clientName}
                    autoFocus
                    disabled={pending}
                    className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-rose-500/40 focus:outline-none focus:ring-2 focus:ring-rose-500/20 disabled:opacity-50"
                  />
                </label>

                {error && (
                  <p className="rounded-md bg-rose-500/10 px-2 py-1 text-[11px] text-rose-300 ring-1 ring-inset ring-rose-500/30">
                    {error}
                  </p>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    disabled={pending}
                    className="rounded-md bg-white/5 px-3 py-1.5 text-xs ring-1 ring-inset ring-white/10 hover:bg-white/10 disabled:opacity-50"
                  >
                    Keep this client
                  </button>
                  <button
                    type="submit"
                    disabled={!canDelete || pending}
                    className="inline-flex items-center gap-1 rounded-md bg-rose-500/20 px-3 py-1.5 text-xs font-medium text-rose-200 ring-1 ring-inset ring-rose-500/40 hover:bg-rose-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 className="size-3" />
                    {pending ? "Deleting…" : "Delete forever"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
