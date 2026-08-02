"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Loader2, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  convertLeadToClient,
  deleteLead,
  setLeadStatus,
  type LeadStatus,
} from "./actions";

type Lead = {
  id: number;
  url: string;
  email: string | null;
  name: string | null;
  score: number | null;
  criticalCount: number;
  highCount: number;
  findings: { type: string; severity: string; message: string }[];
  status: string;
  notes: string | null;
  sourcePage: string | null;
  createdAt: string;
};

const STATUSES: LeadStatus[] = ["new", "contacted", "won", "lost", "spam"];

const statusTone: Record<string, string> = {
  new: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  contacted: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  won: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  lost: "bg-white/10 text-muted-foreground ring-white/15",
  spam: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
};

export function LeadsInbox({ leads }: { leads: Lead[] }) {
  const [error, setError] = useState<string | null>(null);
  // Anonymous grades are real signal — someone checked their site and
  // didn't leave an email — but they're not a sales pipeline, so they
  // don't get to bury the ones that are.
  const [showAnonymous, setShowAnonymous] = useState(false);

  const withEmail = leads.filter((l) => l.email);
  const anonymous = leads.filter((l) => !l.email);
  const shown = showAnonymous ? leads : withEmail;

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-300 ring-1 ring-inset ring-rose-500/25">
          {error}
        </p>
      )}

      <section className="glass-apple rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium">
            {withEmail.length} lead{withEmail.length === 1 ? "" : "s"}
            {anonymous.length > 0 && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                + {anonymous.length} anonymous check
                {anonymous.length === 1 ? "" : "s"}
              </span>
            )}
          </h2>
          {anonymous.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAnonymous((v) => !v)}
              className="text-xs underline underline-offset-2 hover:text-foreground"
            >
              {showAnonymous ? "Hide anonymous" : "Show anonymous"}
            </button>
          )}
        </div>

        {shown.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Nothing yet. Once the widget is on your site, everyone who grades
            their domain shows up here — with their score and what&apos;s wrong.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-white/5">
            {shown.map((l) => (
              <LeadRow key={l.id} lead={l} onError={setError} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function LeadRow({
  lead,
  onError,
}: {
  lead: Lead;
  onError: (m: string) => void;
}) {
  const [pending, start] = useTransition();
  const [status, setStatus] = useState(lead.status);
  const [gone, setGone] = useState(false);
  const [open, setOpen] = useState(false);
  if (gone) return null;

  const domain = lead.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const serious = lead.criticalCount + lead.highCount;

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-3">
        {lead.score !== null && (
          <span
            className={`grid size-10 shrink-0 place-items-center rounded-lg text-sm font-bold ring-1 ring-inset ${
              lead.score >= 80
                ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/25"
                : lead.score >= 50
                  ? "bg-amber-500/10 text-amber-300 ring-amber-500/25"
                  : "bg-rose-500/10 text-rose-300 ring-rose-500/25"
            }`}
          >
            {lead.score}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="truncate font-medium">
              {lead.name || lead.email || domain}
            </span>
            <span
              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${statusTone[status] ?? ""}`}
            >
              {status}
            </span>
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {lead.email ? `${lead.email} · ` : ""}
            <a
              href={lead.url}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              {domain}
            </a>
            {serious > 0 && ` · ${serious} serious issue${serious === 1 ? "" : "s"}`}
            {" · "}
            {new Date(lead.createdAt).toLocaleDateString()}
          </div>
        </div>

        <select
          value={status}
          disabled={pending}
          onChange={(e) =>
            start(async () => {
              const next = e.target.value as LeadStatus;
              setStatus(next);
              const r = await setLeadStatus(lead.id, next);
              if (!r.ok) onError(r.error ?? "Couldn't update that.");
            })
          }
          className="h-8 rounded-md border border-white/10 bg-white/5 px-2 text-xs"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {lead.findings.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
            {open ? "Hide" : "What's wrong"}
          </Button>
        )}

        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await convertLeadToClient(lead.id);
              if (!r.ok) onError(r.error ?? "Couldn't convert that.");
              else if (r.clientId) window.location.href = `/clients/${r.clientId}`;
            })
          }
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <UserPlus className="size-3.5" />
          )}
          Add as client
        </Button>

        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await deleteLead(lead.id);
              if (r.ok) setGone(true);
              else onError(r.error ?? "Couldn't delete that.");
            })
          }
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      {open && (
        <div className="mt-2 rounded-md bg-white/5 p-3">
          <p className="text-xs text-muted-foreground">
            What the widget found on their homepage — useful as the opening line
            of a reply.
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            {lead.findings.map((f, i) => (
              <li key={`${f.type}-${i}`} className="flex gap-2">
                <span
                  className={
                    f.severity === "critical" || f.severity === "high"
                      ? "text-rose-300"
                      : "text-amber-300"
                  }
                >
                  ●
                </span>
                <span className="text-muted-foreground">{f.message}</span>
              </li>
            ))}
          </ul>
          {lead.sourcePage && (
            <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
              <ExternalLink className="size-3" />
              Came from {lead.sourcePage}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
