"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  ExternalLink,
  HelpCircle,
} from "lucide-react";
import {
  GROUP_BLURBS,
  GROUP_LABELS,
  TIER_LABELS,
  type Integration,
  type IntegrationStatus,
} from "@/lib/integrations";

const GROUP_ORDER: Integration["group"][] = [
  "start",
  "data",
  "publishing",
  "delivery",
];

export function ConnectList({
  integrations,
  status,
}: {
  integrations: Integration[];
  status: Record<string, IntegrationStatus>;
}) {
  const connected = integrations.filter(
    (i) => status[i.id] === "connected",
  ).length;

  return (
    <div className="space-y-6">
      <section className="glass-apple rounded-xl p-4">
        <p className="text-sm">
          <span className="font-medium">
            {connected} of {integrations.length} connected.
          </span>{" "}
          <span className="text-muted-foreground">
            Nothing here is required — the tool works without any of it. Each
            one makes a specific thing better, and the page says which.
          </span>
        </p>
      </section>

      {GROUP_ORDER.map((group) => {
        const items = integrations.filter((i) => i.group === group);
        if (items.length === 0) return null;
        return (
          <section key={group} className="space-y-3">
            <div>
              <h2 className="text-sm font-medium">{GROUP_LABELS[group]}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {GROUP_BLURBS[group]}
              </p>
            </div>
            <div className="space-y-2">
              {items.map((i) => (
                <Card
                  key={i.id}
                  integration={i}
                  status={status[i.id] ?? "unknown"}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Card({
  integration: i,
  status,
}: {
  integration: Integration;
  status: IntegrationStatus;
}) {
  // Collapsed by default once connected — a done thing shouldn't take up
  // as much room as a thing you still need to do.
  const [open, setOpen] = useState(status !== "connected");

  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${
        status === "connected"
          ? "border-emerald-500/20 bg-emerald-500/[0.04]"
          : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{i.label}</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                i.tier === "free"
                  ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/25"
                  : i.tier === "free-tier"
                    ? "bg-cyan-500/10 text-cyan-300 ring-cyan-500/25"
                    : "bg-amber-500/10 text-amber-300 ring-amber-500/25"
              }`}
            >
              {TIER_LABELS[i.tier]}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="size-3" />~{i.minutes} min
            </span>
            {status === "connected" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                <Check className="size-3" />
                Connected
              </span>
            )}
            {status === "unknown" && (
              <span
                title="We couldn't check this one. It may still be working."
                className="inline-flex items-center gap-1 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                <HelpCircle className="size-3" />
                Couldn&apos;t check
              </span>
            )}
          </div>
          {!open && (
            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
              {i.whatYouGet[0]}
            </p>
          )}
        </div>
        <ChevronDown
          className={`mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-xs font-medium">What you get</p>
            <ul className="mt-1.5 space-y-1">
              {i.whatYouGet.map((line, n) => (
                <li key={n} className="flex gap-2 text-xs text-muted-foreground">
                  <Check className="mt-0.5 size-3 shrink-0 text-emerald-400" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Stated plainly rather than implied. Someone deciding whether
              to spend five minutes deserves to know what they lose by
              not doing it — and in most cases the answer is "less than
              you'd think", which is worth saying. */}
          <div className="rounded-md bg-white/5 px-3 py-2">
            <p className="text-[11px] font-medium">If you skip it</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{i.withoutIt}</p>
          </div>

          <div>
            <p className="text-xs font-medium">How to set it up</p>
            <ol className="mt-1.5 space-y-1.5">
              {i.steps.map((step, n) => (
                <li key={n} className="flex gap-2 text-xs text-muted-foreground">
                  <span className="grid size-4 shrink-0 place-items-center rounded-full bg-white/10 text-[10px] font-medium text-foreground">
                    {n + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {i.keyUrl && (
              <a
                href={i.keyUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
              >
                <ExternalLink className="size-3.5" />
                {i.keyUrlLabel ?? "Get the key"}
              </a>
            )}
            <Link
              href={i.setupHref}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500/90 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500"
            >
              {i.setupLabel}
              <ArrowRight className="size-3.5" />
            </Link>
            {i.envVar && (
              <span className="text-[11px] text-muted-foreground">
                or set{" "}
                <code className="rounded bg-white/5 px-1 py-0.5 font-mono">
                  {i.envVar}
                </code>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
