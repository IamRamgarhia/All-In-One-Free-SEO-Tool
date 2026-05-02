import { lookupTerm } from "@/lib/glossary";
import { cn } from "@/lib/utils";

type TermProps = {
  /** The term to look up. Defaults to the children text if omitted. */
  term?: string;
  /** Override the auto-resolved definition. */
  definition?: { short: string; why?: string };
  className?: string;
  children: React.ReactNode;
};

/**
 * Wraps a technical term with a hover/focus tooltip explaining it in plain
 * language. CSS-only — no JS required at runtime.
 *
 * Usage:
 *   <Term>canonical</Term>
 *   <Term term="LCP">largest contentful paint</Term>
 *   <Term definition={{ short: "...", why: "..." }}>custom term</Term>
 */
export function Term({ term, definition, className, children }: TermProps) {
  const resolvedTerm =
    term ?? (typeof children === "string" ? children : null);
  const def =
    definition ??
    (resolvedTerm ? lookupTerm(resolvedTerm) : null);

  if (!def) {
    return <span className={className}>{children}</span>;
  }

  return (
    <span
      className={cn(
        "group/term relative inline cursor-help underline decoration-dotted decoration-violet-400/60 underline-offset-[3px] hover:decoration-violet-300",
        className,
      )}
      tabIndex={0}
      role="button"
      aria-label={`Definition: ${def.short}`}
    >
      {children}
      <span
        className="invisible absolute left-1/2 top-full z-50 mt-2 w-72 -translate-x-1/2 rounded-xl border border-white/10 bg-popover/95 p-3 text-left text-xs leading-relaxed text-popover-foreground opacity-0 shadow-2xl shadow-violet-500/10 backdrop-blur-md transition-opacity duration-150 group-hover/term:visible group-hover/term:opacity-100 group-focus/term:visible group-focus/term:opacity-100"
        role="tooltip"
      >
        <span className="block text-foreground/95">{def.short}</span>
        {def.why && (
          <span className="mt-2 block text-muted-foreground">
            <span className="font-medium text-foreground/80">Why it matters: </span>
            {def.why}
          </span>
        )}
      </span>
    </span>
  );
}
