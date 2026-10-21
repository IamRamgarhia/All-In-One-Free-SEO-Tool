"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Issue = {
  id: string;
  ruleId: string;
  category: string | null;
  severity: string | null;
  status: string | null;
  title: string | null;
  description: string | null;
  recommendation: string | null;
  affectedUrls: string[];
};

export function AuditIssuesPanel({
  siteId,
  issues,
}: {
  siteId: string;
  issues: Issue[];
}) {
  const router = useRouter();
  const [severity, setSeverity] = useState("all");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [urlQ, setUrlQ] = useState("");
  const [selected, setSelected] = useState<Issue | null>(null);
  const [pending, startTransition] = useTransition();

  const categories = useMemo(
    () =>
      Array.from(
        new Set(issues.map((i) => i.category).filter(Boolean) as string[]),
      ).sort(),
    [issues],
  );

  const filtered = issues.filter((i) => {
    if (severity !== "all" && i.severity !== severity) return false;
    if (category !== "all" && i.category !== category) return false;
    if (status !== "all" && i.status !== status) return false;
    if (urlQ && !i.affectedUrls.some((u) => u.includes(urlQ))) return false;
    return true;
  });

  function createAction(issue: Issue) {
    startTransition(async () => {
      await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, issueId: issue.id }),
      });
      router.push(`/cabinet/sites/${siteId}/actions`);
      router.refresh();
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <h2 className="mr-auto text-lg font-medium">
          Problèmes{" "}
          <span className="text-muted-foreground">({filtered.length})</span>
        </h2>
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-xs"
        >
          <option value="all">Sévérité</option>
          <option value="critical">critical</option>
          <option value="high">high</option>
          <option value="medium">medium</option>
          <option value="low">low</option>
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-xs"
        >
          <option value="all">Catégorie</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-xs"
        >
          <option value="all">Statut règle</option>
          <option value="fail">fail</option>
          <option value="warn">warn</option>
        </select>
        <input
          value={urlQ}
          onChange={(e) => setUrlQ(e.target.value)}
          placeholder="Filtrer URL…"
          className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-xs"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="overflow-hidden rounded-2xl border border-white/5 bg-card/40">
          <ul className="divide-y divide-white/5">
            {filtered.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => setSelected(i)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-white/[0.03]"
                >
                  <span
                    className={`mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                      i.severity === "critical"
                        ? "bg-rose-500/20 text-rose-300"
                        : i.severity === "high"
                          ? "bg-orange-500/20 text-orange-300"
                          : i.severity === "medium"
                            ? "bg-amber-500/20 text-amber-300"
                            : "bg-white/10 text-muted-foreground"
                    }`}
                  >
                    {i.severity}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {i.title ?? i.ruleId}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {i.category} · {i.status} · {i.affectedUrls.length} URL
                      {i.affectedUrls.length === 1 ? "" : "s"}
                    </div>
                  </div>
                </button>
              </li>
            ))}
            {filtered.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                Aucun problème pour ces filtres.
              </li>
            ) : null}
          </ul>
        </div>

        <aside className="rounded-2xl border border-white/5 bg-card/40 p-4 text-sm">
          {selected ? (
            <div className="space-y-3">
              <h3 className="font-semibold">{selected.title ?? selected.ruleId}</h3>
              <p className="text-xs text-muted-foreground">
                {selected.ruleId} · {selected.category} · {selected.status}
              </p>
              <p className="leading-relaxed text-muted-foreground">
                {selected.description}
              </p>
              {selected.recommendation ? (
                <p className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs text-cyan-100">
                  <strong>Recommandation :</strong> {selected.recommendation}
                </p>
              ) : null}
              <div>
                <div className="text-[11px] uppercase text-muted-foreground">
                  URLs
                </div>
                <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
                  {selected.affectedUrls.map((u) => (
                    <li key={u} className="truncate">
                      {u}
                    </li>
                  ))}
                </ul>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => createAction(selected)}
                className="w-full rounded-lg bg-cyan-500/20 px-3 py-2 text-xs font-medium text-cyan-100 ring-1 ring-cyan-500/40 hover:bg-cyan-500/30 disabled:opacity-50"
              >
                {pending ? "…" : "Créer une action"}
              </button>
            </div>
          ) : (
            <p className="text-muted-foreground">
              Sélectionnez un problème pour voir le détail.
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}
