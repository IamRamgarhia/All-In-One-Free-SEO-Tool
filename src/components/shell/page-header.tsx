import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { HelpLink } from "./help-link";

type Crumb = { href?: string; label: string };

type Accent = "violet" | "cyan" | "amber" | "rose" | "emerald" | "fuchsia";

const accentText: Record<Accent, string> = {
  violet: "text-violet-300",
  cyan: "text-cyan-300",
  amber: "text-amber-300",
  rose: "text-rose-300",
  emerald: "text-emerald-300",
  fuchsia: "text-fuchsia-300",
};

type PageHeaderProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  accent?: Accent;
  crumbs?: Crumb[];
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  /** Screens that are themselves an explanation do not need a help link. */
  noHelp?: boolean;
};

export function PageHeader({
  title,
  description,
  icon: Icon,
  accent = "violet",
  crumbs,
  actions,
  meta,
  noHelp,
}: PageHeaderProps) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 space-y-2">
      <div className="min-w-0 space-y-1">
        {crumbs && crumbs.length > 0 && (
          <nav className="flex items-center gap-1 text-xs text-muted-foreground">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && (
                  <ChevronRight className="size-3 text-muted-foreground/50" />
                )}
                {c.href ? (
                  <Link
                    href={c.href}
                    className="transition-colors hover:text-foreground"
                  >
                    {c.label}
                  </Link>
                ) : (
                  <span className="text-foreground">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}

        <div className="flex items-center gap-2">
          {Icon && (
            <Icon className={cn("h-5 w-5 shrink-0", accentText[accent])} />
          )}
          <h1 className="pro-mode-marker text-2xl font-bold tracking-tight text-foreground">
            {title}
          </h1>
        </div>

        {description && (
          <p className="pro-hide-help max-w-3xl text-sm text-muted-foreground">
            {description}
          </p>
        )}

        {meta && <div className="pt-1">{meta}</div>}
      </div>

      {/* Help sits with the actions, on every screen that uses this
          header — which is 195 of them. One link here rather than a
          decision on each page, and it points at the documentation for
          this screen rather than at a table of contents.

          `noHelp` is for the handful of screens that are already an
          explanation: the docs index, the welcome flow, the learn
          section. */}
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        {!noHelp && <HelpLink />}
      </div>
    </section>
  );
}
