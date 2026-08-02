import Link from "next/link";
import { AlertCircle, ArrowRight } from "lucide-react";
import type { AiFailure } from "@/lib/ai-error";

/**
 * Renders why an AI feature produced nothing, plus where to fix it.
 *
 * Before this, every AI failure — no key, retired model, spend cap
 * reached, provider down — rendered as an empty box. Users had no way
 * to tell "you haven't set this up" apart from "it's broken", and the
 * most common cause (a model id the vendor retired) was fixable from a
 * dropdown they had no reason to open.
 */
export function AiFailureNotice({
  failure,
  className = "",
}: {
  failure: AiFailure;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-4 text-sm ${className}`}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-300" />
      <div className="min-w-0 space-y-2">
        <p className="text-amber-100/90">{failure.message}</p>
        {failure.fixHref && (
          <Link
            href={failure.fixHref}
            className="inline-flex items-center gap-1 text-xs font-medium text-amber-200 underline-offset-4 hover:underline"
          >
            Open settings
            <ArrowRight className="size-3" />
          </Link>
        )}
        {/* Provider + model help the user match this to the right row in
            Settings → AI when several providers are configured. */}
        {(failure.provider || failure.model) && (
          <p className="text-[11px] text-amber-200/50">
            {[failure.provider, failure.model].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}
