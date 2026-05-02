"use client";

import { useState } from "react";
import { ArrowLeft, Eye, Monitor, Smartphone } from "lucide-react";
import Link from "next/link";

export default function PixelPreviewPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");

  // Google truncates with ellipsis at ~600px wide. Char counts are
  // approximate but reliable enough for SEO purposes.
  const titleMax = 60;
  const descMax = 160;

  const titleStatus = !title
    ? null
    : title.length <= titleMax
      ? "ok"
      : "over";
  const descStatus = !description
    ? null
    : description.length <= descMax
      ? "ok"
      : "over";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/tools"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" />
        All tools
      </Link>

      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-violet-500/15 ring-1 ring-violet-400/30">
            <Eye className="size-5 text-violet-300" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="text-gradient-brand">Pixel preview</span>
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Type below — see exactly how Google will render the search result on
          mobile and desktop. Length warnings update live.
        </p>
      </header>

      {/* Form */}
      <section className="glass-apple relative overflow-hidden rounded-2xl space-y-4 p-5">
        <Field
          label="Page URL"
          value={url}
          onChange={setUrl}
          placeholder="https://yoursite.com/page"
        />
        <Field
          label="Title tag"
          value={title}
          onChange={setTitle}
          placeholder="Your title here"
          status={titleStatus}
          countLabel={`${title.length}/${titleMax}`}
        />
        <Field
          label="Meta description"
          value={description}
          onChange={setDescription}
          placeholder="Your meta description here"
          multiline
          status={descStatus}
          countLabel={`${description.length}/${descMax}`}
        />
      </section>

      {/* Previews */}
      <div className="grid gap-4 lg:grid-cols-2">
        <PreviewCard mode="desktop" url={url} title={title} desc={description} />
        <PreviewCard mode="mobile" url={url} title={title} desc={description} />
      </div>

      {/* Tips */}
      <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
        <h2 className="text-base font-semibold">Best practices</h2>
        <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
          <li>· Title tag ≤ 60 characters, primary keyword near the front, brand at the end</li>
          <li>· Meta description ≤ 160 characters with a value prop + soft CTA</li>
          <li>· Don&apos;t pad with keyword variations — write for click-through</li>
          <li>· Each page needs a unique title + description; duplicates hurt</li>
        </ul>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  status,
  countLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  status?: "ok" | "over" | null;
  countLabel?: string;
}) {
  const ringCls =
    status === "over"
      ? "border-rose-500/40"
      : status === "ok"
        ? "border-emerald-500/30"
        : "border-input";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[14px] font-medium">{label}</label>
        {countLabel && (
          <span
            className={`text-[11px] tabular-nums ${
              status === "over"
                ? "text-rose-300"
                : status === "ok"
                  ? "text-emerald-300"
                  : "text-muted-foreground"
            }`}
          >
            {countLabel}
          </span>
        )}
      </div>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className={`flex w-full rounded-md border bg-background px-3 py-2 text-[15px] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${ringCls}`}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`flex h-10 w-full rounded-md border bg-background px-3 text-[15px] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${ringCls}`}
        />
      )}
    </div>
  );
}

function PreviewCard({
  mode,
  url,
  title,
  desc,
}: {
  mode: "desktop" | "mobile";
  url: string;
  title: string;
  desc: string;
}) {
  const breadcrumb = (() => {
    if (!url) return "yoursite.com › path";
    try {
      const u = new URL(url);
      const parts = u.pathname.split("/").filter(Boolean);
      return [u.hostname.replace(/^www\./, ""), ...parts].join(" › ");
    } catch {
      return url;
    }
  })();

  // Google's actual SERP truncation isn't pure char count — it's pixel width,
  // which varies by font. Approximations:
  // Desktop title ≈ 580px (~60 chars); mobile ≈ 65 chars
  // Description ≈ 155–160 chars on both
  const titleLimit = mode === "mobile" ? 65 : 60;
  const descLimit = 158;

  const truncatedTitle =
    title.length > titleLimit ? title.slice(0, titleLimit - 1) + "…" : title;
  const truncatedDesc =
    desc.length > descLimit ? desc.slice(0, descLimit - 1) + "…" : desc;

  return (
    <div className="glass-apple relative overflow-hidden rounded-2xl">
      <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {mode === "desktop" ? (
            <Monitor className="size-3.5" />
          ) : (
            <Smartphone className="size-3.5" />
          )}
          {mode}
        </div>
      </header>
      <div className="p-5">
        <div className="rounded-lg bg-white p-4 text-[#202124] dark:bg-[#202124] dark:text-[#e8eaed]">
          <div className="text-[12px] leading-tight text-[#202124]/70 dark:text-[#9aa0a6]">
            {breadcrumb}
          </div>
          <div
            className={`mt-1 cursor-pointer font-medium hover:underline ${
              mode === "mobile" ? "text-[18px]" : "text-[20px]"
            } leading-tight text-[#1a0dab] dark:text-[#8ab4f8]`}
          >
            {truncatedTitle || "Your title appears here"}
          </div>
          <div
            className={`mt-1 ${
              mode === "mobile" ? "text-[14px]" : "text-[14px]"
            } leading-snug text-[#4d5156] dark:text-[#bdc1c6]`}
          >
            {truncatedDesc || "Your meta description appears here. It influences click-through rate, not rankings directly."}
          </div>
        </div>
      </div>
    </div>
  );
}
