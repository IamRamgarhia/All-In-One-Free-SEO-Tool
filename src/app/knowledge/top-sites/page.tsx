export const dynamic = "force-static";

import {
  BookOpen,
  CheckCircle2,
  GraduationCap,
  Link2,
  Sparkles,
  Star,
  Target,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";

export default function TopSitesGuidePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title="Why Backlinko / RankMath / Search Engine Journal rank #1"
        description="Reverse-engineered playbook of the three sites that consistently dominate SEO SERPs. Every rule below is something at least two of the three actively practice. Use it as a checklist for your own content."
        icon={GraduationCap}
        accent="violet"
      />

      <Section
        id="content-depth"
        icon={BookOpen}
        title="Content depth + originality"
        accent="emerald"
      >
        <p>
          The single most consistent pattern: every top-ranking page is
          significantly more comprehensive than 90% of its SERP competitors.
        </p>
        <Rule>
          <strong>Pillar guides run 3,000-8,000 words.</strong> Backlinko&apos;s
          &quot;Skyscraper Technique&quot; ran ~3,000 words; their &quot;200
          Ranking Factors&quot; piece runs ~6,000. Length follows topic — but
          every flagship piece is the most thorough page on the SERP.
        </Rule>
        <Rule>
          <strong>Original data, not aggregated takes.</strong> Backlinko
          publishes its own studies (analyzed millions of search results,
          surveyed thousands of marketers). Search Engine Journal commissions
          industry surveys. RankMath publishes raw plugin telemetry. Original
          research = backlinks = rankings.
        </Rule>
        <Rule>
          <strong>Real screenshots, real examples, real numbers.</strong>{" "}
          Stock photos add nothing. Every Backlinko post includes annotated
          GSC screenshots, real SERP captures, real client traffic charts.
        </Rule>
        <Rule>
          <strong>Name your frameworks.</strong> The Skyscraper Technique,
          The Reverse Outreach Method, The Content Hub Model. Naming a
          framework makes it citable, linkable, memorable. 23,400+ backlinks
          to Skyscraper post — directly because it&apos;s named.
        </Rule>
      </Section>

      <Section id="topical-authority" icon={Target} title="Topical authority over keyword chasing" accent="cyan">
        <Rule>
          <strong>Hub-and-spoke architecture.</strong> All three sites organize
          content into clusters: 1 pillar guide + 15-30 spoke posts that
          interlink. They never publish one-off articles on unrelated topics.
        </Rule>
        <Rule>
          <strong>Cover the full topic before moving on.</strong> Search
          Engine Journal won&apos;t publish on a new niche until they&apos;ve
          covered the head term, every PAA question, every adjacent
          comparison, and every common how-to. Then they go deeper, not
          wider.
        </Rule>
        <Rule>
          <strong>Internal linking density.</strong> 5-15 contextual internal
          links per article, with descriptive anchors. The pillar links to
          every spoke; spokes link back to the pillar AND to peer spokes
          where it makes sense.
        </Rule>
        <Rule>
          <strong>Topic over keyword.</strong> SEJ explicitly de-prioritizes
          starting from keyword volume. They start from &quot;what topic
          should an authority on this niche own?&quot; — and then mine the
          keyword data for the cluster.
        </Rule>
      </Section>

      <Section id="format-match" icon={Sparkles} title="Format-match the SERP" accent="amber">
        <Rule>
          <strong>Pick the format the SERP demands.</strong> If top 5 are
          listicles, write a listicle. If they&apos;re definition pages,
          write a definition page. Format mismatch loses 100% of the time —
          users (and Google) want what dominates the page already.
        </Rule>
        <Rule>
          <strong>Featured-snippet shape on at least one section.</strong>{" "}
          Every Backlinko post has at least one H2-as-question with a 40-60
          word direct answer immediately after. That picks up paragraph
          snippets ~30% of the time.
        </Rule>
        <Rule>
          <strong>Listicles use real ordered lists with H2s, not bullet
          dumps.</strong> Each list item is its own H2/H3, with a brief
          intro, criteria explanation, and verdict. Snippet-eligible.
        </Rule>
        <Rule>
          <strong>TOC at the top of long pieces.</strong> Anchor links to
          every H2 — Google sometimes uses these as sitelinks for the
          article in the SERP.
        </Rule>
      </Section>

      <Section id="eeat" icon={Star} title="E-E-A-T signals (the visible kind)" accent="emerald">
        <Rule>
          <strong>Author byline, every post, every time.</strong> Real name,
          real photo, real /author/&lt;slug&gt; page with credentials.
          Brian Dean&apos;s name is on every Backlinko post. RankMath posts
          have specific contributor names, never &quot;RankMath Team&quot;.
        </Rule>
        <Rule>
          <strong>Author bio with topic-specific credentials.</strong>{" "}
          &quot;Brian Dean is the founder of Exploding Topics. Brian
          previously founded Backlinko, which he sold to Semrush in 2022.&quot;
          Specific. Verifiable. Not &quot;digital marketing enthusiast&quot;.
        </Rule>
        <Rule>
          <strong>Last-updated date on every post.</strong> Visible at the
          top, plus structured data{" "}
          <code className="rounded bg-white/5 px-1 py-0.5">dateModified</code>.
          Update old posts every 90-180 days and bump the date.
        </Rule>
        <Rule>
          <strong>Citations to authoritative sources.</strong> 5-15 outbound
          links per article — to Google docs, academic studies, news, .gov /
          .edu sources. Don&apos;t fear &quot;leaking link equity.&quot; Well-cited
          content ranks better.
        </Rule>
        <Rule>
          <strong>Reviewer / fact-checker line on YMYL.</strong> &quot;Reviewed
          by Dr. X&quot; for medical, legal, financial content. Search Engine
          Journal does this on every algorithm-update post.
        </Rule>
      </Section>

      <Section id="link-magnets" icon={Link2} title="Earn the backlinks that earn the rankings" accent="violet">
        <Rule>
          <strong>Publish at least one link-magnet per quarter.</strong> A
          data study, an industry survey, a glossary, a free tool. These
          earn the &quot;passive&quot; backlinks that compound over years.
        </Rule>
        <Rule>
          <strong>Promote on launch.</strong> Every Backlinko data study gets
          a personal-email blast to 100+ relevant journalists / bloggers
          before it goes live. The first 30 days of links determine the next
          5 years of rankings.
        </Rule>
        <Rule>
          <strong>Use HARO / Qwoted / Help-A-B2B-Writer daily.</strong> 15
          minutes per day = 2-3 high-tier links per month consistently.
          Compound over a year and it&apos;s 30+ links from outlets you
          can&apos;t outreach to cold.
        </Rule>
        <Rule>
          <strong>Don&apos;t buy links.</strong> Don&apos;t do PBNs. Don&apos;t
          bulk submit to directories. Every top SEO blog explicitly warns
          against these — and Google&apos;s 2024 spam updates cleaned out
          most sites doing them.
        </Rule>
      </Section>

      <Section id="technical" icon={CheckCircle2} title="Technical baseline (non-negotiable)" accent="cyan">
        <Rule>
          <strong>Core Web Vitals all-green on mobile.</strong> All three
          sites pass LCP &lt;2.5s, INP &lt;200ms, CLS &lt;0.1 on mobile. Run{" "}
          <a href="/tools/local-cwv" className="text-violet-300 hover:underline">
            /tools/local-cwv
          </a>{" "}
          on your money pages monthly.
        </Rule>
        <Rule>
          <strong>HTTPS everywhere, HSTS, modern TLS.</strong> No mixed
          content. No expired certs. Bare minimum.
        </Rule>
        <Rule>
          <strong>Schema on every page that supports it.</strong> Article on
          posts, Person on author pages, Organization on home, BreadcrumbList
          everywhere. Validate via{" "}
          <a href="/tools/schema-validate" className="text-violet-300 hover:underline">
            /tools/schema-validate
          </a>
          .
        </Rule>
        <Rule>
          <strong>Internal site search the way Google would.</strong> Run a
          site:yourdomain.com query. Surface results that should be deindexed
          (thin pages, duplicate categories, parameter URLs). Clean those up.
        </Rule>
        <Rule>
          <strong>XML sitemap, robots.txt, structured monitor.</strong> All
          fresh, all submitted to GSC + Bing Webmaster. Snapshot robots.txt
          regularly via{" "}
          <a href="/tools/robots-history" className="text-violet-300 hover:underline">
            /tools/robots-history
          </a>{" "}
          so you catch accidental Disallow: /.
        </Rule>
      </Section>

      <Section id="cadence" icon={TrendingUp} title="Publishing + maintenance cadence" accent="rose">
        <Rule>
          <strong>Publish weekly minimum. Refresh continuously.</strong>{" "}
          Backlinko publishes ~1 deeply-researched piece per week. SEJ
          publishes daily, but also refreshes 5+ posts per week with new
          data. Updating dates + reflecting current best practices is
          ongoing work, not a one-off.
        </Rule>
        <Rule>
          <strong>Dedicated content-refresh budget.</strong> 30-40% of
          editorial time goes to refreshing existing content, not new
          publishing. Use{" "}
          <a href="/tools/refresh" className="text-violet-300 hover:underline">
            /tools/refresh
          </a>{" "}
          to find decay candidates.
        </Rule>
        <Rule>
          <strong>Track rankings + traffic per piece, not in aggregate.</strong>{" "}
          Each post has a clear primary keyword. They monitor it weekly. If
          a flagship piece drops below the SERP-leader, they refresh within
          7 days.
        </Rule>
      </Section>

      <Section id="ux" icon={Sparkles} title="UX + conversion (it all feeds rankings)" accent="amber">
        <Rule>
          <strong>One CTA per article.</strong> Backlinko: email signup.
          RankMath: install plugin. SEJ: newsletter. Three CTAs per post = 0
          conversions.
        </Rule>
        <Rule>
          <strong>Above-the-fold hook.</strong> The first 100 words must
          give the reader a reason to scroll. Skip throat-clearing.
          Backlinko famously opens posts with a benefit + proof number.
        </Rule>
        <Rule>
          <strong>Scannable formatting.</strong> Short paragraphs (≤4
          lines), descriptive subheadings, bullet lists, bold key claims,
          callout boxes for tips. No 200-word walls of text.
        </Rule>
        <Rule>
          <strong>Mobile-first design.</strong> Test the post on a 375px
          screen. If it feels cramped, ship a mobile fix before publishing.
        </Rule>
      </Section>

      <Section id="ai-aware" icon={Sparkles} title="2026 reality: AI search visibility" accent="violet">
        <p>
          Backlinko, RankMath, and SEJ are all visible in AI Overviews,
          ChatGPT Search, and Perplexity citations. Why:
        </p>
        <Rule>
          <strong>Citation-worthy structure.</strong> Each post has clear
          factual claims with citations. LLMs cite content where the source
          is unambiguous and the claim is specific.
        </Rule>
        <Rule>
          <strong>Strong brand entity.</strong> Every author has a Wikidata
          entry; the brand has Organization schema with sameAs links;
          they&apos;re mentioned consistently across the web. LLMs ingest
          entities, not URLs.
        </Rule>
        <Rule>
          <strong>Reddit + niche-forum presence.</strong> Reddit appears in
          ~40% of LLM citations. SEJ writers actively answer questions on
          Reddit / r/SEO under personal accounts. Not link spam — real
          answers.
        </Rule>
        <Rule>
          <strong>llms.txt published + AI bots allowed.</strong> They want
          the citations, so GPTBot / ClaudeBot / PerplexityBot / OAI-SearchBot
          / Google-Extended are all allowed in robots.txt.
        </Rule>
      </Section>

      <Section id="anti-patterns" icon={Star} title="What they DON'T do (and you shouldn't either)" accent="rose">
        <Rule>
          <strong>No keyword density tuning.</strong> Google said years ago
          this isn&apos;t a thing. Don&apos;t target 2.5%.
        </Rule>
        <Rule>
          <strong>No exact-match domains, no exact-match URL slugs.</strong>{" "}
          Slugs are descriptive, not stuffed.
        </Rule>
        <Rule>
          <strong>No PBNs, no link buying, no comment-spam outreach.</strong>
        </Rule>
        <Rule>
          <strong>No AI-generated content without human editing.</strong>{" "}
          Search Engine Land published a study showing human-edited content
          ranks 8× more often than pure AI output.
        </Rule>
        <Rule>
          <strong>No FAQ schema on commercial pages.</strong> Google rolled
          back FAQ rich results for non-authoritative sites in 2023. Use it
          only on .gov / health / authoritative-content pages.
        </Rule>
        <Rule>
          <strong>No AMP.</strong> Officially deprecated. Ditching AMP made
          most large publishers&apos; pages faster, not slower.
        </Rule>
      </Section>

      <section className="glass-apple rounded-2xl p-5 space-y-2">
        <h3 className="text-sm font-semibold">In one sentence</h3>
        <p className="text-sm text-muted-foreground">
          Pick a topic you can credibly own, plan the full hub-and-spoke
          cluster up front, write the most useful page on the SERP for each
          spoke, name your frameworks, cite generously, refresh
          continuously, and never take an SEO shortcut that violates
          Google&apos;s spam policies. Everything else is implementation
          detail.
        </p>
      </section>
    </div>
  );
}

function Section({
  id,
  icon: Icon,
  title,
  children,
  accent = "violet",
}: {
  id: string;
  icon: typeof Sparkles;
  title: string;
  children: React.ReactNode;
  accent?: "violet" | "cyan" | "emerald" | "amber" | "rose";
}) {
  const tones: Record<string, string> = {
    violet: "text-violet-300",
    cyan: "text-cyan-300",
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    rose: "text-rose-300",
  };
  return (
    <section
      id={id}
      className="glass-apple relative overflow-hidden scroll-mt-24 rounded-2xl"
    >
      <header className="border-b border-white/[0.06] px-5 py-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Icon className={`size-5 ${tones[accent]}`} />
          {title}
        </h2>
      </header>
      <div className="space-y-3 px-5 py-5 text-sm leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function Rule({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg bg-white/[0.02] p-3 ring-1 ring-inset ring-white/5">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" />
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
