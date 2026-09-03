import Link from "next/link";
import { BookOpen, Clock } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { DOC_GUIDES, GUIDE_GROUPS } from "@/lib/docs-guides";
import {
  TOOL_CAPABILITIES,
  capabilityOf,
  copyOf,
} from "@/lib/tool-capabilities";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  categoryOf,
  isRetired,
  type ToolCategoryId,
} from "@/lib/tool-categories";
import { ToolRow } from "./doc-parts";

export const metadata = {
  title: "Docs — how to use every part of this",
  description:
    "Step-by-step guides and a reference for every tool, with what each one costs to run.",
};

/**
 * Docs home: the guides, then every tool with an anchor.
 *
 * Server-rendered from the same generated capability table the app uses,
 * so a tool cannot appear here with a description or a cost badge that
 * disagrees with its own card.
 */
export default function DocsPage() {
  // Every non-retired tool that has a card, grouped the way the tools
  // page groups them, so the two read the same way.
  const byCategory = new Map<ToolCategoryId, string[]>();
  for (const cap of TOOL_CAPABILITIES) {
    if (!/^\/tools\/[^/]+$/.test(cap.route)) continue;
    if (isRetired(cap.route)) continue;
    if (!copyOf(capabilityOf(cap.route))) continue;
    const cat = categoryOf(cap.route);
    byCategory.set(cat, [...(byCategory.get(cat) ?? []), cap.route]);
  }
  const listed = [...byCategory.values()].flat();
  const documented = listed.length;
  // Counted from the very list rendered below, not from the global
  // totals. Those count retired tools and one with no card, so the
  // banner said "96" directly above a heading that said "87".
  const freeListed = listed.filter(
    (route) => capabilityOf(route)?.needsAI === false,
  ).length;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title="Docs"
        description="Short guides that get you to a result, then every tool with what it costs to run."
        icon={BookOpen}
        accent="violet"
      />

      {/* The one number worth leading with. */}
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4">
        <p className="text-sm leading-relaxed">
          <strong className="font-semibold">
            {freeListed} of the {documented} tools need no AI and no API key.
          </strong>{" "}
          They work the moment the app starts. Everything tagged{" "}
          <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-400/25">
            Free
          </span>{" "}
          below never calls a model, so it cannot cost you anything.
        </p>
      </div>

      {/* ---- Guides ---- */}
      {GUIDE_GROUPS.map((group) => {
        const guides = DOC_GUIDES.filter((g) => g.group === group);
        if (guides.length === 0) return null;
        return (
          <section key={group} className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">{group}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {guides.map((g) => (
                <Link
                  key={g.slug}
                  href={`/docs/${g.slug}`}
                  className="glass-apple lift-on-hover group rounded-2xl p-4 transition-colors"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-sm font-semibold group-hover:text-violet-300">
                      {g.title}
                    </h3>
                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                      <Clock className="size-3" />
                      {g.minutes} min
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                    {g.summary}
                  </p>
                  <p className="mt-2 text-[11px] text-muted-foreground/70">
                    {g.steps.length} steps
                  </p>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      {/* ---- Every tool ---- */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Every tool ({documented})
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Grouped the same way the tools page groups them. Every entry has
            its own link — copy the # next to a name to point someone
            straight at it.
          </p>
        </div>

        {CATEGORY_ORDER.map((cat) => {
          const routes = byCategory.get(cat);
          if (!routes || routes.length === 0) return null;
          const meta = CATEGORY_LABELS[cat];
          return (
            <div key={cat} id={cat} className="scroll-mt-24 space-y-2 pt-2">
              <div>
                <h3 className="text-sm font-semibold">{meta.label}</h3>
                <p className="text-xs text-muted-foreground">
                  {meta.description}
                </p>
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {routes.map((route) => (
                  <ToolRow key={route} route={route} />
                ))}
              </ul>
            </div>
          );
        })}
      </section>
    </div>
  );
}
