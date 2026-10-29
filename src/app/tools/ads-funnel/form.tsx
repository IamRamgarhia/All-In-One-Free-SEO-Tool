"use client";

import { useActionState, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import {
  AD_PLATFORMS,
  NICHE_LABELS,
  type AdPlatformId,
  type BusinessNiche,
} from "@/lib/ads-skills";
import {
  generateAdsFunnel,
  type AdsFunnelState,
} from "./actions";
import { AdsFunnelResultView } from "./result";

type ClientRow = { id: number; name: string; url: string; niche: string | null };

const GOAL_OPTIONS: {
  value: "awareness" | "traffic" | "leads" | "sales" | "app_installs" | "engagement";
  label: string;
}[] = [
  { value: "leads", label: "Leads" },
  { value: "sales", label: "Sales" },
  { value: "traffic", label: "Traffic" },
  { value: "awareness", label: "Awareness" },
  { value: "engagement", label: "Engagement" },
  { value: "app_installs", label: "App installs" },
];

// One-line taglines for the platform picker. Full platform constraint
// details live in lib/ads-skills.ts and feed the AI prompt; the UI
// just needs enough to remind the user what each platform is FOR.
const PLATFORM_TAGLINES: Record<string, string> = {
  meta: "Mass reach, visual products.",
  google_search: "Catch buying intent.",
  google_display: "Retargeting layer.",
  google_shopping: "DTC / e-com only.",
  linkedin: "B2B with ≥$5k deals.",
  tiktok: "Short-form, Gen Z.",
  youtube: "Video + intent.",
};

const NICHE_KEYS = Object.keys(NICHE_LABELS) as BusinessNiche[];

export function AdsFunnelForm({
  clients,
  preselectClientId,
}: {
  clients: ClientRow[];
  preselectClientId: number | null;
}) {
  const [state, formAction, pending] = useActionState<
    AdsFunnelState | null,
    FormData
  >(generateAdsFunnel, null);

  const [selectedPlatforms, setSelectedPlatforms] = useState<
    Set<AdPlatformId>
  >(new Set(["meta", "google_search"]));
  const [selectedClientId, setSelectedClientId] = useState<number | null>(
    preselectClientId,
  );

  // Niche auto-fills when a client is picked, but the user can override
  const selectedClient = selectedClientId
    ? clients.find((c) => c.id === selectedClientId) ?? null
    : null;

  function togglePlatform(id: AdPlatformId) {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-5"
      >
        {/* Hidden platforms — one per selected */}
        {Array.from(selectedPlatforms).map((id) => (
          <input
            key={id}
            type="hidden"
            name="platforms"
            value={id}
          />
        ))}

        {/* Client (optional) */}
        {clients.length > 0 && (
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Client (optional)</span>
            <select
              name="clientId"
              defaultValue={preselectClientId ?? ""}
              onChange={(e) =>
                setSelectedClientId(e.target.value ? Number(e.target.value) : null)
              }
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
              <option value="">— Standalone (no client) —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.url.replace(/^https?:\/\//, "")})
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Platforms */}
        <div>
          <label className="text-sm font-semibold">Platforms</label>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {AD_PLATFORMS.map((p) => {
              const checked = selectedPlatforms.has(p.id);
              return (
                <label
                  key={p.id}
                  title={p.description}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                    checked
                      ? "border-rose-500/40 bg-rose-500/[0.04]"
                      : "border-white/10 hover:bg-white/[0.03]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePlatform(p.id)}
                    className="size-4 shrink-0 rounded border-white/20 bg-card/60"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <span>{p.emoji}</span>
                      <span className="truncate">{p.name}</span>
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {PLATFORM_TAGLINES[p.id] ?? ""}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Niche + goal + budget — compact row */}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Niche</span>
            <select
              name="niche"
              key={selectedClient?.niche ?? "free"}
              defaultValue={(selectedClient?.niche as BusinessNiche) ?? ""}
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
              <option value="">—</option>
              {NICHE_KEYS.map((k) => (
                <option key={k} value={k}>
                  {NICHE_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Goal</span>
            <select
              name="goal"
              defaultValue="leads"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
              {GOAL_OPTIONS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Budget USD/mo</span>
            <input
              name="monthlyBudgetUsd"
              type="number"
              defaultValue={1000}
              min={100}
              step={100}
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
        </div>

        {/* Product + landing */}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Product / service</span>
            <input
              name="productName"
              placeholder="Dice Codes"
              defaultValue=""
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Landing URL</span>
            <input
              name="landingUrl"
              type="url"
              placeholder="https://yoursite.com/offer"
              defaultValue={selectedClient?.url ?? ""}
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
        </div>

        {/* Audience + offer */}
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Audience</span>
          <textarea
            name="audience"
            rows={2}
            placeholder="B2B marketing managers at 50-500p SaaS, frustrated with their current attribution tool"
            className="w-full rounded-md border border-white/10 bg-card/60 px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </label>

        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Offer</span>
          <textarea
            name="offer"
            rows={2}
            placeholder="14-day free trial, no credit card"
            className="w-full rounded-md border border-white/10 bg-card/60 px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </label>

        {state && !state.ok && (
          <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending || selectedPlatforms.size === 0}
          className="inline-flex h-11 items-center rounded-md bg-rose-500/15 px-6 text-sm font-medium text-rose-300 ring-1 ring-inset ring-rose-500/30 hover:bg-rose-500/25 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Generating… (~60s)
            </>
          ) : (
            <>
              <Sparkles className="mr-2 size-4" />
              Generate strategy
            </>
          )}
        </button>
      </form>

      {state?.ok && <AdsFunnelResultView result={state.result} />}
    </>
  );
}
