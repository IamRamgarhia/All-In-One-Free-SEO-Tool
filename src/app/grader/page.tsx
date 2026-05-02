import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { GraderForm } from "./grader-form";

export const dynamic = "force-dynamic";

export default function GraderPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Instant audit"
        description="Drop any URL — we'll fetch it, run 19 checks, and grade it in 10 seconds. No client setup required."
        icon={Sparkles}
        accent="fuchsia"
      />

      <GraderForm />

      {/* What we check */}
      <section className="grid gap-3 sm:grid-cols-3">
        <Capsule
          tone="violet"
          title="On-page SEO"
          items={[
            "Title length",
            "Meta description",
            "H1 + heading hierarchy",
            "Canonical link",
            "Viewport tag",
            "OpenGraph tags",
          ]}
        />
        <Capsule
          tone="cyan"
          title="Technical health"
          items={[
            "HTTPS",
            "Server response time",
            "JSON-LD schema",
            "robots.txt + sitemap",
            "Security headers",
          ]}
        />
        <Capsule
          tone="amber"
          title="Content & images"
          items={[
            "Word count",
            "Image alt text",
            "Lazy loading",
            "Modern formats (WebP/AVIF)",
            "Lang attribute",
          ]}
        />
      </section>
    </div>
  );
}

function Capsule({
  tone,
  title,
  items,
}: {
  tone: "violet" | "cyan" | "amber";
  title: string;
  items: string[];
}) {
  const accent = {
    violet: "from-violet-500/15",
    cyan: "from-cyan-500/15",
    amber: "from-amber-500/15",
  }[tone];
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/5 bg-card/40 p-4 backdrop-blur-md">
      <div
        className={`pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-gradient-to-br ${accent} to-transparent blur-3xl`}
      />
      <div className="relative">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </div>
        <ul className="mt-2 space-y-1 text-xs text-foreground/85">
          {items.map((it) => (
            <li key={it} className="flex items-start gap-1.5">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-foreground/40" />
              {it}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
