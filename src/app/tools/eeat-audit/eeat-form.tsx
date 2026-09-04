"use client";

import { useActionState } from "react";
import { usePresetUrl } from "@/components/use-preset-url";
import { Loader2, ShieldCheck } from "lucide-react";
import { runEeatAudit, type EeatState } from "./actions";
import { AiFeedback } from "@/components/ai-feedback";
import { AiDisclaimer } from "@/components/ai-disclaimer";

export function EeatForm() {
  // Prefilled when opened from a client, so the domain is not retyped.
  const presetUrl = usePresetUrl();
  const [state, formAction, pending] = useActionState<EeatState | null, FormData>(
    runEeatAudit,
    null,
  );

  return (
    <>
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3"
      >
        <div className="grid gap-3 md:grid-cols-[1fr_160px]">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Page URL</span>
            <input
              name="url"
              defaultValue={presetUrl}
              required
              placeholder="https://yoursite.com/blog/post"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="mt-5 inline-flex h-9 items-center rounded-md bg-emerald-500/15 px-5 text-sm font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50"
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Auditing E-E-A-T…
              </>
            ) : (
              <>
                <ShieldCheck className="mr-2 size-4" />
                Audit page
              </>
            )}
          </button>
        </div>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Pillar label="Experience" value={state.result.score.experience} />
            <Pillar label="Expertise" value={state.result.score.expertise} />
            <Pillar label="Authority" value={state.result.score.authority} />
            <Pillar label="Trust" value={state.result.score.trust} />
          </div>

          <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">
                Total E-E-A-T score:{" "}
                <span
                  className={
                    state.result.score.total >= 75
                      ? "text-emerald-300"
                      : state.result.score.total >= 50
                        ? "text-amber-300"
                        : "text-rose-300"
                  }
                >
                  {state.result.score.total}/100
                </span>
              </h2>
              <span className="text-xs text-muted-foreground">
                {state.result.score.total >= 75
                  ? "Strong"
                  : state.result.score.total >= 50
                    ? "Mixed"
                    : "Needs work"}
              </span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/5">
              <div
                className={`h-full rounded-full ${
                  state.result.score.total >= 75
                    ? "bg-emerald-400/70"
                    : state.result.score.total >= 50
                      ? "bg-amber-400/70"
                      : "bg-rose-400/70"
                }`}
                style={{ width: `${state.result.score.total}%` }}
              />
            </div>
          </section>

          <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-2">
            <h3 className="text-sm font-semibold">Detected signals</h3>
            <div className="grid gap-2 text-xs sm:grid-cols-2">
              <SignalRow
                label="Author byline"
                value={state.result.signals.authorName ?? "(none)"}
                ok={state.result.signals.hasAuthorByline}
              />
              <SignalRow
                label="Author bio"
                value={state.result.signals.hasAuthorBio ? "yes" : "missing"}
                ok={state.result.signals.hasAuthorBio}
              />
              <SignalRow
                label="Person schema"
                value={state.result.signals.hasAuthorSchema ? "yes" : "missing"}
                ok={state.result.signals.hasAuthorSchema}
              />
              <SignalRow
                label="Reviewer line"
                value={state.result.signals.hasReviewerLine ? "yes" : "missing"}
                ok={state.result.signals.hasReviewerLine}
              />
              <SignalRow
                label="Published"
                value={state.result.signals.publishedDate ?? "(none)"}
                ok={state.result.signals.hasPublishedDate}
              />
              <SignalRow
                label="Updated"
                value={state.result.signals.updatedDate ?? "(none)"}
                ok={state.result.signals.hasUpdatedDate}
              />
              <SignalRow
                label="Outbound citations"
                value={`${state.result.signals.outboundCitationCount} (${state.result.signals.authoritativeCitationCount} authoritative)`}
                ok={state.result.signals.outboundCitationCount >= 3}
              />
              <SignalRow
                label="Article schema"
                value={state.result.signals.hasArticleSchema ? "yes" : "missing"}
                ok={state.result.signals.hasArticleSchema}
              />
              <SignalRow
                label="Organization schema"
                value={state.result.signals.hasOrganizationSchema ? "yes" : "missing"}
                ok={state.result.signals.hasOrganizationSchema}
              />
              <SignalRow
                label="About link"
                value={state.result.signals.hasAboutLink ? "yes" : "missing"}
                ok={state.result.signals.hasAboutLink}
              />
              <SignalRow
                label="Contact link"
                value={state.result.signals.hasContactLink ? "yes" : "missing"}
                ok={state.result.signals.hasContactLink}
              />
              <SignalRow
                label="Privacy link"
                value={state.result.signals.hasPrivacyLink ? "yes" : "missing"}
                ok={state.result.signals.hasPrivacyLink}
              />
              <SignalRow
                label="Editorial policy"
                value={state.result.signals.hasEditorialPolicy ? "yes" : "missing"}
                ok={state.result.signals.hasEditorialPolicy}
              />
              <SignalRow
                label="HTTPS"
                value={state.result.signals.hasHttps ? "yes" : "no"}
                ok={state.result.signals.hasHttps}
              />
              <SignalRow
                label="Image alt coverage"
                value={`${state.result.signals.describedImageCount}/${state.result.signals.imageCount}`}
                ok={
                  state.result.signals.imageCount === 0 ||
                  state.result.signals.describedImageCount /
                    Math.max(1, state.result.signals.imageCount) >=
                    0.7
                }
              />
            </div>
          </section>

          {state.result.missing.length > 0 && (
            <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-2">
              <h3 className="text-sm font-semibold">Missing signals</h3>
              <ul className="space-y-1 text-sm">
                {state.result.missing.map((m) => (
                  <li key={m} className="flex items-start gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-rose-400" />
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {state.result.brief && (
            <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">AI fix punch list</h2>
                <AiFeedback
                  feature="content_idea"
                  aiOutput={state.result.brief}
                  size="sm"
                />
              </div>
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                {state.result.brief}
              </pre>
              <AiDisclaimer />
            </section>
          )}
        </>
      )}
    </>
  );
}

function Pillar({ label, value }: { label: string; value: number }) {
  const tone =
    value >= 18
      ? "text-emerald-300"
      : value >= 12
        ? "text-amber-300"
        : "text-rose-300";
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>
        {value}
        <span className="text-sm text-muted-foreground/60">/25</span>
      </div>
    </div>
  );
}

function SignalRow({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-white/[0.03] px-3 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`truncate font-medium ${ok ? "text-emerald-300" : "text-rose-300"}`}
      >
        {value}
      </span>
    </div>
  );
}
