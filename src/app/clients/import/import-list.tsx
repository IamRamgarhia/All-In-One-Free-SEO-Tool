"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  importSelectedProperties,
  type ImportablePair,
} from "./actions";

export function ImportList({ pairs }: { pairs: ImportablePair[] }) {
  const router = useRouter();
  const importable = pairs.filter((p) => !p.alreadyImported);
  const allKeys = importable.map((p) => p.key);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(allKeys), // pre-select everything by default — "easiest path"
  );
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(allKeys));
  }
  function selectNone() {
    setSelected(new Set());
  }

  function runImport() {
    if (selected.size === 0) return;
    startTransition(async () => {
      const r = await importSelectedProperties({
        keys: Array.from(selected),
      });
      setResult(r);
      if (r.imported > 0) {
        // Hard refresh so the freshly-imported clients show up everywhere
        router.refresh();
      }
    });
  }

  if (pairs.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-6 text-center text-sm text-muted-foreground">
        Your connected Google account doesn&apos;t see any GSC or GA4
        properties. Make sure you signed in with the right account, or that
        each client has invited you as a viewer in Search Console / Analytics.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {result && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            result.errors.length === 0
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-amber-500/30 bg-amber-500/10 text-amber-200"
          }`}
        >
          <div className="font-medium">
            Imported {result.imported}
            {result.skipped > 0 && ` · skipped ${result.skipped}`}
            {result.errors.length > 0 && ` · ${result.errors.length} errors`}
          </div>
          {result.errors.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs">
              {result.errors.map((e, i) => (
                <li key={i}>· {e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {selected.size}
          </span>{" "}
          of {importable.length} selected
          {pairs.length > importable.length && (
            <span className="ml-2 text-xs">
              · {pairs.length - importable.length} already imported
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={selectAll}
            disabled={selected.size === importable.length}
          >
            Select all
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={selectNone}
            disabled={selected.size === 0}
          >
            Clear
          </Button>
        </div>
      </div>

      <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.06]">
        {pairs.map((p) => {
          const isSelected = selected.has(p.key);
          const disabled = p.alreadyImported || pending;
          return (
            <li
              key={p.key}
              className={`flex items-center gap-4 px-4 py-3 transition-colors ${
                disabled
                  ? "bg-white/[0.01] opacity-60"
                  : isSelected
                    ? "bg-violet-500/5"
                    : "hover:bg-white/[0.03]"
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected || p.alreadyImported}
                disabled={disabled}
                onChange={() => toggle(p.key)}
                className="size-4 cursor-pointer accent-violet-500"
              />
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{p.name}</span>
                  {p.alreadyImported && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                      <CheckCircle2 className="size-3" />
                      Already imported
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">{p.domain}</span>
                  {p.gscProperty && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-300 ring-1 ring-inset ring-violet-500/20">
                      GSC
                    </span>
                  )}
                  {p.ga4PropertyId && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-300 ring-1 ring-inset ring-cyan-500/20">
                      GA4 · {p.ga4PropertyId}
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button
          onClick={runImport}
          disabled={pending || selected.size === 0}
        >
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Importing {selected.size}…
            </>
          ) : (
            <>
              <Sparkles className="size-4" />
              Import {selected.size} {selected.size === 1 ? "site" : "sites"}
            </>
          )}
        </Button>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 text-emerald-300" />
          For each: auto-fetches logo, name, address, social links, tech
          stack, and queues an audit.
        </span>
      </div>
    </div>
  );
}
