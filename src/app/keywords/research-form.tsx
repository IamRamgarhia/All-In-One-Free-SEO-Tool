"use client";

import { useActionState } from "react";
import { Search, Sparkles, Globe, Video, MessagesSquare, BookOpen } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Term } from "@/components/ui/term";
import { researchAction, trackKeyword, type ResearchActionResult } from "./actions";

const sources = [
  { value: "google", label: "Google", icon: Globe, hint: "Autocomplete" },
  { value: "youtube", label: "YouTube", icon: Video, hint: "Video queries" },
  {
    value: "reddit",
    label: "Reddit",
    icon: MessagesSquare,
    hint: "Real questions",
  },
  {
    value: "wikipedia",
    label: "Wikipedia",
    icon: BookOpen,
    hint: "Entities & topics",
  },
] as const;

const intentTone: Record<string, string> = {
  informational: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  commercial: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  transactional: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  navigational: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
};

const countries = [
  { code: "US", label: "United States" },
  { code: "UK", label: "United Kingdom" },
  { code: "IN", label: "India" },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" },
  { code: "DE", label: "Germany" },
  { code: "FR", label: "France" },
  { code: "ES", label: "Spain" },
];

export function ResearchForm({
  clients,
}: {
  clients: { id: number; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<
    ResearchActionResult | null,
    FormData
  >(researchAction, null);

  const [source, setSource] = useState<
    "google" | "youtube" | "reddit" | "wikipedia"
  >("google");

  return (
    <div className="space-y-6">
      <form
        action={formAction}
        className="rounded-2xl border border-white/5 bg-card/40 p-5 backdrop-blur-md"
      >
        <input type="hidden" name="source" value={source} />
        <div className="mb-4 flex flex-wrap items-center gap-1 rounded-lg border border-white/10 bg-card/60 p-1">
          {sources.map((s) => {
            const Icon = s.icon;
            const active = source === s.value;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => setSource(s.value)}
                className={
                  active
                    ? "inline-flex items-center gap-1.5 rounded-md bg-violet-500/15 px-2.5 py-1 text-xs font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30"
                    : "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground"
                }
                title={s.hint}
              >
                <Icon className="size-3" />
                {s.label}
              </button>
            );
          })}
        </div>
        <div className="grid gap-4 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="seed">Seed keyword</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="seed"
                name="seed"
                placeholder="best running shoes"
                className="pl-9"
                required
                minLength={2}
                maxLength={100}
                defaultValue={state?.ok ? state.seed : ""}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="country">Country</Label>
            <select
              id="country"
              name="country"
              defaultValue={state?.ok ? state.country : "US"}
              className="flex h-9 w-32 rounded-md border border-white/10 bg-card/60 px-3 py-1 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mode">Expansion</Label>
            <select
              id="mode"
              name="mode"
              defaultValue="none"
              className="flex h-9 w-32 rounded-md border border-white/10 bg-card/60 px-2 text-xs shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
              <option value="none">Just seed</option>
              <option value="alphabet">Alphabet (a-z)</option>
              <option value="lsi">LSI (~250 ideas)</option>
            </select>
          </div>
          <Button
            type="submit"
            disabled={pending}
            className="shadow-lg shadow-violet-500/25 ring-1 ring-inset ring-white/15"
          >
            {pending ? "Researching…" : "Research"}
          </Button>
        </div>
      </form>

      {state && !state.ok && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-300">
          {state.error}
        </div>
      )}

      {state?.ok && state.suggestions.length === 0 && (
        <div className="rounded-2xl border border-white/5 bg-card/40 px-6 py-12 text-center text-sm text-muted-foreground backdrop-blur-md">
          No suggestions found for{" "}
          <span className="font-medium text-foreground">{state.seed}</span>.
          Try a broader seed or enable Expand mode.
        </div>
      )}

      {state?.ok && state.suggestions.length > 0 && (
        <section className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
          <div className="pointer-events-none absolute -left-12 -top-12 size-40 rounded-full bg-cyan-500/15 blur-3xl" />
          <header className="relative flex items-center justify-between border-b border-white/5 px-5 py-4">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Sparkles className="size-4 text-cyan-300" />
                {state.suggestions.length} suggestions for &ldquo;{state.seed}
                &rdquo;
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                From {state.source} · {state.country}
              </p>
            </div>
          </header>
          <ul className="relative max-h-[480px] divide-y divide-white/5 overflow-y-auto">
            {state.suggestions.map((s) => (
              <li
                key={s.query}
                className="flex items-center justify-between gap-4 px-5 py-3 text-sm transition-colors hover:bg-white/[0.03]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="font-medium">{s.query}</span>
                  <Term term={s.intent}>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${intentTone[s.intent]} no-underline`}
                    >
                      {s.intent}
                    </span>
                  </Term>
                  {s.isLongTail && (
                    <Term term="long-tail">
                      <span className="inline-flex shrink-0 items-center rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 ring-inset ring-white/10 no-underline">
                        long-tail
                      </span>
                    </Term>
                  )}
                </div>
                {clients.length > 0 ? (
                  <form
                    action={trackKeyword}
                    className="flex items-center gap-2"
                  >
                    <input type="hidden" name="query" value={s.query} />
                    <input type="hidden" name="country" value={state.country} />
                    <input type="hidden" name="device" value="desktop" />
                    <select
                      name="clientId"
                      defaultValue={clients[0].id}
                      className="h-7 rounded-md border border-white/10 bg-card/60 px-2 text-xs"
                    >
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <Button type="submit" size="sm" variant="outline">
                      Track
                    </Button>
                  </form>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Add a client to track
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
