"use client";

import { useIntegrationText } from "@/lib/integrations-text";
import { useTranslations } from "next-intl";
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
  type Integration,
  type IntegrationStatus,
} from "@/lib/integrations";
import { ConnectionTools } from "@/components/connection-tools";

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
  const tx = useTranslations("ui.app_connect_list");
  const it = useIntegrationText();
  const connected = integrations.filter(
    (i) => status[i.id] === "connected",
  ).length;

  return (
    <div className="space-y-6">
      <section className="glass-apple rounded-xl p-4">
        <p className="text-sm">
          <span className="font-medium">
            {tx("ofConnected", { connected, length: integrations.length })}
          </span>{" "}
          <span className="text-muted-foreground">
            {tx("nothingHereIsRequiredThe")}
          </span>
        </p>
      </section>

      {GROUP_ORDER.map((group) => {
        const items = integrations.filter((i) => i.group === group);
        if (items.length === 0) return null;
        return (
          <section key={group} className="space-y-3">
            <div>
              <h2 className="text-sm font-medium">{it.groupLabel(group)}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {it.groupBlurb(group)}
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
  integration: raw,
  status,
}: {
  integration: Integration;
  status: IntegrationStatus;
}) {
  const tx = useTranslations("ui.app_connect_list");
  const it = useIntegrationText();
  const i = it.item(raw);
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
              {it.tier(i.tier)}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="size-3" />{tx("min", { minutes: i.minutes })}
            </span>
            {status === "connected" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                <Check className="size-3" />
                {tx("connected")}
              </span>
            )}
            {status === "unknown" && (
              <span
                title={tx("weCouldnTCheckThis")}
                className="inline-flex items-center gap-1 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                <HelpCircle className="size-3" />
                {tx("couldnTCheck")}
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
            <p className="text-xs font-medium">{tx("whatYouGet")}</p>
            <ul className="mt-1.5 space-y-1">
              {i.whatYouGet.map((line, n) => (
                <li key={n} className="flex gap-2 text-xs text-muted-foreground">
                  <Check className="mt-0.5 size-3 shrink-0 text-emerald-400" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right under "what you get": the next question is "which
              tools, exactly". Named and linked for the two connections
              that tools depend on. */}
          {raw.id === "ai" ? <ConnectionTools kind="ai" /> : null}
          {raw.id === "google" ? <ConnectionTools kind="gsc" /> : null}

          {/* Stated plainly rather than implied. Someone deciding whether
              to spend five minutes deserves to know what they lose by
              not doing it — and in most cases the answer is "less than
              you'd think", which is worth saying. */}
          <div className="rounded-md bg-white/5 px-3 py-2">
            <p className="text-[11px] font-medium">{tx("ifYouSkipIt")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{i.withoutIt}</p>
          </div>

          <div>
            <p className="text-xs font-medium">{tx("howToSetItUp")}</p>
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
                {i.keyUrlLabel ?? tx("getTheKey")}
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
                {tx.rich("orSet", { envVar: i.envVar, b0: (chunks) => <code className="rounded bg-white/5 px-1 py-0.5 font-mono">{chunks}</code> })}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
