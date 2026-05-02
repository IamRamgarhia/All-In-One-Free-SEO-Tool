import Link from "next/link";
import { ArrowUpRight, Globe } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { QuickAddClientButton } from "./quick-add-client-dialog";

export type ClientToolCard = {
  id: number;
  name: string;
  url: string;
  logoUrl: string | null;
  niche: string | null;
  /** One-line primary stat — e.g. "Score 78" or "47 keywords tracked" */
  primary: string;
  /** Tone for the primary stat pill */
  primaryTone?: "violet" | "cyan" | "amber" | "emerald" | "rose" | "neutral";
  /** Secondary line — small, muted */
  secondary?: string;
  /** Optional badge (e.g. "GSC linked") */
  badges?: { label: string; tone: "emerald" | "amber" | "violet" | "neutral" }[];
};

const toneCls: Record<NonNullable<ClientToolCard["primaryTone"]>, string> = {
  violet: "text-gradient-violet",
  cyan: "text-gradient-cyan",
  amber: "text-gradient-amber",
  emerald: "text-gradient-emerald",
  rose: "text-gradient-rose",
  neutral: "text-foreground",
};

const badgeCls: Record<
  NonNullable<ClientToolCard["badges"]>[number]["tone"],
  string
> = {
  emerald:
    "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  amber: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  violet: "bg-violet-500/10 text-violet-300 ring-violet-500/30",
  neutral: "bg-white/5 text-muted-foreground ring-white/10",
};

/**
 * Reusable client-picker grid. Each card links to {basePath}/{clientId}
 * with a tool-specific primary stat and optional badges.
 */
export function ClientToolGrid({
  cards,
  basePath,
  emptyTitle = "No clients yet",
  emptyHint = "Add a client first — every tool here is scoped to one client.",
}: {
  cards: ClientToolCard[];
  basePath: string;
  emptyTitle?: string;
  emptyHint?: string;
}) {
  if (cards.length === 0) {
    return (
      <div className="glass-apple relative overflow-hidden rounded-2xl px-6 py-14 text-center">
        <div className="pointer-events-none absolute left-1/2 top-1/2 size-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative mx-auto flex max-w-md flex-col items-center gap-3">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-violet-500/15 ring-1 ring-violet-400/30">
            <Globe className="size-6 text-violet-300" />
          </div>
          <h2 className="text-xl font-semibold">{emptyTitle}</h2>
          <p className="text-sm text-muted-foreground">{emptyHint}</p>
          <QuickAddClientButton className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg shadow-violet-500/30 ring-1 ring-inset ring-white/15 transition-colors hover:bg-primary/90">
            ✨ Add your first client
          </QuickAddClientButton>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => (
        <Link
          key={c.id}
          href={`${basePath}/${c.id}`}
          className="glass-apple lift-on-hover group relative block overflow-hidden rounded-2xl p-5"
        >
          <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-violet-500/15 blur-2xl opacity-0 transition-opacity group-hover:opacity-100" />
          <div className="relative space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{c.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {c.url.replace(/^https?:\/\//, "")}
                </div>
              </div>
              {c.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.logoUrl}
                  alt=""
                  className="size-10 shrink-0 rounded-lg border border-white/10 object-contain"
                />
              ) : (
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-sm font-bold text-violet-300 ring-1 ring-violet-400/30">
                  {c.name.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>

            <div
              className={`text-2xl font-semibold tracking-tight tabular-nums ${
                toneCls[c.primaryTone ?? "violet"]
              }`}
            >
              {c.primary}
            </div>
            {c.secondary && (
              <div className="text-xs text-muted-foreground">{c.secondary}</div>
            )}

            {(c.niche || (c.badges && c.badges.length > 0)) && (
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {c.niche && (
                  <span className="rounded-full bg-white/5 px-2 py-0.5 ring-1 ring-inset ring-white/10">
                    {c.niche}
                  </span>
                )}
                {c.badges?.map((b, i) => (
                  <span
                    key={i}
                    className={`rounded-full px-2 py-0.5 ring-1 ring-inset ${badgeCls[b.tone]}`}
                  >
                    {b.label}
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center text-sm font-medium text-violet-300">
              Open
              <ArrowUpRight className="ml-auto size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

/**
 * Tiny header for per-client tool pages. Shows the current client + a
 * dropdown to jump to another without going back to the list.
 */
export function ClientToolHeader({
  current,
  allClients,
  basePath,
  toolLabel,
  icon: Icon,
}: {
  current: { id: number; name: string; url: string; logoUrl: string | null };
  allClients: { id: number; name: string }[];
  basePath: string;
  toolLabel: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href={basePath}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← All clients
        </Link>
        <span className="hidden text-muted-foreground/40 sm:inline">·</span>
        {Icon && <Icon className="size-4 shrink-0 text-violet-300" />}
        <span className="hidden text-xs font-medium uppercase tracking-wider text-muted-foreground sm:inline">
          {toolLabel}
        </span>
        {current.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current.logoUrl}
            alt=""
            className="size-6 shrink-0 rounded border border-white/10 object-contain"
          />
        ) : null}
        <span className="truncate font-medium">{current.name}</span>
      </div>

      <ClientJumpDropdown
        currentId={current.id}
        clients={allClients}
        basePath={basePath}
      />
    </div>
  );
}

function ClientJumpDropdown({
  currentId,
  clients,
  basePath,
}: {
  currentId: number;
  clients: { id: number; name: string }[];
  basePath: string;
}) {
  if (clients.length <= 1) return null;
  return (
    <details className="group relative">
      <summary className="cursor-pointer list-none rounded-md bg-white/5 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground [&::-webkit-details-marker]:hidden">
        Jump to client ▾
      </summary>
      <div className="absolute right-0 top-full z-20 mt-1 max-h-80 w-56 overflow-y-auto rounded-lg border border-white/10 bg-card/95 shadow-xl backdrop-blur-md">
        {clients.map((c) => (
          <Link
            key={c.id}
            href={`${basePath}/${c.id}`}
            className={`block px-3 py-2 text-sm transition-colors hover:bg-white/5 ${
              c.id === currentId ? "bg-violet-500/10 text-violet-300" : ""
            }`}
          >
            {c.name}
          </Link>
        ))}
      </div>
    </details>
  );
}
