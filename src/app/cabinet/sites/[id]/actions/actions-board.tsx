"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type ActionRow = {
  id: string;
  title: string;
  priority: string;
  effort: string | null;
  status: string;
  owner: string | null;
  dueDate: string | null;
  notes: string | null;
  issueId: string | null;
  issueTitle: string | null;
};

const STATUSES = ["todo", "in_progress", "done", "verified"] as const;

export function ActionsBoard({
  siteId,
  actions,
}: {
  siteId: string;
  actions: ActionRow[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<string>("all");
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(
    () =>
      filter === "all" ? actions : actions.filter((a) => a.status === filter),
    [actions, filter],
  );

  function patch(id: string, body: Record<string, string>) {
    startTransition(async () => {
      await fetch(`/api/actions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`rounded-lg px-3 py-1.5 text-xs ring-1 ${
            filter === "all"
              ? "bg-cyan-500/20 text-cyan-100 ring-cyan-500/40"
              : "bg-white/5 text-muted-foreground ring-white/10"
          }`}
        >
          Tous ({actions.length})
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-xs ring-1 ${
              filter === s
                ? "bg-cyan-500/20 text-cyan-100 ring-cyan-500/40"
                : "bg-white/5 text-muted-foreground ring-white/10"
            }`}
          >
            {s} ({actions.filter((a) => a.status === s).length})
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/5 bg-card/40">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 text-left">Action</th>
              <th className="px-4 py-3 text-left">Priorité</th>
              <th className="px-4 py-3 text-left">Effort</th>
              <th className="px-4 py-3 text-left">Statut</th>
              <th className="px-4 py-3 text-left">Owner</th>
              <th className="px-4 py-3 text-left">Origine</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.map((a) => (
              <tr key={a.id} className="hover:bg-white/[0.03]">
                <td className="px-4 py-3">
                  <div className="font-medium">{a.title}</div>
                  {a.notes ? (
                    <div className="text-xs text-muted-foreground">{a.notes}</div>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded bg-white/5 px-1.5 py-0.5 text-xs">
                    {a.priority}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {a.effort ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <select
                    disabled={pending}
                    value={a.status}
                    onChange={(e) => patch(a.id, { status: e.target.value })}
                    className="rounded border border-white/10 bg-black/20 px-2 py-1 text-xs"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {a.owner ?? "—"}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {a.issueTitle ?? "—"}
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  Aucune action. Créez-en depuis un problème d&apos;audit.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">Site {siteId}</p>
    </div>
  );
}
