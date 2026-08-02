import Link from "next/link";
import { ArrowRight, Plug } from "lucide-react";
import { integrationById } from "@/lib/integrations";

/**
 * "This needs X — here's how, and here's what you're missing without it."
 *
 * Shown at the point of need rather than only on a settings page,
 * because that's where someone actually notices the gap: staring at an
 * empty backlinks table, not while browsing settings.
 *
 * Reads from the integrations catalog so the wording, the time estimate
 * and the destination stay correct in one place. The version of this
 * message I hand-wrote on the backlink import told people to add their
 * Bing key "in Settings" — where it isn't — which is exactly what a
 * shared definition prevents.
 */
export function NeedsConnection({
  id,
  /** Optional override for what's blocked, in this specific context. */
  because,
  compact,
}: {
  id: string;
  because?: string;
  compact?: boolean;
}) {
  const integration = integrationById(id);
  if (!integration) return null;

  if (compact) {
    return (
      <p className="text-xs text-muted-foreground">
        {because ?? integration.withoutIt}{" "}
        <Link
          href={`/connect#${integration.id}`}
          className="font-medium text-foreground underline underline-offset-2"
        >
          Connect {integration.label} ({integration.minutes} min, free)
        </Link>
      </p>
    );
  }

  return (
    <div className="rounded-lg bg-violet-500/[0.08] px-3 py-2.5 ring-1 ring-inset ring-violet-500/20">
      <p className="flex items-start gap-2 text-xs">
        <Plug className="mt-0.5 size-3.5 shrink-0 text-violet-300" />
        <span>
          <span className="font-medium">
            {because ?? `This works better with ${integration.label}.`}
          </span>{" "}
          <span className="text-muted-foreground">
            {integration.whatYouGet[0]}. Takes about {integration.minutes}{" "}
            minute{integration.minutes === 1 ? "" : "s"} and it&apos;s free.
          </span>
        </span>
      </p>
      <Link
        href={`/connect#${integration.id}`}
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2"
      >
        Show me how
        <ArrowRight className="size-3" />
      </Link>
    </div>
  );
}
