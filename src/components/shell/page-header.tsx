import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Crumb = { href?: string; label: string };

type Accent = "violet" | "cyan" | "amber" | "rose" | "emerald" | "fuchsia";

const accentMap: Record<Accent, { orb: string; iconBg: string; iconText: string }> = {
  violet: {
    orb: "from-violet-500/30 to-fuchsia-500/15",
    iconBg: "bg-violet-500/15 ring-violet-400/30",
    iconText: "text-violet-300",
  },
  cyan: {
    orb: "from-cyan-500/30 to-sky-500/15",
    iconBg: "bg-cyan-500/15 ring-cyan-400/30",
    iconText: "text-cyan-300",
  },
  amber: {
    orb: "from-amber-500/30 to-orange-500/15",
    iconBg: "bg-amber-500/15 ring-amber-400/30",
    iconText: "text-amber-300",
  },
  rose: {
    orb: "from-rose-500/30 to-pink-500/15",
    iconBg: "bg-rose-500/15 ring-rose-400/30",
    iconText: "text-rose-300",
  },
  emerald: {
    orb: "from-emerald-500/30 to-teal-500/15",
    iconBg: "bg-emerald-500/15 ring-emerald-400/30",
    iconText: "text-emerald-300",
  },
  fuchsia: {
    orb: "from-fuchsia-500/30 to-violet-500/15",
    iconBg: "bg-fuchsia-500/15 ring-fuchsia-400/30",
    iconText: "text-fuchsia-300",
  },
};

type PageHeaderProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  accent?: Accent;
  crumbs?: Crumb[];
  actions?: React.ReactNode;
  meta?: React.ReactNode;
};

export function PageHeader({
  title,
  description,
  icon: Icon,
  accent = "violet",
  crumbs,
  actions,
  meta,
}: PageHeaderProps) {
  const a = accentMap[accent];

  return (
    <section className="glass-apple animate-page-enter relative overflow-hidden rounded-2xl px-6 py-7">
      <div
        className={cn(
          "pointer-events-none absolute -left-20 -top-20 size-72 rounded-full bg-gradient-to-br blur-[100px]",
          a.orb,
        )}
      />
      <div className="pointer-events-none absolute right-0 top-0 size-40 rounded-full bg-cyan-500/12 blur-[80px]" />
      {/* Top inner highlight strip */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-3">
          {crumbs && crumbs.length > 0 && (
            <nav className="flex items-center gap-1 text-xs text-muted-foreground">
              {crumbs.map((c, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && (
                    <ChevronRight className="size-3 text-muted-foreground/60" />
                  )}
                  {c.href ? (
                    <Link
                      href={c.href}
                      className="rounded px-1 py-0.5 transition-colors hover:bg-white/5 hover:text-foreground"
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

          <div className="flex items-center gap-3">
            {Icon && (
              <div
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-xl ring-1",
                  a.iconBg,
                )}
              >
                <Icon className={cn("size-5", a.iconText)} />
              </div>
            )}
            <h1 className="text-[2.1rem] font-semibold leading-[1.1] tracking-tight">
              <span className="text-gradient-brand">{title}</span>
            </h1>
          </div>

          {description && (
            <p className="max-w-2xl text-[1rem] leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}

          {meta && <div className="pt-1">{meta}</div>}
        </div>

        {actions && (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </div>
    </section>
  );
}
