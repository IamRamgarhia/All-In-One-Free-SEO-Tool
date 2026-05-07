export const dynamic = "force-static";

import {
  BookOpen,
  Building,
  Compass,
  FileText,
  Gauge,
  Globe,
  Layers,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";

export default function KnowledgeHubPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title="SEO knowledge hub"
        description="The rules that compound. What Google's actually rewarding in 2026, the way the top-ranking sites (Backlinko, Yoast, Ahrefs blog, RankMath) win the SERP, and the tactical playbook you can run on your own sites or your clients' — by tech stack, by surface, by goal."
        icon={Compass}
        accent="violet"
      />

      <Toc />

      <section className="glass-apple rounded-2xl p-5 space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <span>📖</span> Reverse-engineered playbooks
        </h3>
        <p className="text-xs text-muted-foreground">
          How the top-ranking SEO sites (Backlinko, RankMath, Search Engine Journal) actually win.
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          <a
            href="/knowledge/top-sites"
            className="rounded-md bg-violet-500/15 px-3 py-1.5 text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25"
          >
            Why Backlinko / RankMath / SEJ rank #1 — checklist
          </a>
        </div>
      </section>

      <RankingSignals />
      <TopicalAuthority />
      <WhyBlog />
      <BloggingRules />
      <DailyRhythm />
      <PageSpeedByStack />
      <Lcp />
      <GbpDeepDive />
      <KnowledgeGraph />
      <RichSnippets />
      <Eeat />
    </div>
  );
}

function Toc() {
  const items = [
    { id: "ranking-signals", label: "Ranking signals that actually move the needle" },
    { id: "topical-authority", label: "Topical authority — how the top sites win" },
    { id: "why-blog", label: "Why a professional site needs a blog" },
    { id: "blogging-rules", label: "Blogging rules for professional sites" },
    { id: "daily-rhythm", label: "Daily content rhythm — site + GBP" },
    { id: "page-speed", label: "Page speed by tech stack" },
    { id: "lcp", label: "Improving LCP & PageSpeed score" },
    { id: "gbp", label: "Google Business Profile — full playbook" },
    { id: "knowledge-graph", label: "Knowledge graph & entity SEO" },
    { id: "rich-snippets", label: "Rich snippets — what wins" },
    { id: "eeat", label: "E-E-A-T in practice" },
  ];
  return (
    <nav className="glass-apple rounded-2xl p-5">
      <h2 className="text-sm font-semibold">In this guide</h2>
      <ol className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
        {items.map((i, idx) => (
          <li key={i.id}>
            <a
              href={`#${i.id}`}
              className="text-violet-300 hover:underline"
            >
              {idx + 1}. {i.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
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
  icon: typeof Compass;
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
      <div className="prose prose-invert max-w-none px-5 py-5 text-sm leading-relaxed [&_h3]:mt-5 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground [&_li]:my-0.5 [&_p]:text-muted-foreground [&_strong]:text-foreground [&_ul]:my-2 [&_ul]:space-y-1">
        {children}
      </div>
    </section>
  );
}

function RankingSignals() {
  return (
    <Section id="ranking-signals" icon={Target} title="Ranking signals that actually move the needle" accent="violet">
      <p>
        Google has 200+ ranking signals, but a small subset accounts for almost
        all of the movement. Stop optimizing for the long tail of folklore —
        focus on these:
      </p>
      <h3>The dominant signals (2026)</h3>
      <ul>
        <li>
          <strong>Helpful, people-first content</strong> — the Helpful Content
          system is now baked into core. Sites with a high ratio of
          generic-AI-feel pages get suppressed sitewide. Audit ratio, not just
          single pages.
        </li>
        <li>
          <strong>Quality &amp; quantity of relevant inbound links</strong> —
          links from topically aligned, high-authority sources. One link from
          NYTimes &gt; 100 from random blogs.
        </li>
        <li>
          <strong>E-E-A-T signals</strong> — Experience first (real-world
          usage), then Expertise, Authority, Trust. Critical for YMYL queries
          (your-money-your-life: health, finance, legal).
        </li>
        <li>
          <strong>Search intent match</strong> — does your page answer the
          query in the format searchers expect (list / how-to /
          comparison / definition)? Mismatch loses every time, however good
          the content.
        </li>
        <li>
          <strong>Topical authority</strong> — how comprehensively your site
          covers the topic cluster, not just the one page.
        </li>
        <li>
          <strong>Page experience</strong> — Core Web Vitals (LCP, INP, CLS),
          mobile-friendliness, HTTPS, no intrusive interstitials.
        </li>
        <li>
          <strong>Freshness</strong> — for queries that demand it (news,
          comparison, &quot;best X&quot;). Last-updated date matters.
        </li>
        <li>
          <strong>Internal linking &amp; site structure</strong> — clean
          hierarchy, descriptive anchor text, no orphan pages.
        </li>
        <li>
          <strong>Structured data</strong> — eligibility for rich results
          (FAQ, How-to, Article, Product, Recipe, etc.).
        </li>
      </ul>
      <h3>What barely matters (or is folklore)</h3>
      <ul>
        <li>Keyword density / TF-IDF tuning to a percentage</li>
        <li>Exact-match keywords in URL slugs</li>
        <li>Meta keywords tag</li>
        <li>Word count by itself (without depth)</li>
        <li>One-H1-only rule</li>
        <li>Domain age</li>
        <li>Bounce rate (Google has confirmed they don&apos;t use it directly)</li>
      </ul>
    </Section>
  );
}

function TopicalAuthority() {
  return (
    <Section id="topical-authority" icon={Layers} title="Topical authority — how the top sites win" accent="cyan">
      <p>
        Topical authority is why Backlinko ranks for nearly every SEO query,
        Yoast for every WordPress-SEO query, Healthline for every symptom.
        They&apos;ve covered the topic so completely that Google trusts them as
        the authoritative source.
      </p>
      <h3>The hub-and-spoke model</h3>
      <ul>
        <li>
          <strong>Pillar / hub page</strong> — definitive guide on the broad
          topic (e.g. &quot;Link building&quot;). 3,000-8,000 words, links to all
          spoke pages, ranks for the head term.
        </li>
        <li>
          <strong>Spoke pages</strong> — each covers one specific subtopic
          (broken link building, HARO, digital PR, guest posting). 800-2,500
          words each. Each spoke links back to the hub and laterally to
          related spokes.
        </li>
        <li>
          <strong>Coverage targets</strong> — to claim authority on a topic
          cluster, plan ~15-30 pages per major cluster. The pillar alone
          isn&apos;t enough.
        </li>
      </ul>
      <h3>How to plan a cluster (the Backlinko / Ahrefs blog way)</h3>
      <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
        <li>Pick the head topic. Find its parent (broader) and sibling topics.</li>
        <li>
          Mine People-Also-Ask, Reddit, Quora, YouTube comments for the actual
          questions people ask. Each becomes a spoke candidate.
        </li>
        <li>
          Audit the SERP: what&apos;s ranking? If listicles dominate top 3, your
          spoke is a listicle. Don&apos;t fight the intent.
        </li>
        <li>
          Build the cluster as ONE batch over 4-8 weeks. Half-built clusters
          underperform — the internal linking only kicks in once the cluster
          is dense.
        </li>
        <li>
          Link the cluster: hub → all spokes, spokes → hub, spokes ↔ peer
          spokes where relevant. Use descriptive anchor text, not &quot;click
          here&quot;.
        </li>
        <li>
          Update the hub every 60-90 days. Re-pulse internal links if you
          shift navigation. Google rewards demonstrably maintained clusters.
        </li>
      </ol>
      <h3>Why &quot;publish 1 post a week forever&quot; fails</h3>
      <p>
        Single posts on unrelated topics never compound. Publishing 30 random
        posts is worse than publishing 30 in one tightly-themed cluster — the
        latter unlocks a topical authority boost the former never gets.
      </p>
    </Section>
  );
}

function WhyBlog() {
  return (
    <Section id="why-blog" icon={FileText} title="Why a professional site needs a blog" accent="emerald">
      <p>
        &quot;We don&apos;t need a blog, we&apos;re a serious business&quot; loses
        you organic traffic forever. The reason it matters is mechanical, not
        marketing-fluff:
      </p>
      <ul>
        <li>
          <strong>Most informational queries don&apos;t map to product/service
          pages.</strong> Without blog content, you can&apos;t rank for the 90%
          of searches that begin with &quot;how&quot;, &quot;what&quot;,
          &quot;why&quot;, &quot;best&quot;, &quot;vs&quot;. Your competitors
          who do blog will own all of those.
        </li>
        <li>
          <strong>Internal links to product pages depend on blog content.</strong>{" "}
          Without articles to host them, your money pages have weak link
          equity from inside the site.
        </li>
        <li>
          <strong>Topical authority requires breadth.</strong> A 6-page
          service site can&apos;t demonstrate authority. A 60-page site with a
          tight cluster around your service category can.
        </li>
        <li>
          <strong>Backlink magnets live in blog content, not product pages.</strong>{" "}
          People link to data studies, original research, &quot;ultimate
          guides&quot; — not to your /pricing page.
        </li>
        <li>
          <strong>Trust signals.</strong> A blog with author bylines, dates,
          and citations is the cheapest way to demonstrate E-E-A-T.
        </li>
        <li>
          <strong>Knowledge graph eligibility.</strong> Your About + a
          consistent blog-author footprint is what gets you into Google&apos;s
          entity graph.
        </li>
      </ul>
    </Section>
  );
}

function BloggingRules() {
  return (
    <Section id="blogging-rules" icon={BookOpen} title="Blogging rules for professional sites" accent="emerald">
      <h3>The 12 rules — same ones the top SEO blogs follow</h3>
      <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
        <li>
          <strong>One topic per post.</strong> If a post needs 3 H2 sections
          on unrelated subjects, split it into 3 posts.
        </li>
        <li>
          <strong>Match SERP intent before drafting.</strong> Look at top 5.
          If they&apos;re all listicles, write a listicle. Format mismatch
          loses 100% of the time.
        </li>
        <li>
          <strong>Open with the answer, not the throat-clearing.</strong> The
          first 100 words must give the visitor a reason to stay.
        </li>
        <li>
          <strong>One author. Real bio. Real bylines.</strong> &quot;Posted
          by Admin&quot; eliminates E-E-A-T signal entirely.
        </li>
        <li>
          <strong>Published date AND last-updated date.</strong> Visible to
          users. In schema. Update old posts and bump the date when content
          materially changes.
        </li>
        <li>
          <strong>Outbound citations to authoritative sources.</strong> 3+
          per post. Don&apos;t worry about &quot;leaking link juice&quot; —
          Google rewards well-cited content.
        </li>
        <li>
          <strong>3-5 internal links per post.</strong> Descriptive anchor
          text. Cross-link old + new posts both directions.
        </li>
        <li>
          <strong>Original images / charts / screenshots.</strong> Stock
          photos add nothing. A custom diagram or annotated screenshot earns
          links and image-search traffic.
        </li>
        <li>
          <strong>Schema markup matched to content.</strong> Article + Author
          for posts. FAQ schema only for posts with genuine Q&amp;A. How-To
          schema for actual procedural content. Don&apos;t fake it.
        </li>
        <li>
          <strong>Featured snippet shape on at least one section.</strong>{" "}
          One H2 phrased as the question, paragraph 40-60 words directly
          answering it. Picks up the snippet ~30% of the time.
        </li>
        <li>
          <strong>Update before you publish-new.</strong> A
          12-month-old post brought up to date often outperforms a new post.
          Refresh decay candidates first.
        </li>
        <li>
          <strong>One CTA per post.</strong> Either capture email, drive to
          a service page, or push a tool. Three CTAs = zero conversions.
        </li>
      </ol>
      <h3>Length guidance — directional, not a target</h3>
      <ul>
        <li>How-to / tutorial: 1,200-2,200 words</li>
        <li>Listicle (top 10 / best X): 1,800-3,500 words</li>
        <li>Ultimate guide (pillar): 3,000-8,000 words</li>
        <li>Comparison (X vs Y): 1,500-2,500 words</li>
        <li>Definition / quick answer: 400-900 words</li>
        <li>Case study / data study: 1,500-3,000 words + a chart</li>
      </ul>
    </Section>
  );
}

function DailyRhythm() {
  return (
    <Section id="daily-rhythm" icon={TrendingUp} title="Daily content rhythm — site + GBP" accent="amber">
      <h3>Weekly cadence (sustainable for a 1-2 person team)</h3>
      <ul>
        <li>
          <strong>Mon</strong> — publish 1 new post or refresh 1 old post
        </li>
        <li>
          <strong>Tue</strong> — internal-link audit on last week&apos;s post
          + 5 contextual links from older posts
        </li>
        <li>
          <strong>Wed</strong> — 1 GBP post (offer / event / update / product
          / story — rotate types)
        </li>
        <li>
          <strong>Thu</strong> — outreach / link building (HARO replies, broken
          link pitches)
        </li>
        <li>
          <strong>Fri</strong> — review GSC: any drops? 1-2 quick-win
          striking-distance keyword fixes
        </li>
        <li>
          <strong>Daily</strong> — reply to every GBP review within 24h. 5+
          star with name + specific detail; 1-3 star with empathy + offline
          fix.
        </li>
      </ul>
      <h3>GBP posts — what works</h3>
      <ul>
        <li>
          1 post per week minimum. 2-3 if you can sustain it. Posts decay in
          the GBP feed but the activity signal helps local pack visibility.
        </li>
        <li>
          Hook in the first 12 words. GBP truncates after that on mobile.
        </li>
        <li>
          Include 1 image (1200×900 or larger). Posts with images get ~2× the
          clicks of text-only.
        </li>
        <li>
          Always a CTA button — Book, Order, Call, Learn more, Sign up. Match
          your business action.
        </li>
        <li>
          Mix types over the week. All-offers feels spammy; vary
          updates/stories/products.
        </li>
      </ul>
      <h3>Why daily / consistent matters more than &quot;the perfect post&quot;</h3>
      <p>
        Google&apos;s freshness signals + GBP&apos;s activity signals reward
        cadence. A site that publishes a decent post every week for 2 years
        outperforms a site that publishes a brilliant post quarterly.
      </p>
    </Section>
  );
}

function PageSpeedByStack() {
  return (
    <Section id="page-speed" icon={Gauge} title="Page speed by tech stack" accent="cyan">
      <p>
        Generic page-speed advice is useless because the bottleneck is
        different on every stack. Here&apos;s the playbook by what you&apos;re
        actually running:
      </p>
      <h3>WordPress</h3>
      <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
        <li>
          <strong>Caching plugin</strong> — WP Rocket (paid, best),
          LiteSpeed Cache (free, requires LiteSpeed server), W3 Total Cache
          (free, complex). Without one, every page is regenerated per
          request.
        </li>
        <li>
          <strong>Audit plugins</strong> — every active plugin loads JS/CSS.
          Aim for &lt;15 active. Use Query Monitor to see which fire on every
          page. Replace bloat (Elementor → block-themes) where possible.
        </li>
        <li>
          <strong>Image optimization</strong> — ShortPixel / Smush / EWWW
          plugin. Convert to WebP. Lazy-load below the fold.
        </li>
        <li>
          <strong>Cloudflare in front</strong> — free tier, drops latency
          everywhere. Enable Auto Minify, Brotli, Polish (Lossy).
        </li>
        <li>
          <strong>Hosting matters</strong> — shared hosting (Bluehost,
          GoDaddy) caps you at TTFB ~600ms+. Move to Kinsta / Cloudways /
          Hetzner if speed matters.
        </li>
      </ol>
      <h3>Shopify</h3>
      <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
        <li>
          <strong>App audit</strong> — every app injects scripts. Audit in
          Settings → Apps. Remove abandoned ones. Each one usually adds
          200-800ms.
        </li>
        <li>
          <strong>Theme — use Dawn or a fast paid theme.</strong> Old Sectioned
          themes (Debut) are slow. Page builders (Shogun, PageFly) are slow.
        </li>
        <li>
          <strong>Image compression</strong> — &lt;100 KB per product image.
          Shopify renders WebP automatically; just keep source files lean.
        </li>
        <li>
          <strong>Lazy-load with Liquid</strong> — change <code>img_url</code>
          {" "}to <code>image_tag</code> with <code>loading: &quot;lazy&quot;</code>.
        </li>
        <li>
          <strong>Defer 3rd-party scripts</strong> — analytics, chat,
          reviews. Load them after page render.
        </li>
      </ol>
      <h3>Next.js</h3>
      <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
        <li>
          <strong>next/image with priority</strong> on the LCP image. Set
          width/height to prevent layout shift.
        </li>
        <li>
          <strong>next/font</strong> for self-hosted fonts. Eliminates the
          render-blocking external font request.
        </li>
        <li>
          <strong>next/script with strategy=&quot;afterInteractive&quot;</strong>{" "}
          for analytics, chat, GTM.
        </li>
        <li>
          <strong>Dynamic imports</strong> for client-only components below
          the fold. Cuts initial bundle.
        </li>
        <li>
          <strong>ISR or static rendering</strong> for content that doesn&apos;t
          need request-time data. <code>revalidate: 3600</code> on blog posts.
        </li>
        <li>
          <strong>Edge runtime</strong> for the parts that can use it. Cuts
          TTFB from ~300ms to ~30ms in many regions.
        </li>
      </ol>
      <h3>Wix / Squarespace</h3>
      <p>
        Limited control. The honest list of what you CAN do:
      </p>
      <ul>
        <li>Compress images before upload (≤200KB per hero, ≤80KB per gallery)</li>
        <li>
          Disable apps you&apos;re not actively using (each one adds load time)
        </li>
        <li>Reduce custom code in &lt;head&gt; — every embed costs you</li>
        <li>
          Pick a fast template — newer templates are usually 30-50% faster
        </li>
        <li>
          Be honest with the client: Wix/SquareSpace will never beat
          Shopify/Next.js on speed. Compete on content + conversion instead.
        </li>
      </ul>
    </Section>
  );
}

function Lcp() {
  return (
    <Section id="lcp" icon={Zap} title="Improving LCP &amp; PageSpeed score" accent="amber">
      <p>
        LCP (Largest Contentful Paint) is the single Core Web Vital that moves
        rankings most often, because most sites fail it on mobile. Target:{" "}
        <strong>&lt;2.5s</strong> on 75th percentile mobile users.
      </p>
      <h3>The 5 LCP fixes that move the needle (in order)</h3>
      <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
        <li>
          <strong>Identify the LCP element</strong> — open Lighthouse, the
          report shows it. 90% of the time it&apos;s the hero image, hero text
          block, or a hero video poster.
        </li>
        <li>
          <strong>Preload it</strong> —{" "}
          <code>&lt;link rel=&quot;preload&quot; as=&quot;image&quot; href=&quot;hero.webp&quot; fetchpriority=&quot;high&quot;&gt;</code>
          . On Next.js, add <code>priority</code> prop to the image.
        </li>
        <li>
          <strong>Compress + serve modern format</strong> — WebP or AVIF.
          Hero images should be &lt;100KB even on retina.
        </li>
        <li>
          <strong>Eliminate render-blocking resources</strong> — defer
          non-critical CSS, async load JS, push web fonts to swap or use
          font-display:optional.
        </li>
        <li>
          <strong>Reduce TTFB</strong> — caching, CDN, faster hosting.
          TTFB above 600ms makes &lt;2.5s LCP almost impossible.
        </li>
      </ol>
      <h3>PageSpeed score quick wins (boosts 60→85+)</h3>
      <ul>
        <li>Resize hero images to actual displayed dimensions</li>
        <li>Lazy-load every image below the fold</li>
        <li>Defer or async every &lt;script&gt; tag</li>
        <li>Inline critical CSS (above-the-fold) in &lt;head&gt;</li>
        <li>Move analytics to <code>afterInteractive</code></li>
        <li>Self-host Google Fonts (or use system fonts)</li>
        <li>Eliminate render-blocking 3rd-party widgets (chat, social buttons)</li>
        <li>
          Add <code>width</code> and <code>height</code> to every image to
          eliminate CLS
        </li>
      </ul>
      <h3>By server / hosting</h3>
      <ul>
        <li>
          <strong>Apache shared hosting</strong> — enable mod_pagespeed if
          available, gzip + brotli, force HTTPS, mod_expires for static cache
          headers.
        </li>
        <li>
          <strong>Nginx</strong> — fastcgi cache for WordPress (TTFB drops
          to ~50ms), gzip + brotli, http2_push for critical CSS, proxy_cache
          for API responses.
        </li>
        <li>
          <strong>Cloudflare in front of anything</strong> — free, drops
          TTFB globally, Auto Minify + Brotli + Cache Reserve. Single biggest
          ROI optimization.
        </li>
        <li>
          <strong>Vercel / Netlify</strong> — already at the edge. LCP
          tuning becomes purely about asset weight + render path.
        </li>
      </ul>
    </Section>
  );
}

function GbpDeepDive() {
  return (
    <Section id="gbp" icon={Building} title="Google Business Profile — full playbook" accent="cyan">
      <p>
        Local pack ranking is largely driven by GBP signals — even more than
        on-site SEO for &quot;[service] near me&quot; type queries.
      </p>
      <h3>Profile completeness (do once, properly)</h3>
      <ul>
        <li>
          Business name — <strong>exact</strong> match to signage and
          legal/DBA. Don&apos;t keyword-stuff (&quot;Smith Plumbing - 24/7
          Emergency Plumbers&quot;) — Google demotes for it.
        </li>
        <li>
          Primary category — pick the most specific that fits. Add 3-5
          secondary categories.
        </li>
        <li>
          NAP — name / address / phone — must match website + every
          directory citation exactly.
        </li>
        <li>Hours — including holidays. Update 7 days before holiday closures.</li>
        <li>Service area — only set if you don&apos;t serve from a public address.</li>
        <li>
          Website link — to a relevant landing page, not always the homepage.
          For a multi-location business, link to the location page.
        </li>
        <li>Booking link — if you take appointments. Direct, not via Reserve with Google.</li>
        <li>
          Products / Services — add every one. Each becomes a sub-listing
          Google can index.
        </li>
        <li>
          Attributes — accessibility, payments, identity-owned (women-owned,
          black-owned, etc.) — these surface filters.
        </li>
        <li>
          Photos — 10+ upload, mixed: exterior, interior, team, products,
          customers (with permission).
        </li>
      </ul>
      <h3>Reviews — the biggest local ranking lever</h3>
      <ul>
        <li>Goal: 50+ reviews, 4.5+ avg, 1+ new review per week sustained.</li>
        <li>
          Ask every customer at the moment of peak satisfaction — the day of
          service, not weeks later.
        </li>
        <li>
          Use a short link (g.page/r/{"<id>"}) on receipts, in email
          signatures, on the &quot;thanks&quot; screen after checkout.
        </li>
        <li>
          Reply to every review within 24h. Yes, even the 5-star ones —
          Google reads the dialog.
        </li>
        <li>
          Negative reviews: empathy + offer to make it right offline. Never
          argue. Never expose customer details.
        </li>
        <li>
          Use review keywords naturally in your replies — they&apos;re indexed
          for the listing.
        </li>
      </ul>
      <h3>Posts — weekly minimum</h3>
      <ul>
        <li>
          Post 1-3× per week. Mix offers, events, updates, products, stories.
        </li>
        <li>1200×900 image minimum. Google penalizes blurry posts.</li>
        <li>
          Hook in the first 12 words. Always end with a CTA button.
        </li>
        <li>
          Local detail: name the city / neighbourhood / a known landmark.
        </li>
      </ul>
      <h3>Citations &amp; consistency</h3>
      <ul>
        <li>
          Top tier: Apple Business Connect, Bing Places, Yelp, Facebook,
          Foursquare, BBB.
        </li>
        <li>
          Niche citations matter more than 100 random directories. A
          dental practice on Healthgrades + ZocDoc beats 50 generic listings.
        </li>
        <li>
          NAP consistency to the punctuation. &quot;Suite 100&quot; vs
          &quot;Ste. 100&quot; vs &quot;#100&quot; should all be normalized.
        </li>
      </ul>
      <h3>Q&amp;A</h3>
      <p>
        Many businesses ignore this. Seed your own most-asked questions with
        good answers — they&apos;re indexed and sometimes pulled into the
        knowledge panel.
      </p>
    </Section>
  );
}

function KnowledgeGraph() {
  return (
    <Section id="knowledge-graph" icon={Globe} title="Knowledge graph &amp; entity SEO" accent="violet">
      <p>
        Google&apos;s knowledge graph is its database of entities (people,
        businesses, places, things). Getting your business / brand / authors
        recognized as entities unlocks the knowledge panel, brand SERP, and
        better citation rates in AI Overviews + LLM answers.
      </p>
      <h3>How to earn knowledge-graph entity status</h3>
      <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
        <li>
          <strong>Wikidata entry</strong> — the cheapest, most direct
          signal. Create one with notable references (news mentions, books,
          academic citations, official site).
        </li>
        <li>
          <strong>Wikipedia article</strong> — only if you meet notability
          thresholds. Don&apos;t game it; admins delete promotional pages.
        </li>
        <li>
          <strong>Organization / Person schema with sameAs</strong> — link
          your home page to LinkedIn, Twitter/X, Crunchbase, Wikidata,
          Wikipedia. Google reads sameAs as identity-graph evidence.
        </li>
        <li>
          <strong>Consistent name everywhere</strong> — same legal name,
          same brand spelling, same logo across all platforms. Inconsistency
          fragments the entity.
        </li>
        <li>
          <strong>Authoritative mentions</strong> — news pieces, podcast
          appearances, conference speaker pages, GitHub bio. These build the
          entity association even without links.
        </li>
        <li>
          <strong>Author profiles per writer</strong> — every blog author
          gets a /author/{"<slug>"} page with bio, photo, social profiles,
          full author Person schema, and a list of their published articles.
        </li>
      </ol>
      <h3>Brand SERP optimization</h3>
      <ul>
        <li>
          Search your brand name. The first SERP is your reputation.
        </li>
        <li>
          Make sure you control the top 5 results: home, key category, About,
          LinkedIn, Twitter.
        </li>
        <li>
          Sitelinks are auto-generated by Google. Help Google by having a
          clean information architecture and keyword-distinct page titles.
        </li>
      </ul>
    </Section>
  );
}

function RichSnippets() {
  return (
    <Section id="rich-snippets" icon={Star} title="Rich snippets — what wins in 2026" accent="amber">
      <p>
        After Google&apos;s 2023-2025 cleanups, many schema types stopped
        producing visible rich results. Here&apos;s what actually shows up in
        SERPs today and what&apos;s worth implementing:
      </p>
      <h3>Still produces rich results</h3>
      <ul>
        <li>
          <strong>Article / NewsArticle</strong> — top stories, byline + date
          enrichment.
        </li>
        <li>
          <strong>Product</strong> — price, availability, ratings (only with
          real review aggregator data, not self-attestation).
        </li>
        <li>
          <strong>Recipe</strong> — full carousel, cooking time, calories,
          rating.
        </li>
        <li>
          <strong>Event</strong> — date, location, tickets.
        </li>
        <li>
          <strong>FAQ</strong> — only on government and authoritative health
          sites now (rolled back for everyone else in 2023).
        </li>
        <li>
          <strong>How-to</strong> — only on desktop, only for genuinely
          procedural content.
        </li>
        <li>
          <strong>Breadcrumb</strong> — replaces ugly URL in result.
        </li>
        <li>
          <strong>Video</strong> — thumbnail + duration in SERP. Critical for
          video content.
        </li>
        <li>
          <strong>LocalBusiness</strong> — opening hours, address, phone in
          knowledge panel.
        </li>
        <li>
          <strong>Sitelinks Search Box</strong> — only for established sites
          with strong brand signal.
        </li>
        <li>
          <strong>Review (organization-level)</strong> — for service businesses,
          star rating in SERP if from third-party aggregator.
        </li>
      </ul>
      <h3>Stopped showing rich results (skip / deprioritize)</h3>
      <ul>
        <li>FAQ on commercial pages (rolled back)</li>
        <li>How-to on mobile (rolled back)</li>
        <li>Self-claimed Review schema with no third-party source</li>
        <li>JobPosting (still works but Google for Jobs surface-only)</li>
      </ul>
      <h3>Implementation rules</h3>
      <ul>
        <li>
          Schema must reflect what&apos;s actually visible on the page. Faking
          it gets a manual action.
        </li>
        <li>
          Use JSON-LD in &lt;head&gt;. Microdata is harder to maintain and
          mix-ups are common.
        </li>
        <li>
          Validate every page in Google&apos;s Rich Results Test before
          considering it shipped.
        </li>
        <li>
          One canonical entity per page — don&apos;t put 5 different schema
          objects representing the same thing.
        </li>
      </ul>
    </Section>
  );
}

function Eeat() {
  return (
    <Section id="eeat" icon={Sparkles} title="E-E-A-T in practice" accent="emerald">
      <p>
        Experience, Expertise, Authoritativeness, Trust. Critical for YMYL
        (your-money-your-life: health, finance, legal, news) — important
        everywhere else. The signals are visible, not vibes. Audit them:
      </p>
      <h3>Visible signals on every published page</h3>
      <ul>
        <li>
          <strong>Author byline</strong> with link to /author/{"<slug>"} page
        </li>
        <li>
          <strong>Author bio</strong> directly below or beside the byline —
          credentials, years of experience, specialism
        </li>
        <li>
          <strong>Published date AND last-updated date</strong> visible to user
        </li>
        <li>
          <strong>Reviewer line</strong> for YMYL: &quot;Medically reviewed
          by Dr. X, [credential]&quot; or &quot;Fact-checked by [editor]&quot;
        </li>
        <li>
          <strong>Outbound citations</strong> — 3+ to authoritative sources
          (.gov, .edu, peer-reviewed, primary sources). Linked, not just
          mentioned.
        </li>
        <li>
          <strong>Original imagery</strong> — your screenshot, your photo,
          your chart. Not stock.
        </li>
      </ul>
      <h3>Site-wide trust pages</h3>
      <ul>
        <li>About — real people, real bios, real photos</li>
        <li>Editorial policy / methodology / standards page</li>
        <li>Contact — phone, email, physical address if applicable</li>
        <li>Privacy policy + terms — link from footer on every page</li>
        <li>
          Sources / disclosure — for affiliate sites, disclose. For
          AI-assisted content, consider disclosing.
        </li>
      </ul>
      <h3>Schema</h3>
      <ul>
        <li>Person schema for authors with sameAs links to their profiles</li>
        <li>Organization schema on the home page with sameAs links</li>
        <li>
          Article schema with author + datePublished + dateModified on every
          post
        </li>
      </ul>
      <p>
        Run the in-tool E-E-A-T audit (Tools → E-E-A-T audit) on any page to
        get a score and concrete fix list.
      </p>
    </Section>
  );
}
