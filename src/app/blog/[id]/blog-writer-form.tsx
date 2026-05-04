"use client";

import { useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Download,
  Loader2,
  Save,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  checkBlogPlagiarism,
  generateBlogPost,
  saveBlogDraft,
} from "./actions";
import { AiFeedback } from "@/components/ai-feedback";

type Suggestion = {
  source: "quick_win" | "niche";
  title: string;
  targetKeyword: string;
  rationale: string;
};

export function BlogWriterForm({
  clientId,
  clientName,
  suggestions,
}: {
  clientId: number;
  clientName: string;
  suggestions: Suggestion[];
}) {
  const [targetKeyword, setTargetKeyword] = useState("");
  const [supportingKeywords, setSupportingKeywords] = useState("");
  const [notes, setNotes] = useState("");
  const [tone, setTone] = useState<"professional" | "casual" | "authoritative" | "friendly">("professional");
  const [audienceLevel, setAudienceLevel] =
    useState<"beginner" | "intermediate" | "expert">("intermediate");
  const [wordCount, setWordCount] = useState<800 | 1200 | 1500 | 2000>(1200);

  const [pending, startTransition] = useTransition();
  const [savePending, startSave] = useTransition();
  const [plagiarismPending, startPlagiarism] = useTransition();
  const [result, setResult] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [markdown, setMarkdown] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [plagiarism, setPlagiarism] = useState<
    | null
    | { status: "running" }
    | {
        status: "ok";
        aiLikelihood: number;
        originalityScore: number;
        verdict: string;
        flags: { snippet: string; reason: string }[];
      }
    | { status: "error"; error: string }
  >(null);

  function pick(s: Suggestion) {
    setTargetKeyword(s.targetKeyword);
    setNotes(`Suggested angle: ${s.title}\n\n${s.rationale}`);
    // Scroll to top of form for clarity
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function generate() {
    if (!targetKeyword.trim()) {
      setResult({ tone: "error", text: "Enter a target keyword first." });
      return;
    }
    setResult(null);
    setMarkdown("");
    startTransition(async () => {
      const r = await generateBlogPost({
        clientId,
        targetKeyword,
        supportingKeywords,
        tone,
        audienceLevel,
        wordCount,
        notes,
      });
      if (!r.ok) {
        setResult({ tone: "error", text: r.error });
        return;
      }
      setMarkdown(r.markdown);
      setResult({
        tone: "success",
        text: "Draft ready. Review, edit, save, or copy.",
      });
    });
  }

  function copyMd() {
    if (!markdown) return;
    navigator.clipboard.writeText(markdown).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function downloadMd() {
    if (!markdown) return;
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const slug = targetKeyword
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50);
    a.href = url;
    a.download = `${slug || "blog-post"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function saveDraft() {
    if (!markdown.trim()) return;
    startSave(async () => {
      const r = await saveBlogDraft({
        clientId,
        targetKeyword,
        markdown,
      });
      if (r.ok && r.id) {
        setSavedId(r.id);
      } else {
        setResult({
          tone: "error",
          text: r.error ?? "Save failed.",
        });
      }
    });
  }

  function runPlagiarismCheck() {
    if (!markdown.trim()) return;
    setPlagiarism({ status: "running" });
    startPlagiarism(async () => {
      const r = await checkBlogPlagiarism({ clientId, markdown });
      if (r.ok) {
        setPlagiarism({
          status: "ok",
          aiLikelihood: r.aiLikelihood,
          originalityScore: r.originalityScore,
          verdict: r.verdict,
          flags: r.flags,
        });
      } else {
        setPlagiarism({ status: "error", error: r.error });
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Suggestions */}
      {suggestions.length > 0 && (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <header className="border-b border-white/[0.06] px-5 py-4">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Sparkles className="size-4 text-violet-300" />
              Topic suggestions for {clientName}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Click any suggestion to fill the form below. The first batch is
              from real Search Console data when available.
            </p>
          </header>
          <ul className="divide-y divide-white/[0.04]">
            {suggestions.map((s, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => pick(s)}
                  className="group flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-white/[0.03]"
                >
                  <span
                    className={`mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${
                      s.source === "quick_win"
                        ? "bg-amber-500/10 text-amber-300 ring-amber-500/30"
                        : "bg-violet-500/10 text-violet-300 ring-violet-500/30"
                    }`}
                  >
                    {s.source === "quick_win" ? "QW" : "Tpl"}
                  </span>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="font-medium">{s.title}</div>
                    <div className="text-xs text-muted-foreground">
                      Target keyword: <code className="rounded bg-white/5 px-1 py-0.5">{s.targetKeyword}</code>
                    </div>
                    <div className="text-[11px] text-muted-foreground/80">
                      {s.rationale}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Form */}
      <section className="glass-apple relative overflow-hidden rounded-2xl">
        <header className="border-b border-white/[0.06] px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Wand2 className="size-4 text-violet-300" />
            Brief
          </h2>
        </header>
        <div className="space-y-4 p-5">
          <div className="space-y-1.5">
            <Label htmlFor="targetKeyword">Target keyword *</Label>
            <Input
              id="targetKeyword"
              value={targetKeyword}
              onChange={(e) => setTargetKeyword(e.target.value)}
              placeholder="best espresso machines under 500"
            />
            <p className="text-[11px] text-muted-foreground/80">
              The single phrase you want this post to rank for. Used in H1, intro, and naturally throughout.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="supportingKeywords">
              Supporting keywords (optional)
            </Label>
            <Input
              id="supportingKeywords"
              value={supportingKeywords}
              onChange={(e) => setSupportingKeywords(e.target.value)}
              placeholder="home espresso machine, semi-automatic espresso"
            />
            <p className="text-[11px] text-muted-foreground/80">
              Comma-separated. Each will be woven in once.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="tone">Tone</Label>
              <select
                id="tone"
                value={tone}
                onChange={(e) =>
                  setTone(e.target.value as typeof tone)
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-[14px] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="professional">Professional</option>
                <option value="casual">Casual</option>
                <option value="authoritative">Authoritative</option>
                <option value="friendly">Friendly</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audienceLevel">Audience</Label>
              <select
                id="audienceLevel"
                value={audienceLevel}
                onChange={(e) =>
                  setAudienceLevel(e.target.value as typeof audienceLevel)
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-[14px] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="expert">Expert</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wordCount">Length</Label>
              <select
                id="wordCount"
                value={wordCount}
                onChange={(e) =>
                  setWordCount(Number(e.target.value) as typeof wordCount)
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-[14px] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value={800}>~800 words (short)</option>
                <option value={1200}>~1200 words (standard)</option>
                <option value={1500}>~1500 words (long)</option>
                <option value={2000}>~2000 words (definitive)</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Specific instructions (optional)</Label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="e.g. focus on home users (not commercial). Include a comparison table. Don't recommend competitors X or Y."
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-[15px] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button onClick={generate} disabled={pending || !targetKeyword.trim()}>
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Writing… (~30-60s)
                </>
              ) : (
                <>
                  <Wand2 className="size-4" />
                  Write blog post
                </>
              )}
            </Button>
            {result?.tone === "error" && (
              <span className="inline-flex items-center gap-1 text-xs text-rose-300">
                <AlertCircle className="size-3.5" />
                {result.text}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Result */}
      {markdown && (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <CheckCircle2 className="size-4 text-emerald-300" />
                Draft
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Edit inline if needed. Save as a draft, copy markdown, or
                download as a file.
              </p>
              <div className="mt-2">
                <AiFeedback
                  feature="blog_draft"
                  aiOutput={markdown}
                  clientId={clientId}
                  size="sm"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={copyMd}
              >
                <Copy className="size-3.5" />
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={downloadMd}
              >
                <Download className="size-3.5" />
                Download .md
              </Button>
              <Button
                type="button"
                onClick={runPlagiarismCheck}
                size="sm"
                variant="outline"
                disabled={plagiarismPending || !markdown.trim()}
                title="Check AI-likelihood + originality before publishing"
              >
                {plagiarismPending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Checking…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-3.5" />
                    Plagiarism check
                  </>
                )}
              </Button>
              <Button
                type="button"
                onClick={saveDraft}
                size="sm"
                disabled={savePending || !markdown.trim()}
              >
                {savePending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save className="size-3.5" />
                    Save as draft
                  </>
                )}
              </Button>
            </div>
          </header>

          {plagiarism && plagiarism.status === "ok" && (
            <div className="border-b border-white/[0.06] px-5 py-3">
              <div className="flex flex-wrap gap-3 text-xs">
                <span className="rounded-md bg-white/5 px-2 py-1 ring-1 ring-inset ring-white/10">
                  AI-likelihood:{" "}
                  <strong
                    className={
                      plagiarism.aiLikelihood >= 70
                        ? "text-rose-300"
                        : plagiarism.aiLikelihood >= 40
                          ? "text-amber-300"
                          : "text-emerald-300"
                    }
                  >
                    {plagiarism.aiLikelihood}/100
                  </strong>
                </span>
                <span className="rounded-md bg-white/5 px-2 py-1 ring-1 ring-inset ring-white/10">
                  Originality:{" "}
                  <strong
                    className={
                      plagiarism.originalityScore >= 70
                        ? "text-emerald-300"
                        : plagiarism.originalityScore >= 40
                          ? "text-amber-300"
                          : "text-rose-300"
                    }
                  >
                    {plagiarism.originalityScore}/100
                  </strong>
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {plagiarism.verdict}
              </p>
              {plagiarism.flags.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                  {plagiarism.flags.slice(0, 5).map((f, i) => (
                    <li key={i}>
                      <span className="text-amber-300">⚑</span> &quot;
                      {f.snippet.slice(0, 100)}&quot; — {f.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {plagiarism && plagiarism.status === "error" && (
            <div className="border-b border-white/[0.06] px-5 py-2 text-xs text-rose-300">
              {plagiarism.error}
            </div>
          )}
          <div className="p-5">
            {savedId && (
              <div className="mb-3 inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300 ring-1 ring-emerald-500/30">
                <CheckCircle2 className="size-3" />
                Saved as content brief #{savedId}
              </div>
            )}
            <textarea
              value={markdown}
              onChange={(e) => {
                setMarkdown(e.target.value);
                setSavedId(null);
              }}
              rows={28}
              spellCheck={true}
              className="w-full rounded-md border border-white/10 bg-black/30 p-4 font-mono text-[13px] leading-relaxed text-foreground/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </section>
      )}
    </div>
  );
}
