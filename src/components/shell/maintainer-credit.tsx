"use client";

import { useState } from "react";
import { Code2, Heart, Sparkles, Wallet, X } from "lucide-react";
import { MAINTAINER } from "@/lib/maintainer";
import { UpiPanel } from "@/components/support/upi-panel";

/**
 * Quiet "Built by" credit shown in app chrome. Two presentations:
 *   - inline: a single line, links to GitHub + opens support dialog
 *   - block:  a 3-line block with tagline, suitable for /about
 *
 * The Support button opens a modal with UPI (INR, with QR + presets)
 * + PayPal (international, cards / bank / balance).
 */
export function MaintainerCredit({
  variant = "inline",
}: {
  variant?: "inline" | "block";
}) {
  const [supportOpen, setSupportOpen] = useState(false);

  if (variant === "block") {
    return (
      <>
        <div className="space-y-2 rounded-xl border border-white/[0.06] bg-card/40 p-5">
          <div className="flex items-center gap-2 text-sm">
            <Sparkles className="size-3.5 text-violet-300" />
            <span className="font-semibold">{MAINTAINER.name}</span>
            <span className="text-muted-foreground">
              built this tool
            </span>
          </div>
          {MAINTAINER.tagline && (
            <p className="text-xs text-muted-foreground">
              {MAINTAINER.tagline}
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-1.5">
            {MAINTAINER.github && (
              <a
                href={MAINTAINER.github}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-white/[0.04] px-3 text-xs text-foreground/85 ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/[0.08]"
              >
                <Code2 className="size-3.5" />
                Source on GitHub
              </a>
            )}
            <button
              type="button"
              onClick={() => setSupportOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-rose-500/15 px-3 text-xs font-medium text-rose-300 ring-1 ring-inset ring-rose-500/30 transition-colors hover:bg-rose-500/25"
            >
              <Heart className="size-3.5" />
              Support the project
            </button>
          </div>
        </div>
        {supportOpen && (
          <SupportDialog onClose={() => setSupportOpen(false)} />
        )}
      </>
    );
  }

  // inline variant
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span>
          Built by{" "}
          <span className="font-semibold text-foreground/85">
            {MAINTAINER.name}
          </span>
        </span>
        {MAINTAINER.github && (
          <a
            href={MAINTAINER.github}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
          >
            <Code2 className="size-3" />
            Source
          </a>
        )}
        <button
          type="button"
          onClick={() => setSupportOpen(true)}
          className="inline-flex items-center gap-1 rounded text-rose-300 transition-colors hover:text-rose-200"
        >
          <Heart className="size-3" />
          Support
        </button>
      </div>
      {supportOpen && (
        <SupportDialog onClose={() => setSupportOpen(false)} />
      )}
    </>
  );
}

function SupportDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Support the project"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-card shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-md bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-500/30">
              <Heart className="size-3.5" />
            </span>
            <h2 className="text-sm font-semibold">
              Support {MAINTAINER.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </header>

        <div className="space-y-4 p-5">
          <p className="text-xs text-muted-foreground">
            This tool is free and self-hosted. A small tip keeps the
            updates coming. Pick an amount and scan with any UPI app —
            GPay, PhonePe, Paytm, BHIM.
          </p>

          <UpiPanel />

          {MAINTAINER.paypal && (
            <section className="rounded-xl border border-sky-500/30 bg-sky-500/[0.04] p-4">
              <div className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-md bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-500/30">
                  <Wallet className="size-3.5" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold">PayPal</h3>
                  <p className="text-[10px] text-muted-foreground">
                    International · cards / PayPal balance / bank
                  </p>
                </div>
              </div>
              <a
                href={MAINTAINER.paypal}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-md bg-sky-500/15 px-3 text-xs font-medium text-sky-300 ring-1 ring-inset ring-sky-500/30 hover:bg-sky-500/25"
              >
                Donate via PayPal →
              </a>
            </section>
          )}

          {MAINTAINER.github && (
            <p className="rounded-md bg-white/[0.02] px-3 py-2 text-[11px] text-muted-foreground ring-1 ring-inset ring-white/5">
              Prefer not to send money? A{" "}
              <a
                href={MAINTAINER.github}
                target="_blank"
                rel="noreferrer noopener"
                className="text-violet-300 hover:underline"
              >
                ⭐ on GitHub
              </a>{" "}
              helps too — surfaces the project to other agencies looking
              for a self-hosted SEO tool.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
