"use client";

import { useActionState, useState, useTransition } from "react";
import { History, Loader2, Plus } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { runSnapshot, loadSnapshots, type SnapshotState } from "./actions";
import { diffSnapshots, type DiffLine } from "@/lib/diff-text";
import type { RobotsSnapshot } from "@/db/schema";

export function RobotsTracker({
  initialHosts,
}: {
  initialHosts: { hostname: string; lastFetched: Date; snapshots: number }[];
}) {
  const t = useTranslations("tools.ui.robots-history");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState<
    SnapshotState | null,
    FormData
  >(runSnapshot, null);
  const [openHost, setOpenHost] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<RobotsSnapshot[]>([]);
  const [, startLoad] = useTransition();
  const [pickedA, setPickedA] = useState<number | null>(null);
  const [pickedB, setPickedB] = useState<number | null>(null);

  function open(host: string) {
    setOpenHost(host);
    setPickedA(null);
    setPickedB(null);
    startLoad(async () => {
      const rows = await loadSnapshots(host);
      setSnapshots(rows);
    });
  }

  const a = snapshots.find((s) => s.id === pickedA);
  const b = snapshots.find((s) => s.id === pickedB);
  const diff: DiffLine[] = a && b ? diffSnapshots(a.content, b.content) : [];
  const added = diff.filter((d) => d.kind === "added").length;
  const removed = diff.filter((d) => d.kind === "removed").length;

  return (
    <>
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3"
      >
        <div className="grid gap-3 md:grid-cols-[1fr_140px]">
          <input
            name="host"
            required
            placeholder="example.com"
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-9 items-center justify-center rounded-md bg-amber-500/15 px-4 text-xs font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30 hover:bg-amber-500/25 disabled:opacity-50"
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 size-3 animate-spin" />
                {t("fetching")}
              </>
            ) : (
              <>
                <Plus className="mr-2 size-3" />
                {t("snapshot")}
              </>
            )}
          </button>
        </div>

        {state && !state.ok && (
          <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
            {state.error}
          </p>
        )}
        {state?.ok && (
          <p className={`rounded-md px-3 py-2 text-xs ring-1 ring-inset ${state.changed ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30" : "bg-white/5 text-muted-foreground ring-white/10"}`}>
            {state.changed
              ? t("changed")
              : t("unchanged")}
          </p>
        )}
      </form>

      {initialHosts.length > 0 && (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <header className="border-b border-white/[0.06] px-5 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <History className="size-4 text-amber-300" />
              {t("trackedHosts", { count: initialHosts.length })}
            </h3>
          </header>
          <ul className="divide-y divide-white/[0.05]">
            {initialHosts.map((h) => (
              <li
                key={h.hostname}
                className="flex items-center justify-between gap-3 px-5 py-2 text-xs"
              >
                <button
                  type="button"
                  onClick={() => open(h.hostname)}
                  className={`text-left font-medium ${openHost === h.hostname ? "text-amber-300" : "hover:text-amber-300"}`}
                >
                  {h.hostname}
                </button>
                <span className="text-muted-foreground tabular-nums">
                  {t("hostMeta", {
                    count: h.snapshots,
                    date: h.lastFetched.toLocaleDateString(locale),
                  })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {openHost && snapshots.length > 0 && (
        <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-semibold">{t("snapshotsFor", { host: openHost })}</h3>
          <p className="text-xs text-muted-foreground">
            {t("pickTwo")}
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            <SnapshotPicker
              label="A"
              snapshots={snapshots}
              picked={pickedA}
              onPick={setPickedA}
            />
            <SnapshotPicker
              label="B"
              snapshots={snapshots}
              picked={pickedB}
              onPick={setPickedB}
            />
          </div>

          {a && b && (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">
                {t("diffStats", { added, removed })}
              </div>
              <pre className="max-h-[400px] overflow-auto rounded-md bg-black/40 p-3 font-mono text-[11px] leading-relaxed">
                {diff.map((d, i) => (
                  <div
                    key={i}
                    className={
                      d.kind === "added"
                        ? "bg-emerald-500/10 text-emerald-300"
                        : d.kind === "removed"
                          ? "bg-rose-500/10 text-rose-300 line-through"
                          : "text-muted-foreground/60"
                    }
                  >
                    {d.kind === "added" ? "+ " : d.kind === "removed" ? "- " : "  "}
                    {d.text || t("blank")}
                  </div>
                ))}
              </pre>
            </div>
          )}
        </section>
      )}
    </>
  );
}

function SnapshotPicker({
  label,
  snapshots,
  picked,
  onPick,
}: {
  label: string;
  snapshots: RobotsSnapshot[];
  picked: number | null;
  onPick: (id: number) => void;
}) {
  const t = useTranslations("tools.ui.robots-history");
  const locale = useLocale();
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {t("snapshotLabel", { label })}
      </div>
      <select
        value={picked ?? ""}
        onChange={(e) => onPick(Number(e.target.value))}
        className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-xs focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
      >
        <option value="">{t("pick")}</option>
        {snapshots.map((s) => (
          <option key={s.id} value={s.id}>
            #{s.id} · {s.fetchedAt.toLocaleString(locale)} · {s.status} · {s.content.length}b
          </option>
        ))}
      </select>
    </div>
  );
}
