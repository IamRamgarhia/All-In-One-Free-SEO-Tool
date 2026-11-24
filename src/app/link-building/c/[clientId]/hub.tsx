"use client";

import { useState, useTransition, useActionState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  Filter,
  Loader2,
  Plus,
  Send,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  bulkTrackResources,
  fetchBespokeIdeas,
  removeForClient,
  runLinkHealthCheck,
  setLiveUrlForClient,
  setStatusForClient,
  trackBespokeIdea,
  type IdeasState,
} from "./actions";
import { trackResource } from "../../actions";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import {
  difficultyTone,
  type Difficulty,
} from "@/lib/backlink-difficulty";
import { CATEGORY_LABELS as CATEGORY_LABELS_EN } from "@/lib/seo-resources-categories";
import { CATEGORY_LABELS_FR } from "@/lib/seo-resources-categories.fr";
import type { ScoredProspect } from "@/lib/backlink-niche-matcher";

type TrackedRow = {
  id: number;
  resourceId: number;
  status: string;
  submittedUrl: string | null;
  submittedAt: Date | null;
  createdAt: Date;
  url: string | null;
  domain: string | null;
  category: string | null;
  da: number | null;
};

type Tab = "ai-matched" | "tracker" | "bespoke";

const STATUS_TONE: Record<string, string> = {
  pending: "bg-white/5 text-muted-foreground ring-white/10",
  submitted: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  live: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  rejected: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  lost: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
};

export function ClientLinkBuildingHub({
  clientId,
  ranked,
  tracked,
  clientName,
}: {
  clientId: number;
  ranked: ScoredProspect[];
  tracked: TrackedRow[];
  clientName: string;
}) {
  const t = useTranslations("linksTab.linkBuilding.hub");
  const CATEGORY_LABELS = useLocale() === "fr" ? CATEGORY_LABELS_FR : CATEGORY_LABELS_EN;
  const [tab, setTab] = useState<Tab>("ai-matched");
  const [diffFilter, setDiffFilter] = useState<Difficulty | "all">("all");
  const [pending, startTransition] = useTransition();

  const visibleRanked =
    diffFilter === "all"
      ? ranked
      : ranked.filter((r) => r.difficulty === diffFilter);

  const easyIds = ranked
    .filter((r) => r.difficulty === "easy")
    .slice(0, 25)
    .map((r) => r.resource.id);

  const counts = {
    pending: tracked.filter((t) => t.status === "pending").length,
    submitted: tracked.filter((t) => t.status === "submitted").length,
    live: tracked.filter((t) => t.status === "live").length,
    lost: tracked.filter((t) => t.status === "lost").length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <button
          type="button"
          onClick={() => setTab("ai-matched")}
          className={tabClass(tab === "ai-matched")}
        >
          {t("tabs.aiMatched", { count: ranked.length })}
        </button>
        <button
          type="button"
          onClick={() => setTab("tracker")}
          className={tabClass(tab === "tracker")}
        >
          {t("tabs.tracker", { count: tracked.length })}
        </button>
        <button
          type="button"
          onClick={() => setTab("bespoke")}
          className={tabClass(tab === "bespoke")}
        >
          {t("tabs.bespoke")}
        </button>
      </div>

      {tab === "ai-matched" && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Filter className="size-3 text-muted-foreground" />
            {(["all", "easy", "medium", "hard", "paid"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDiffFilter(d)}
                className={`rounded-full px-2.5 py-1 ring-1 ring-inset transition-colors ${
                  diffFilter === d
                    ? "bg-violet-500/15 text-violet-300 ring-violet-500/30"
                    : "bg-white/5 text-muted-foreground ring-white/10 hover:bg-white/10"
                }`}
              >
                {d === "all" ? t("filterAll") : t(`difficulty.${d}`)}
              </button>
            ))}
            {easyIds.length > 0 && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    await bulkTrackResources(clientId, easyIds);
                  });
                }}
                className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/20 disabled:opacity-50"
              >
                {pending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Plus className="size-3" />
                )}
                {t("trackEasyWins", { count: easyIds.length })}
              </button>
            )}
          </div>

          <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
            {visibleRanked.length === 0 ? (
              <li className="px-5 py-8 text-center text-xs text-muted-foreground">
                {t("noProspects")}
              </li>
            ) : (
              visibleRanked.map((p) => (
                <li
                  key={p.resource.id}
                  className="flex items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-white/[0.03]"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <a
                      href={p.resource.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 truncate font-medium hover:underline"
                    >
                      {p.resource.domain}
                      <ExternalLink className="size-3 opacity-60" />
                    </a>
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span
                        className={`rounded-full px-1.5 py-0.5 ring-1 ring-inset ${difficultyTone(p.difficulty)}`}
                      >
                        {t(`difficulty.${p.difficulty}`)}
                      </span>
                      <span className="rounded-md bg-white/5 px-1.5 py-0.5 ring-1 ring-inset ring-white/10">
                        {CATEGORY_LABELS[p.resource.category] ??
                          p.resource.category}
                      </span>
                      {p.resource.da !== null && (
                        <span>{t("da", { value: p.resource.da })}</span>
                      )}
                      <span className="opacity-70">· {p.reason}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      startTransition(async () => {
                        await trackResource(p.resource.id, clientId);
                      });
                    }}
                    className="inline-flex h-7 items-center gap-1 rounded-md bg-violet-500/15 px-2 text-[11px] font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50"
                  >
                    {pending ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Plus className="size-3" />
                    )}
                    {t("track")}
                  </button>
                </li>
              ))
            )}
          </ul>
        </>
      )}

      {tab === "tracker" && (
        <>
          <div className="grid gap-2 text-[11px] sm:grid-cols-4">
            <Stat label={t("stats.pending")} value={counts.pending} tone="white" />
            <Stat label={t("stats.submitted")} value={counts.submitted} tone="violet" />
            <Stat label={t("stats.live")} value={counts.live} tone="emerald" />
            <Stat label={t("stats.lost")} value={counts.lost} tone="amber" />
          </div>
          <HealthCheckButton clientId={clientId} hasLive={counts.live > 0} />

          {tracked.length === 0 ? (
            <p className="rounded-2xl border border-white/5 bg-card/40 px-5 py-8 text-center text-xs text-muted-foreground backdrop-blur-md">
              {t.rich("emptyTracker", {
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
          ) : (
            <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
              {tracked.map((t) => (
                <TrackerRow key={t.id} clientId={clientId} row={t} />
              ))}
            </ul>
          )}
        </>
      )}

      {tab === "bespoke" && (
        <BespokePanel clientId={clientId} clientName={clientName} />
      )}
    </div>
  );
}

function HealthCheckButton({
  clientId,
  hasLive,
}: {
  clientId: number;
  hasLive: boolean;
}) {
  const t = useTranslations("linksTab.linkBuilding.hub.healthCheck");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    checked: number;
    lost: number;
    errors: number;
  } | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      <button
        type="button"
        disabled={pending || !hasLive}
        onClick={() => {
          setResult(null);
          startTransition(async () => {
            const r = await runLinkHealthCheck(clientId);
            setResult(r);
          });
        }}
        className="inline-flex h-7 items-center gap-1 rounded-md bg-emerald-500/10 px-2.5 text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/20 disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <CheckCircle2 className="size-3" />
        )}
        {t("run")}
      </button>
      {!hasLive && (
        <span className="text-muted-foreground">
          {t("needLive")}
        </span>
      )}
      {result && (
        <span className="text-muted-foreground">
          {t("result", {
            checked: result.checked,
            lost: result.lost,
            errors: result.errors,
          })}
        </span>
      )}
    </div>
  );
}

function statusLabel(
  t: ReturnType<typeof useTranslations<"linksTab.linkBuilding.hub">>,
  status: string,
): string {
  return t.has(`status.${status}`) ? t(`status.${status}`) : status;
}

function tabClass(active: boolean): string {
  return `rounded-full px-3 py-1 ring-1 ring-inset transition-colors ${
    active
      ? "bg-violet-500/15 text-violet-300 ring-violet-500/30"
      : "bg-white/5 text-muted-foreground ring-white/10 hover:bg-white/10"
  }`;
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "white" | "violet" | "emerald" | "amber";
}) {
  const t = {
    white: "text-foreground",
    violet: "text-violet-300",
    emerald: "text-emerald-300",
    amber: "text-amber-300",
  }[tone];
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-0.5 text-xl font-semibold tabular-nums ${t}`}>
        {value}
      </div>
    </div>
  );
}

function TrackerRow({
  clientId,
  row,
}: {
  clientId: number;
  row: TrackedRow;
}) {
  const t = useTranslations("linksTab.linkBuilding.hub");
  const locale = useLocale();
  const CATEGORY_LABELS = locale === "fr" ? CATEGORY_LABELS_FR : CATEGORY_LABELS_EN;
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <li className="px-5 py-3 text-sm transition-colors hover:bg-white/[0.03]">
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
            STATUS_TONE[row.status] ?? STATUS_TONE.pending
          }`}
        >
          {row.status === "live" ? (
            <CheckCircle2 className="size-2.5" />
          ) : row.status === "rejected" ? (
            <XCircle className="size-2.5" />
          ) : row.status === "lost" ? (
            <Eye className="size-2.5" />
          ) : (
            <Send className="size-2.5" />
          )}
          {statusLabel(t, row.status)}
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="font-medium">{row.domain ?? "—"}</div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
            <span>{CATEGORY_LABELS[row.category ?? ""] ?? row.category}</span>
            {row.da !== null && <span>· {t("da", { value: row.da })}</span>}
            {row.submittedAt && (
              <span>
                {t("row.statusOn", {
                  status: statusLabel(t, row.status),
                  date: row.submittedAt.toLocaleDateString(locale),
                })}
              </span>
            )}
          </div>
          {row.submittedUrl && (
            <a
              href={row.submittedUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-emerald-300 hover:underline"
            >
              ↳ {row.submittedUrl.replace(/^https?:\/\//, "").slice(0, 70)}
            </a>
          )}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-white/10"
          aria-label={t("row.expand")}
        >
          {expanded ? (
            <ChevronUp className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 grid gap-2 rounded-md border border-white/5 bg-black/20 p-3 text-xs sm:grid-cols-[1fr_auto]">
          <form
            action={setLiveUrlForClient.bind(null, clientId, row.id)}
            className="flex flex-wrap items-center gap-2"
          >
            <input
              name="submittedUrl"
              defaultValue={row.submittedUrl ?? ""}
              placeholder={t("row.livePlaceholder")}
              className="h-8 flex-1 rounded-md border border-white/10 bg-card/60 px-2.5 text-xs"
            />
            <button
              type="submit"
              className="inline-flex h-8 items-center gap-1 rounded-md bg-emerald-500/15 px-3 text-[11px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25"
            >
              <CheckCircle2 className="size-3" />
              {t("row.markLive")}
            </button>
          </form>
          <div className="flex flex-wrap items-center justify-end gap-1">
            {row.status === "pending" && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    await setStatusForClient(clientId, row.id, "submitted");
                  });
                }}
                className="rounded-md bg-violet-500/15 px-2 py-1 text-[10px] font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50"
              >
                {t("row.markSubmitted")}
              </button>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  await setStatusForClient(clientId, row.id, "rejected");
                });
              }}
              className="rounded-md bg-rose-500/10 px-2 py-1 text-[10px] font-medium text-rose-300 ring-1 ring-inset ring-rose-500/30 hover:bg-rose-500/20 disabled:opacity-50"
            >
              {t("row.rejected")}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  await setStatusForClient(clientId, row.id, "lost");
                });
              }}
              className="rounded-md bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30 hover:bg-amber-500/20 disabled:opacity-50"
            >
              {t("row.lost")}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={async () => {
                const ok = await confirmDialog({
                  title: t("row.confirmTitle"),
                  description: t("row.confirmDescription"),
                  confirmLabel: t("row.confirmLabel"),
                  destructive: true,
                });
                if (!ok) return;
                startTransition(async () => {
                  await removeForClient(clientId, row.id);
                });
              }}
              className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-50"
              aria-label={t("row.remove")}
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function BespokePanel({
  clientId,
  clientName,
}: {
  clientId: number;
  clientName: string;
}) {
  const [state, formAction, pending] = useActionState<IdeasState, FormData>(
    fetchBespokeIdeas,
    null,
  );
  const t = useTranslations("linksTab.linkBuilding.hub");
  const [tracking, startTransition] = useTransition();
  const [trackedSet, setTrackedSet] = useState<Set<string>>(new Set());

  return (
    <div className="space-y-3">
      <form
        action={formAction}
        className="rounded-2xl border border-white/5 bg-card/40 p-4 backdrop-blur-md"
      >
        <input type="hidden" name="clientId" value={clientId} />
        <p className="text-xs text-muted-foreground">
          {t.rich("bespoke.intro", {
            name: clientName,
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
        <button
          type="submit"
          disabled={pending}
          className="mt-3 inline-flex h-9 items-center rounded-md bg-violet-500/15 px-4 text-xs font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-3 animate-spin" />
              {t("bespoke.generating")}
            </>
          ) : (
            <>
              <Sparkles className="mr-2 size-3" />
              {t("bespoke.generate")}
            </>
          )}
        </button>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && (
        <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
          {state.ideas.map((idea, i) => (
            <li key={i} className="space-y-1 px-5 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={idea.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium hover:underline"
                >
                  {idea.name}
                  <ExternalLink className="size-3 opacity-60" />
                </a>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] ring-1 ring-inset ${difficultyTone(idea.difficulty)}`}
                >
                  {t(`difficulty.${idea.difficulty}`)}
                </span>
                <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground ring-1 ring-inset ring-white/10">
                  {t.has(`ideaType.${idea.type}`)
                    ? t(`ideaType.${idea.type}`)
                    : idea.type.replace(/_/g, " ")}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{idea.rationale}</p>
              <p className="text-[11px]">
                <span className="font-medium text-amber-300">{t("bespoke.action")}</span>{" "}
                <span className="text-foreground/90">{idea.actionStep}</span>
              </p>
              <button
                type="button"
                disabled={tracking || trackedSet.has(idea.url)}
                onClick={() => {
                  startTransition(async () => {
                    await trackBespokeIdea(clientId, idea);
                    setTrackedSet((s) => new Set(s).add(idea.url));
                  });
                }}
                className="mt-1 inline-flex h-7 items-center gap-1 rounded-md bg-emerald-500/15 px-2 text-[11px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50"
              >
                {trackedSet.has(idea.url) ? (
                  <>
                    <CheckCircle2 className="size-3" />
                    {t("bespoke.added")}
                  </>
                ) : (
                  <>
                    <Plus className="size-3" />
                    {t("bespoke.trackThis")}
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
