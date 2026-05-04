"use client";

import { useActionState, useState, useTransition } from "react";
import {
  CheckCircle2,
  Circle,
  Globe,
  Loader2,
  MapPin,
  Search,
  Sparkles,
} from "lucide-react";
import {
  acceptDiscoveredKeywords,
  generateMonthlyCalendar,
  runKeywordDiscovery,
  saveBrandStep,
  saveTargetingStep,
  skipOnboarding,
  type DiscoverState,
  type SaveBrandResult,
} from "./actions";
import { COUNTRIES } from "./countries";

type Step = "pending" | "brand" | "keywords" | "targeting" | "completed";

type WizardClient = {
  id: number;
  name: string;
  url: string;
  niche: "local" | "ecommerce" | "saas" | "blog" | "services" | null;
  description: string | null;
  businessType: string | null;
  country: string;
  language: string;
  city: string | null;
  geoTarget: "country" | "city" | "multi";
  serviceRadiusKm: number | null;
  gscProperty: string | null;
  gbpUrl: string | null;
  onboardingStep: Step;
  planGeneratedAt: Date | null;
};

const STEPS: { id: Step; label: string }[] = [
  { id: "brand", label: "Brand" },
  { id: "keywords", label: "Keywords" },
  { id: "targeting", label: "Targeting" },
  { id: "completed", label: "Plan" },
];

export function OnboardingWizard({ client }: { client: WizardClient }) {
  const initial: Step =
    client.onboardingStep === "pending" ? "brand" : client.onboardingStep;
  const [step, setStep] = useState<Step>(initial);

  return (
    <>
      <Stepper current={step} />

      {step === "brand" && (
        <BrandStep client={client} onNext={() => setStep("keywords")} />
      )}
      {step === "keywords" && (
        <KeywordsStep client={client} onNext={() => setStep("targeting")} />
      )}
      {step === "targeting" && (
        <TargetingStep client={client} onNext={() => setStep("completed")} />
      )}
      {step === "completed" && <CompletedStep client={client} />}
    </>
  );
}

function Stepper({ current }: { current: Step }) {
  const idx = STEPS.findIndex((s) => s.id === current);
  return (
    <ol className="flex items-center gap-3 text-xs">
      {STEPS.map((s, i) => {
        const isDone = i < idx;
        const isCurrent = i === idx;
        return (
          <li key={s.id} className="flex items-center gap-2">
            {isDone ? (
              <CheckCircle2 className="size-4 text-emerald-300" />
            ) : (
              <Circle
                className={`size-4 ${isCurrent ? "text-violet-300" : "text-muted-foreground/40"}`}
              />
            )}
            <span
              className={
                isCurrent
                  ? "font-medium text-foreground"
                  : isDone
                    ? "text-emerald-300"
                    : "text-muted-foreground"
              }
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <span className="text-muted-foreground/30">·</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// =========== Step 1: Brand ===========

function BrandStep({
  client,
  onNext,
}: {
  client: WizardClient;
  onNext: () => void;
}) {
  const [state, formAction, pending] = useActionState<
    SaveBrandResult | null,
    FormData
  >(saveBrandStep, null);

  if (state?.ok) {
    queueMicrotask(onNext);
  }

  return (
    <form
      action={formAction}
      className="glass-apple relative overflow-hidden rounded-2xl p-6 space-y-4"
    >
      <input type="hidden" name="clientId" value={client.id} />
      <h2 className="text-base font-semibold flex items-center gap-2">
        <Sparkles className="size-4 text-violet-300" />
        Tell me about the business
      </h2>
      <p className="text-xs text-muted-foreground">
        One paragraph + a niche is all I need to start finding keywords. The
        details inform the 30-day plan that comes out the other end.
      </p>

      <label className="block space-y-1 text-xs">
        <span className="text-muted-foreground">
          What does {client.name} do? (1-3 sentences)
        </span>
        <textarea
          name="description"
          rows={4}
          maxLength={2000}
          defaultValue={client.description ?? ""}
          placeholder="Bakery in Portland specializing in sourdough, croissants, and Saturday cinnamon rolls. We deliver locally, run a small wholesale program for restaurants, and host a weekly bread-making class."
          className="w-full rounded-md border border-white/10 bg-card/60 px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
      </label>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="block space-y-1 text-xs">
          <span className="text-muted-foreground">Business type</span>
          <input
            name="businessType"
            maxLength={120}
            defaultValue={client.businessType ?? ""}
            placeholder="bakery / dentist / SaaS / law firm…"
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </label>
        <label className="block space-y-1 text-xs">
          <span className="text-muted-foreground">Niche</span>
          <select
            name="niche"
            defaultValue={client.niche ?? ""}
            className="flex h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
          >
            <option value="">— pick one —</option>
            <option value="local">Local business (Maps + GBP-driven)</option>
            <option value="ecommerce">E-commerce</option>
            <option value="saas">SaaS / B2B</option>
            <option value="blog">Blog / Content</option>
            <option value="services">Services / Professional</option>
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between gap-2">
        <SkipButton clientId={client.id} />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center rounded-md bg-violet-500/15 px-4 text-xs font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Continue → keyword discovery"}
        </button>
      </div>

      {state && !state.ok && (
        <p className="text-xs text-rose-300">{state.error}</p>
      )}
    </form>
  );
}

// =========== Step 2: Keywords ===========

function KeywordsStep({
  client,
  onNext,
}: {
  client: WizardClient;
  onNext: () => void;
}) {
  const [state, formAction, discovering] = useActionState<
    DiscoverState | null,
    FormData
  >(runKeywordDiscovery, null);
  const [accepted, acceptAction, accepting] = useActionState<
    SaveBrandResult | null,
    FormData
  >(acceptDiscoveredKeywords, null);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (accepted?.ok) queueMicrotask(onNext);

  const all = state?.ok ? state.keywords : [];
  // Pre-select top 12 on first arrival of results
  if (state?.ok && selected.size === 0 && all.length > 0) {
    const top = new Set(all.slice(0, 12).map((k) => k.query));
    setSelected(top);
  }

  return (
    <section className="glass-apple relative overflow-hidden rounded-2xl p-6 space-y-4">
      <h2 className="text-base font-semibold flex items-center gap-2">
        <Search className="size-4 text-cyan-300" />
        Auto keyword discovery
      </h2>
      <p className="text-xs text-muted-foreground">
        Pulls from {client.gscProperty ? "real GSC data + " : ""}AI brand
        analysis + Google autocomplete. Pick the ones that look right —
        they&apos;ll be tracked from day one.
      </p>

      {!state?.ok && (
        <form action={formAction}>
          <input type="hidden" name="clientId" value={client.id} />
          <button
            type="submit"
            disabled={discovering}
            className="inline-flex h-10 items-center rounded-md bg-cyan-500/15 px-4 text-sm font-medium text-cyan-300 ring-1 ring-inset ring-cyan-500/30 hover:bg-cyan-500/25 disabled:opacity-50"
          >
            {discovering ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Searching for keywords…
              </>
            ) : (
              "Run keyword discovery"
            )}
          </button>
        </form>
      )}

      {state && !state.ok && (
        <p className="text-xs text-rose-300">{state.error}</p>
      )}

      {state?.ok && (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-md bg-black/20 px-4 py-3 text-xs text-muted-foreground">
            <span>Found {state.keywords.length} keywords</span>
            {state.gscRowsUsed > 0 && (
              <span>· {state.gscRowsUsed} from real GSC data</span>
            )}
            <span>· {state.seedsUsed.length} seeds used</span>
          </div>

          <div className="grid max-h-[420px] gap-1.5 overflow-y-auto pr-2 sm:grid-cols-2">
            {all.map((k) => {
              const isSel = selected.has(k.query);
              return (
                <label
                  key={k.query}
                  className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-xs transition-colors ${
                    isSel
                      ? "border-violet-500/40 bg-violet-500/10"
                      : "border-white/5 bg-white/[0.02] hover:bg-white/[0.05]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() => {
                      const s = new Set(selected);
                      if (s.has(k.query)) s.delete(k.query);
                      else s.add(k.query);
                      setSelected(s);
                    }}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{k.query}</div>
                    <div className="mt-0.5 flex flex-wrap gap-1.5 text-[9px] text-muted-foreground">
                      <span className="rounded bg-white/5 px-1.5 py-0.5">
                        {k.intent}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 ${tone(k.score)}`}
                      >
                        score {k.score}
                      </span>
                      {k.source === "gsc" && (
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-300">
                          GSC
                        </span>
                      )}
                      {k.impressions !== undefined && (
                        <span>{k.impressions.toLocaleString()} imp</span>
                      )}
                      {k.position !== undefined && (
                        <span>pos {k.position.toFixed(1)}</span>
                      )}
                      {k.isLocal && (
                        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-300">
                          local
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          <form action={acceptAction} className="flex items-center justify-between gap-2 pt-2">
            <input type="hidden" name="clientId" value={client.id} />
            <input
              type="hidden"
              name="selected"
              value={JSON.stringify(Array.from(selected))}
            />
            <p className="text-xs text-muted-foreground">
              {selected.size} selected to track
            </p>
            <button
              type="submit"
              disabled={accepting || selected.size === 0}
              className="inline-flex h-9 items-center rounded-md bg-violet-500/15 px-4 text-xs font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50"
            >
              {accepting
                ? "Saving…"
                : `Track ${selected.size} keywords → next step`}
            </button>
          </form>
          {accepted && !accepted.ok && (
            <p className="text-xs text-rose-300">{accepted.error}</p>
          )}
        </>
      )}
    </section>
  );
}

// =========== Step 3: Targeting ===========

function TargetingStep({
  client,
  onNext,
}: {
  client: WizardClient;
  onNext: () => void;
}) {
  const [state, formAction, pending] = useActionState<
    SaveBrandResult | null,
    FormData
  >(saveTargetingStep, null);

  if (state?.ok) queueMicrotask(onNext);

  return (
    <form
      action={formAction}
      className="glass-apple relative overflow-hidden rounded-2xl p-6 space-y-4"
    >
      <input type="hidden" name="clientId" value={client.id} />

      <h2 className="text-base font-semibold flex items-center gap-2">
        <MapPin className="size-4 text-emerald-300" />
        Where should we rank?
      </h2>
      <p className="text-xs text-muted-foreground">
        This drives every rank check, autocomplete suggestion, and
        country-specific citation directory. Picking the right country alone
        usually moves measured rank by 10+ positions.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="block space-y-1 text-xs">
          <span className="text-muted-foreground">Country</span>
          <select
            name="country"
            defaultValue={client.country}
            required
            className="flex h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-xs">
          <span className="text-muted-foreground">Language</span>
          <select
            name="language"
            defaultValue={client.language}
            className="flex h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
          >
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="hi">Hindi</option>
            <option value="pt">Portuguese</option>
            <option value="ja">Japanese</option>
            <option value="ar">Arabic</option>
            <option value="zh">Chinese</option>
            <option value="it">Italian</option>
            <option value="nl">Dutch</option>
            <option value="ru">Russian</option>
          </select>
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_180px]">
        <label className="block space-y-1 text-xs">
          <span className="text-muted-foreground">
            City (only if business serves a specific area)
          </span>
          <input
            name="city"
            maxLength={120}
            defaultValue={client.city ?? ""}
            placeholder="Portland"
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </label>
        <label className="block space-y-1 text-xs">
          <span className="text-muted-foreground">Geo-target mode</span>
          <select
            name="geoTarget"
            defaultValue={client.geoTarget}
            className="flex h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
          >
            <option value="country">Country-wide</option>
            <option value="city">City / local</option>
            <option value="multi">Multi-country</option>
          </select>
        </label>
      </div>

      <label className="block space-y-1 text-xs">
        <span className="text-muted-foreground">
          Service radius (km, optional — only for local businesses)
        </span>
        <input
          name="serviceRadiusKm"
          type="number"
          min={0}
          max={10000}
          defaultValue={client.serviceRadiusKm ?? ""}
          placeholder="25"
          className="h-9 w-40 rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
      </label>

      <div className="flex items-center justify-between gap-2 pt-2">
        <SkipButton clientId={client.id} />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center rounded-md bg-emerald-500/15 px-4 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Continue → generate plan"}
        </button>
      </div>

      {state && !state.ok && (
        <p className="text-xs text-rose-300">{state.error}</p>
      )}
    </form>
  );
}

// =========== Step 4: Completed / generate plan ===========

function CompletedStep({ client }: { client: WizardClient }) {
  const [, startTransition] = useTransition();
  const [planState, setPlanState] = useState<
    | null
    | { ok: true; tasksCreated: number; planRef: string }
    | { ok: false; error: string }
  >(null);
  const [generating, setGenerating] = useState(false);
  const [learnedRules, setLearnedRules] = useState<
    { rule: string; confidence: string; feature: string }[] | null
  >(null);

  // Lazy-load learned rules once
  if (learnedRules === null && typeof window !== "undefined") {
    queueMicrotask(() => {
      import("./actions").then(async ({ getLearnedRulesForClient }) => {
        const rules = await getLearnedRulesForClient(client.id);
        setLearnedRules(rules);
      });
    });
  }

  return (
    <section className="glass-apple relative overflow-hidden rounded-2xl p-6 space-y-4">
      <h2 className="text-base font-semibold flex items-center gap-2">
        <Globe className="size-4 text-violet-300" />
        Ready to generate your 30-day plan
      </h2>
      <p className="text-xs text-muted-foreground">
        Builds 30 daily tasks tailored to this client&apos;s niche, locale,
        tech stack, and (when connected) real GSC data. Tasks land directly
        in the Tasks board with due dates spread across the next month.
      </p>

      {learnedRules && learnedRules.length > 0 && (
        <div className="rounded-md border border-violet-500/20 bg-violet-500/5 p-4 text-xs">
          <h3 className="font-semibold text-violet-200 flex items-center gap-1.5">
            <Sparkles className="size-3.5" />
            What the tool has learned about your style
          </h3>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {learnedRules.slice(0, 5).map((r, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-0.5 size-1 shrink-0 rounded-full bg-violet-400" />
                <span>{r.rule}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-muted-foreground/70">
            These rules are auto-applied to AI output for this client. Manage them in{" "}
            <a href="/settings/ai-learning" className="underline">
              Settings → AI learning
            </a>
            .
          </p>
        </div>
      )}

      {planState?.ok ? (
        <div className="rounded-md bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
          ✓ Generated {planState.tasksCreated} tasks under plan{" "}
          <code className="rounded bg-black/30 px-1.5 py-0.5 text-xs">
            {planState.planRef}
          </code>
          .{" "}
          <a href={`/tasks?client=${client.id}`} className="underline">
            View on the tasks board →
          </a>
        </div>
      ) : (
        <button
          type="button"
          disabled={generating}
          onClick={() => {
            setGenerating(true);
            startTransition(async () => {
              const res = await generateMonthlyCalendar(client.id);
              setPlanState(res);
              setGenerating(false);
            });
          }}
          className="inline-flex h-10 items-center rounded-md bg-violet-500/15 px-5 text-sm font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50"
        >
          {generating ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Generating 30-day plan…
            </>
          ) : (
            "Generate 30-day plan"
          )}
        </button>
      )}

      {planState && !planState.ok && (
        <p className="text-xs text-rose-300">{planState.error}</p>
      )}

      <div className="rounded-md border border-white/5 bg-black/20 p-4 text-xs text-muted-foreground">
        <strong className="text-foreground">What&apos;s in the plan</strong>
        <ul className="mt-2 space-y-0.5">
          <li>· Week 1: technical baseline + audit-driven fixes</li>
          <li>· Week 2: GSC quick-wins + content sprint</li>
          <li>· Week 3: GBP + local + AI visibility</li>
          <li>· Week 4: outreach + competitor gaps + monthly report</li>
        </ul>
      </div>
    </section>
  );
}

function SkipButton({ clientId }: { clientId: number }) {
  return (
    <form action={skipOnboarding.bind(null, clientId)}>
      <button
        type="submit"
        className="text-xs text-muted-foreground hover:text-foreground hover:underline"
      >
        Skip onboarding
      </button>
    </form>
  );
}

function tone(score: number): string {
  if (score >= 70) return "bg-emerald-500/15 text-emerald-300";
  if (score >= 50) return "bg-cyan-500/15 text-cyan-300";
  if (score >= 30) return "bg-white/10 text-foreground";
  return "bg-white/5 text-muted-foreground";
}
