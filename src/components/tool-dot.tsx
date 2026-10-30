import { toolReadiness, type ToolNeed } from "@/lib/tool-readiness";

/**
 * The green / amber dot beside a tool name.
 *
 * Sized deliberately large for what it is. The first version was 6px
 * with no ring and was reported invisible twice, on two different
 * screens, by somebody actively looking for it — a marker nobody can
 * find is the same as no marker, and the markup passing review three
 * times is why "it renders" is not the same as "it is visible".
 *
 * Renders nothing at all when readiness is unknown. See the note in
 * lib/tool-readiness.ts on why silence beats a guess.
 */
export function ToolDot({
  href,
  needs,
  hasAiKey,
  className = "",
}: {
  href: string;
  needs?: ToolNeed | null;
  hasAiKey: boolean;
  /** Positioning only — size and color are fixed so every dot matches. */
  className?: string;
}) {
  const r = toolReadiness({ href, needs, hasAiKey });
  if (r.state === "unknown") return null;

  return (
    <span
      aria-hidden="true"
      title={r.title}
      className={`inline-block size-2.5 shrink-0 rounded-full ring-2 ${
        r.state === "ready"
          ? "bg-emerald-500 ring-emerald-500/25"
          : "bg-amber-500 ring-amber-500/30"
      } ${className}`}
    />
  );
}

/**
 * What the colors mean, in one line.
 *
 * Every panel that shows dots shows this underneath. A colored dot with
 * no key is a puzzle, and the point of the dot was to save the user a
 * click, not add one.
 */
export function ToolDotLegend({
  className = "",
  wrap = true,
}: {
  className?: string;
  /**
   * Allow the two entries to stack when there is no room. True in a
   * narrow rail; false in the top bar, where stacking two lines of 10px
   * text inside a 56px header looks like a rendering fault. A prop
   * rather than an overriding class — `flex-wrap` and `flex-nowrap` set
   * the same property, so which one wins would come down to the order
   * Tailwind happened to emit them in.
   */
  wrap?: boolean;
}) {
  return (
    <p
      className={`flex items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground ${
        wrap ? "flex-wrap" : "flex-nowrap whitespace-nowrap"
      } ${className}`}
    >
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block size-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/25" />
        Ready
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block size-2 rounded-full bg-amber-500 ring-2 ring-amber-500/30" />
        Needs setup
      </span>
    </p>
  );
}
