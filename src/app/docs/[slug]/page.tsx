import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Clock,
  ExternalLink,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { DOC_GUIDES, guideBySlug } from "@/lib/docs-guides";
import { CostBadge, Note, Steps, routeLabel } from "../doc-parts";

/** Pre-render every guide — there are eight and they never change at runtime. */
export function generateStaticParams() {
  return DOC_GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const guide = guideBySlug((await params).slug);
  if (!guide) return { title: "Not found" };
  return { title: `${guide.title} — docs`, description: guide.summary };
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const guide = guideBySlug((await params).slug);
  if (!guide) notFound();

  const index = DOC_GUIDES.findIndex((g) => g.slug === guide.slug);
  const next = DOC_GUIDES[index + 1] ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/docs"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        All docs
      </Link>

      <PageHeader
        title={guide.title}
        description={guide.summary}
        icon={BookOpen}
        accent="violet"
      />

      <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="size-3.5" />
        About {guide.minutes} minutes · {guide.steps.length} steps
      </p>

      <div className="glass-apple rounded-2xl p-5">
        <Steps steps={guide.steps} />
      </div>

      {guide.note && <Note>{guide.note}</Note>}

      {/* Official docs, listed rather than left to be searched for — the
          setup steps above are ours, but the apps being connected have
          their own, and hunting for the right page is most of the work. */}
      {guide.links && guide.links.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Official documentation</h2>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {guide.links.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-[13px] transition-colors hover:border-white/15"
                >
                  <span className="min-w-0 flex-1 truncate">{l.label}</span>
                  <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Tools this guide actually uses, with their real cost badge. */}
      {guide.related && guide.related.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">What this uses</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {guide.related.map((href) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-sm transition-colors hover:border-white/15"
                >
                  <span className="truncate">{routeLabel(href)}</span>
                  <span className="ml-auto">
                    <CostBadge href={href} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {next && (
        <Link
          href={`/docs/${next.slug}`}
          className="glass-apple lift-on-hover group flex items-center gap-3 rounded-2xl p-4"
        >
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Next
            </p>
            <p className="truncate text-sm font-medium group-hover:text-violet-300">
              {next.title}
            </p>
          </div>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      )}
    </div>
  );
}
