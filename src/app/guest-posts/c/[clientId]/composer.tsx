"use client";

import { useActionState, useState, useTransition } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Loader2,
  Send,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import {
  deleteDraft,
  generateGuestPost,
  setDraftLiveUrl,
  setDraftStatus,
  suggestGuestPostTitles,
  updateDraftMarkdown,
  type GenerateState,
  type SuggestTitlesState,
} from "./actions";
import {
  difficultyTone,
} from "@/lib/backlink-difficulty";
import type { GuestPostSite } from "@/lib/guest-post-sites";
import type { GuestPostDraft } from "@/db/schema";
import { AiDisclaimer } from "@/components/ai-disclaimer";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import {
  AiModelPicker,
  type ModelSelection,
} from "@/components/ai-model-picker";

function TitleSuggester({
  clientId,
  siteId,
  onPick,
}: {
  clientId: number;
  siteId: string;
  onPick: (title: string) => void;
}) {
  const [state, formAction, pending] = useActionState<SuggestTitlesState, FormData>(
    suggestGuestPostTitles,
    null,
  );

  return (
    <div className="rounded-md bg-violet-500/[0.05] p-3 ring-1 ring-inset ring-violet-500/20 space-y-2">
      <header className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-violet-200">
            Stuck on a title? Let AI propose 6.
          </p>
          <p className="text-[11px] text-muted-foreground">
            Tailored to {siteId}&apos;s house style + your client&apos;s niche.
          </p>
        </div>
      </header>
      <form action={formAction} className="space-y-2">
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="siteId" value={siteId} />
        <div className="grid gap-2 md:grid-cols-[2fr_3fr]">
          <input
            name="targetKeyword"
            required
            placeholder="Target keyword (e.g. saas onboarding)"
            className="h-8 w-full rounded-md border border-white/10 bg-card/60 px-2.5 text-xs focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <input
            name="additionalContext"
            placeholder="Optional extra context (audience, angle hint…)"
            className="h-8 w-full rounded-md border border-white/10 bg-card/60 px-2.5 text-xs focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>
        <button
          type="submit"
          disabled={pending || !siteId}
          className="inline-flex h-7 items-center gap-1 rounded-md bg-violet-500/15 px-2.5 text-[11px] font-medium text-violet-200 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="size-3 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles className="size-3" />
              Suggest 6 titles
            </>
          )}
        </button>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-2 py-1 text-[11px] text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state && state.ok && (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Click a title to use it as the topic
          </p>
          <ul className="space-y-1">
            {state.titles.map((t, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onPick(t.title)}
                  className="group flex w-full items-start gap-2 rounded-md border border-white/5 bg-card/40 px-2.5 py-2 text-left text-xs transition-colors hover:border-violet-500/30 hover:bg-violet-500/10"
                >
                  <span className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-[10px] font-bold text-violet-200">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="block font-medium text-foreground/95 group-hover:text-violet-200">
                      {t.title}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {t.angle}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function GuestPostComposer({
  clientId,
  clientName,
  recommendedSites,
  allSites,
  drafts,
}: {
  clientId: number;
  clientName: string;
  recommendedSites: GuestPostSite[];
  allSites: GuestPostSite[];
  drafts: GuestPostDraft[];
}) {
  const [tab, setTab] = useState<"new" | "drafts">("new");
  const recommendedIds = new Set(recommendedSites.map((s) => s.id));
  const otherSites = allSites.filter((s) => !recommendedIds.has(s.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <button
          type="button"
          onClick={() => setTab("new")}
          className={tabClass(tab === "new")}
        >
          New draft
        </button>
        <button
          type="button"
          onClick={() => setTab("drafts")}
          className={tabClass(tab === "drafts")}
        >
          Saved drafts ({drafts.length})
        </button>
      </div>

      {tab === "new" && (
        <NewDraft
          clientId={clientId}
          clientName={clientName}
          recommendedSites={recommendedSites}
          otherSites={otherSites}
        />
      )}

      {tab === "drafts" && <DraftsList drafts={drafts} clientId={clientId} />}
    </div>
  );
}

function tabClass(active: boolean): string {
  return `rounded-full px-3 py-1 ring-1 ring-inset transition-colors ${
    active
      ? "bg-amber-500/15 text-amber-300 ring-amber-500/30"
      : "bg-white/5 text-muted-foreground ring-white/10 hover:bg-white/10"
  }`;
}

function NewDraft({
  clientId,
  clientName,
  recommendedSites,
  otherSites,
}: {
  clientId: number;
  clientName: string;
  recommendedSites: GuestPostSite[];
  otherSites: GuestPostSite[];
}) {
  const [state, formAction, pending] = useActionState<GenerateState, FormData>(
    generateGuestPost,
    null,
  );
  const [siteId, setSiteId] = useState<string>(
    recommendedSites[0]?.id ?? otherSites[0]?.id ?? "medium",
  );
  const [topic, setTopic] = useState("");
  const [modelSel, setModelSel] = useState<ModelSelection>({
    provider: undefined,
    model: undefined,
  });
  const allSites = [...recommendedSites, ...otherSites];
  const selectedSite = allSites.find((s) => s.id === siteId);

  return (
    <div className="space-y-4">
      <section className="glass-apple relative overflow-hidden rounded-2xl">
        <header className="border-b border-white/[0.06] px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Sparkles className="size-4 text-amber-300" />
            Pick a platform
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Tuned recommendations for <strong>{clientName}</strong>&apos;s niche
            sit on top. Each platform has its own style — the AI will write
            specifically for it.
          </p>
        </header>
        <div className="grid gap-2 p-5 md:grid-cols-2">
          {recommendedSites.length > 0 && (
            <div className="md:col-span-2">
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-300/90">
                Recommended for your niche
              </h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {recommendedSites.map((s) => (
                  <SiteCard
                    key={s.id}
                    site={s}
                    selected={siteId === s.id}
                    onPick={() => setSiteId(s.id)}
                  />
                ))}
              </div>
            </div>
          )}
          {otherSites.length > 0 && (
            <div className="md:col-span-2">
              <h3 className="mb-2 mt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Other platforms
              </h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {otherSites.map((s) => (
                  <SiteCard
                    key={s.id}
                    site={s}
                    selected={siteId === s.id}
                    onPick={() => setSiteId(s.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3"
      >
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="siteId" value={siteId} />

        {selectedSite && (
          <div className="rounded-md border border-white/5 bg-black/20 p-3 text-[11px] text-muted-foreground">
            <div className="font-medium text-foreground/90">
              Writing for {selectedSite.name} ({selectedSite.domain})
            </div>
            <div className="mt-1 grid gap-1 sm:grid-cols-2">
              <span>
                <strong>Tone:</strong> {selectedSite.style.tone}
              </span>
              <span>
                <strong>Length target:</strong>{" "}
                {selectedSite.style.wordCount.ideal} words (
                {selectedSite.style.wordCount.min}–
                {selectedSite.style.wordCount.max})
              </span>
              <span>
                <strong>Links:</strong>{" "}
                {selectedSite.dofollowPolicy === "dofollow"
                  ? "Dofollow"
                  : selectedSite.dofollowPolicy === "nofollow"
                    ? "Nofollow"
                    : "Mixed"}
              </span>
              <span>
                <strong>Difficulty:</strong> {selectedSite.difficulty}
              </span>
            </div>
          </div>
        )}

        <TitleSuggester
          clientId={clientId}
          siteId={siteId}
          onPick={setTopic}
        />

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Topic *</span>
            <input
              name="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              required
              placeholder="e.g. how we cut SaaS onboarding from 12 days to 2"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Target keyword *</span>
            <input
              name="targetKeyword"
              required
              placeholder="e.g. saas onboarding flow"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
        </div>

        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Supporting keywords (optional)</span>
          <input
            name="supportingKeywords"
            placeholder="user activation, free trial conversion"
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
          />
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Author name (byline)</span>
            <input
              name="authorName"
              placeholder="Your name"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Author bio (1-2 sentences for footer)</span>
            <input
              name="authorBio"
              placeholder="Founder of Dice Codes. 12 years building SaaS at $0-$10M ARR."
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            />
          </label>
        </div>

        <input type="hidden" name="aiProvider" value={modelSel.provider ?? ""} />
        <input type="hidden" name="aiModel" value={modelSel.model ?? ""} />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-10 items-center rounded-md bg-amber-500/15 px-5 text-sm font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30 hover:bg-amber-500/25 disabled:opacity-50"
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Writing… (~30-90s)
              </>
            ) : (
              <>
                <Wand2 className="mr-2 size-4" />
                Write guest post
              </>
            )}
          </button>
          <AiModelPicker selection={modelSel} onChange={setModelSel} size="sm" />
        </div>
        <p className="text-[11px] text-muted-foreground">
          The AI matches the platform&apos;s house style, varies sentence
          length, includes citations, and limits target-keyword density.
        </p>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && (
        <DraftPreview
          draftId={state.draftId}
          siteName={state.siteName}
          markdown={state.markdown}
          qa={state.qa}
          meta={state.meta}
          clientId={clientId}
        />
      )}
    </div>
  );
}

function SiteCard({
  site,
  selected,
  onPick,
}: {
  site: GuestPostSite;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={`group relative overflow-hidden rounded-xl border px-3 py-2.5 text-left text-xs transition-colors ${
        selected
          ? "border-amber-500/50 bg-amber-500/10"
          : "border-white/5 bg-card/40 hover:bg-white/[0.04]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{site.name}</span>
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] ring-1 ring-inset ${difficultyTone(site.difficulty)}`}
        >
          {site.difficulty}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
        <span>{site.domain}</span>
        <span>· DA ~{site.estDA}</span>
        <span
          className={
            site.dofollowPolicy === "dofollow"
              ? "text-emerald-300"
              : site.dofollowPolicy === "nofollow"
                ? "text-amber-300"
                : "text-muted-foreground"
          }
        >
          · {site.dofollowPolicy}
        </span>
      </div>
    </button>
  );
}

function DraftPreview({
  draftId,
  siteName,
  markdown: initialMd,
  qa,
  meta,
  clientId,
}: {
  draftId: number;
  siteName: string;
  markdown: string;
  qa: { severity: string; message: string }[];
  meta: {
    wordCount: number;
    targetKeywordOccurrences: number;
    headingsCount: number;
  };
  clientId: number;
}) {
  const [markdown, setMarkdown] = useState(initialMd);
  const [copied, setCopied] = useState(false);
  const [savePending, startSave] = useTransition();
  const [saved, setSaved] = useState(false);

  function copy() {
    navigator.clipboard.writeText(markdown).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function downloadMd() {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `guest-post-${siteName.toLowerCase().replace(/\s+/g, "-")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function save() {
    const fd = new FormData();
    fd.append("markdown", markdown);
    startSave(async () => {
      await updateDraftMarkdown(draftId, fd);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  return (
    <section className="glass-apple relative overflow-hidden rounded-2xl">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <CheckCircle2 className="size-4 text-emerald-300" />
            Draft for {siteName}
          </h2>
          <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span>{meta.wordCount} words</span>
            <span>· {meta.headingsCount} headings</span>
            <span>· keyword used {meta.targetKeywordOccurrences}×</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={savePending}
            className="inline-flex h-8 items-center gap-1 rounded-md bg-violet-500/15 px-3 text-[11px] font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50"
          >
            {savePending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : saved ? (
              <CheckCircle2 className="size-3" />
            ) : (
              <FileText className="size-3" />
            )}
            {saved ? "Saved" : "Save edits"}
          </button>
          <button
            type="button"
            onClick={copy}
            className="inline-flex h-8 items-center gap-1 rounded-md bg-emerald-500/15 px-3 text-[11px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25"
          >
            <Copy className="size-3" />
            {copied ? "Copied" : "Copy markdown"}
          </button>
          <button
            type="button"
            onClick={downloadMd}
            className="inline-flex h-8 items-center gap-1 rounded-md bg-white/5 px-3 text-[11px] font-medium text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10"
          >
            <Download className="size-3" />
            .md
          </button>
        </div>
      </header>

      {qa.length > 0 && (
        <div className="border-b border-white/5 bg-amber-500/[0.04] px-5 py-3 text-xs">
          <p className="font-medium text-amber-300/90">QA notes</p>
          <ul className="mt-1 space-y-0.5">
            {qa.map((q, i) => (
              <li
                key={i}
                className={`flex items-start gap-1.5 ${q.severity === "error" ? "text-rose-300" : "text-amber-200/80"}`}
              >
                {q.severity === "error" ? (
                  <AlertCircle className="mt-0.5 size-3 shrink-0" />
                ) : (
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                )}
                <span>{q.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="p-5">
        <textarea
          value={markdown}
          onChange={(e) => {
            setMarkdown(e.target.value);
            setSaved(false);
          }}
          rows={28}
          spellCheck
          className="w-full rounded-md border border-white/10 bg-black/30 p-4 font-mono text-[13px] leading-relaxed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <a
            href={`/link-building/c/${clientId}`}
            className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
          >
            ← Back to backlink hub
          </a>
          <AiDisclaimer variant="inline" />
        </div>
      </div>
    </section>
  );
}

function DraftsList({
  drafts,
  clientId,
}: {
  drafts: GuestPostDraft[];
  clientId: number;
}) {
  if (drafts.length === 0) {
    return (
      <p className="rounded-2xl border border-white/5 bg-card/40 px-5 py-12 text-center text-sm text-muted-foreground backdrop-blur-md">
        No drafts yet. Generate one in the &quot;New draft&quot; tab.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {drafts.map((d) => (
        <DraftRow key={d.id} draft={d} clientId={clientId} />
      ))}
    </ul>
  );
}

const STATUS_TONE: Record<string, string> = {
  draft: "bg-white/5 text-muted-foreground ring-white/10",
  pitched: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  accepted: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  published: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  rejected: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
};

function DraftRow({
  draft,
  clientId,
}: {
  draft: GuestPostDraft;
  clientId: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  void clientId;

  return (
    <li className="glass-apple relative overflow-hidden rounded-xl">
      <header className="flex flex-wrap items-center gap-3 px-5 py-3">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${STATUS_TONE[draft.status]}`}
        >
          {draft.status}
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="font-medium">{draft.topic}</p>
          <p className="text-[11px] text-muted-foreground">
            {draft.siteName} · target: {draft.targetKeyword} · created{" "}
            {draft.createdAt.toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {draft.liveUrl && (
            <a
              href={draft.liveUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-emerald-300 hover:underline"
            >
              <ExternalLink className="size-3" />
              live
            </a>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-white/10"
            aria-label="View"
          >
            <Eye className="size-3.5" />
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              const ok = await confirmDialog({
                title: "Delete this draft?",
                description: "The guest-post draft and its history are removed.",
                confirmLabel: "Delete draft",
                destructive: true,
              });
              if (!ok) return;
              startTransition(async () => {
                await deleteDraft(draft.id);
              });
            }}
            className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-50"
            aria-label="Delete"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </header>
      {open && (
        <div className="space-y-2 border-t border-white/5 bg-black/20 p-4 text-[13px]">
          <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap font-mono text-[12px] leading-relaxed">
            {draft.markdown}
          </pre>
          <AiDisclaimer variant="inline" />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  await setDraftStatus(draft.id, "pitched");
                });
              }}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-violet-500/15 px-2 text-[11px] font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50"
            >
              <Send className="size-3" />
              Mark pitched
            </button>
            <form
              action={setDraftLiveUrl.bind(null, draft.id)}
              className="flex items-center gap-1"
            >
              <input
                name="liveUrl"
                defaultValue={draft.liveUrl ?? ""}
                placeholder="paste live URL"
                className="h-7 w-56 rounded-md border border-white/10 bg-card/60 px-2 text-[11px]"
              />
              <button
                type="submit"
                className="inline-flex h-7 items-center gap-1 rounded-md bg-emerald-500/15 px-2 text-[11px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25"
              >
                <CheckCircle2 className="size-3" />
                Mark published
              </button>
            </form>
          </div>
        </div>
      )}
    </li>
  );
}
