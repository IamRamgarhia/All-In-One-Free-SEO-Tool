"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  FileDown,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createProposal, deleteProposal, updateProposal } from "./actions";

type ScopeLine = { label: string; detail: string; findings: number };
type PriceLine = { label: string; detail: string; amount: number };

/** Colour follows meaning: green is agreed, amber is waiting on them. */
const STATUS_TONE: Record<string, string> = {
  draft: "border-white/10 bg-white/5 text-muted-foreground",
  sent: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  accepted: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  declined: "border-rose-500/30 bg-rose-500/10 text-rose-300",
};

type ProposalRow = {
  id: number;
  prospectName: string;
  prospectUrl: string | null;
  title: string;
  intro: string | null;
  terms: string | null;
  currency: string;
  scope: ScopeLine[];
  pricing: PriceLine[];
  status: string;
  basedOnScore: number | null;
  createdAt: string;
};

export function ProposalsManager({
  clients,
  leads,
  proposals,
}: {
  clients: { id: number; name: string }[];
  leads: { id: number; url: string; name: string | null; email: string | null; score: number | null }[];
  proposals: ProposalRow[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [openId, setOpenId] = useState<number | null>(null);

  const create = (input: { clientId?: number; leadId?: number }) =>
    start(async () => {
      setError(null);
      setNotice(null);
      const r = await createProposal(input);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (r.unmapped.length > 0) {
        // Surfaced rather than swallowed: if the audit produced checks
        // the scope builder doesn't know about, this proposal understates
        // the work, and the person sending it should decide what to do.
        setNotice(
          `Built. ${r.unmapped.length} finding type${r.unmapped.length === 1 ? "" : "s"} had no matching scope line (${r.unmapped.slice(0, 3).join(", ")}${r.unmapped.length > 3 ? "…" : ""}) — add them by hand if they matter.`,
        );
      }
      setOpenId(r.id);
      router.refresh();
    });

  return (
    <div className="space-y-6">
      {error && (
        <p className="flex items-start gap-2 rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-300 ring-1 ring-inset ring-rose-500/25">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-200 ring-1 ring-inset ring-amber-500/25">
          {notice}
        </p>
      )}

      <section className="glass-apple rounded-xl p-5">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Plus className="size-4 text-violet-300" />
          New proposal
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Built from the latest audit. Every scope line traces to something the
          audit found — nothing is padded in, and no traffic or revenue is
          predicted, because a crawl can&apos;t support that.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="from-client">From a client</Label>
            <select
              id="from-client"
              disabled={pending || clients.length === 0}
              defaultValue=""
              onChange={(e) => {
                const id = Number(e.target.value);
                if (id) create({ clientId: id });
                e.target.value = "";
              }}
              className="mt-1 h-9 w-full rounded-md border border-white/10 bg-white/5 px-2 text-sm"
            >
              <option value="">
                {clients.length ? "Pick a client…" : "No clients yet"}
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="from-lead">From a lead</Label>
            <select
              id="from-lead"
              disabled={pending || leads.length === 0}
              defaultValue=""
              onChange={(e) => {
                const id = Number(e.target.value);
                if (id) create({ leadId: id });
                e.target.value = "";
              }}
              className="mt-1 h-9 w-full rounded-md border border-white/10 bg-white/5 px-2 text-sm"
            >
              <option value="">
                {leads.length ? "Pick a lead…" : "No leads with an email yet"}
              </option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name || l.url.replace(/^https?:\/\//, "")}
                  {l.score !== null ? ` (${l.score}/100)` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="glass-apple rounded-xl p-5">
        <h2 className="text-sm font-medium">
          {proposals.length} proposal{proposals.length === 1 ? "" : "s"}
        </h2>
        {proposals.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            None yet. Pick a client or a lead above — you&apos;ll get a draft
            with the scope filled in, ready for you to price.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-white/5">
            {proposals.map((p) => (
              <ProposalRowView
                key={p.id}
                proposal={p}
                open={openId === p.id}
                onToggle={() => setOpenId(openId === p.id ? null : p.id)}
                onError={setError}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ProposalRowView({
  proposal,
  open,
  onToggle,
  onError,
}: {
  proposal: ProposalRow;
  open: boolean;
  onToggle: () => void;
  onError: (m: string) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [gone, setGone] = useState(false);
  const [title, setTitle] = useState(proposal.title);
  const [intro, setIntro] = useState(proposal.intro ?? "");
  const [terms, setTerms] = useState(proposal.terms ?? "");
  const [currency, setCurrency] = useState(proposal.currency);
  const [pricing, setPricing] = useState<PriceLine[]>(
    proposal.pricing.length
      ? proposal.pricing
      : [{ label: "Monthly retainer", detail: "", amount: 0 }],
  );
  const [saved, setSaved] = useState(false);

  if (gone) return null;

  const total = pricing.reduce((n, p) => n + (Number(p.amount) || 0), 0);

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{proposal.title}</div>
          <div className="truncate text-xs text-muted-foreground">
            {proposal.prospectName}
            {proposal.basedOnScore !== null && ` · ${proposal.basedOnScore}/100`}
            {` · ${proposal.scope.length} scope line${proposal.scope.length === 1 ? "" : "s"}`}
            {` · ${new Date(proposal.createdAt).toLocaleDateString()}`}
          </div>
        </div>

        {/* Where a proposal stands.
            The column existed from the beginning, updateProposal accepted
            it, and nothing anywhere rendered a control — so the document
            whose entire purpose is to be approved could not be marked as
            sent, let alone accepted. The approval workflow was a database
            column and nothing else. */}
        <select
          value={proposal.status}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value as
              | "draft"
              | "sent"
              | "accepted"
              | "declined";
            start(async () => {
              await updateProposal(proposal.id, { status: next });
              router.refresh();
            });
          }}
          className={`h-8 rounded-lg border px-2 text-xs ${STATUS_TONE[proposal.status] ?? STATUS_TONE.draft}`}
          title="Where this document stands with the client"
        >
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="accepted">Accepted</option>
          <option value="declined">Declined</option>
        </select>

        <a
          href={`/proposals/${proposal.id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs hover:bg-white/10"
        >
          <FileDown className="size-3.5" />
          PDF
        </a>
        <Button size="sm" variant="ghost" onClick={onToggle}>
          {open ? "Close" : "Edit"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await deleteProposal(proposal.id);
              if (r.ok) setGone(true);
              else onError(r.error ?? "Couldn't delete that.");
            })
          }
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      {open && (
        <div className="mt-3 space-y-4 rounded-md bg-white/5 p-4">
          <div className="space-y-1.5">
            <Label htmlFor={`t-${proposal.id}`}>Title</Label>
            <Input
              id={`t-${proposal.id}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`i-${proposal.id}`}>Opening</Label>
            <textarea
              id={`i-${proposal.id}`}
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              rows={4}
              placeholder="The part you write — why you, what you understand about their business, what happens next."
              className="w-full rounded-md border border-white/10 bg-white/5 p-2 text-sm"
            />
          </div>

          <div>
            <p className="text-xs font-medium">Scope</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Derived from the audit. The counts are real findings, so a
              prospect can check them.
            </p>
            <ul className="mt-2 space-y-1 text-xs">
              {proposal.scope.map((s, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>{s.label}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {s.findings}
                  </span>
                </li>
              ))}
              {proposal.scope.length === 0 && (
                <li className="text-muted-foreground">
                  The audit found nothing this tool knows how to scope.
                </li>
              )}
            </ul>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">Pricing</p>
              <input
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
                aria-label="Currency code"
                className="h-7 w-16 rounded border border-white/10 bg-white/5 px-2 text-center text-xs"
              />
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Yours to set — this tool has no basis for pricing your work.
            </p>
            <div className="mt-2 space-y-2">
              {pricing.map((line, i) => (
                <div key={i} className="flex flex-wrap gap-2">
                  <Input
                    value={line.label}
                    placeholder="What they're buying"
                    onChange={(e) =>
                      setPricing((p) =>
                        p.map((x, j) =>
                          j === i ? { ...x, label: e.target.value } : x,
                        ),
                      )
                    }
                    className="min-w-40 flex-[2]"
                  />
                  <Input
                    type="number"
                    min={0}
                    value={line.amount}
                    onChange={(e) =>
                      setPricing((p) =>
                        p.map((x, j) =>
                          j === i
                            ? { ...x, amount: Number(e.target.value) || 0 }
                            : x,
                        ),
                      )
                    }
                    className="w-32"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setPricing((p) => p.filter((_, j) => j !== i))
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setPricing((p) => [...p, { label: "", detail: "", amount: 0 }])
                }
              >
                <Plus className="size-3.5" /> Add line
              </Button>
              <span className="text-sm font-medium tabular-nums">
                {currency} {total.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`terms-${proposal.id}`}>Terms</Label>
            <textarea
              id={`terms-${proposal.id}`}
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              rows={3}
              placeholder="Timeline, what's not included, payment terms, notice period."
              className="w-full rounded-md border border-white/10 bg-white/5 p-2 text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await updateProposal(proposal.id, {
                    title,
                    intro,
                    terms,
                    currency,
                    pricing: pricing.filter((p) => p.label.trim()),
                  });
                  if (!r.ok) onError(r.error ?? "Couldn't save that.");
                  else {
                    setSaved(true);
                    setTimeout(() => setSaved(false), 2000);
                    router.refresh();
                  }
                })
              }
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {saved ? "Saved" : "Save"}
            </Button>
            <span className="text-xs text-muted-foreground">
              Then open the PDF to check it before sending.
            </span>
          </div>
        </div>
      )}
    </li>
  );
}
