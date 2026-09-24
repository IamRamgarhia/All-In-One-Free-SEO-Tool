/**
 * Every word of the documentation site.
 *
 * Kept apart from build.mjs so writing docs never means editing the
 * template, and so a non-developer can change wording without touching
 * anything that could break the build.
 *
 * Two rules while editing:
 *
 *   Only describe what the software does. A docs page that promises a
 *   feature is worse than no page, because the reader concludes the
 *   product is broken rather than that the docs are wrong.
 *
 *   Say the limits out loud. Backlink coverage, rank sources and AI
 *   costs are where a free tool disappoints people, and they only feel
 *   misled if nobody told them first.
 */

export const SITE = {
  name: "All-In-One Free SEO Tool",
  origin: "https://dicecodes.com",
  /** Change with --base, and every link follows. */
  base: "/seo-tool/",
  repo: "https://github.com/IamRamgarhia/All-In-One-Free-SEO-Tool",
  download: "https://github.com/IamRamgarhia/All-In-One-Free-SEO-Tool/releases/latest",
};

const REPO = SITE.repo;

export const PAGES = [
  // ───────────────────────────── Start here ─────────────────────────────
  {
    slug: "index.html",
    keywords: "overview what is this free seo tool alternative ahrefs semrush moz start begin introduction",
    group: "Start here",
    title: "What this is",
    navTitle: "Overview",
    eyebrow: "Documentation",
    lede:
      "A complete SEO platform that runs on your own computer. No account, no subscription, " +
      "and no API keys needed to start. Your clients, audits and rankings live in a single file " +
      "on your disk and never leave it.",
    sections: [
      {
        id: "what",
        h2: "What you get",
        html: `
<p>This is the work an SEO does every week, in one place: crawl a site and find what is
broken, track what it ranks for, watch competitors, write and send the client report.
It is free because it uses your own computer and the free tiers of Google's own APIs
rather than reselling someone else's data.</p>

<div class="grid">
  <div class="card"><a href="audits.html">Audits</a><p>Crawl a site, get findings sorted by how much they actually matter, with a fix for each.</p></div>
  <div class="card"><a href="keywords.html">Keywords &amp; rankings</a><p>Track positions from Search Console or a live search, with the source always shown.</p></div>
  <div class="card"><a href="agent.html">The AI agent</a><p>Applies fixes to your site and can undo every one of them.</p></div>
  <div class="card"><a href="reports.html">Reports</a><p>White-labelled PDFs with a written summary, built from the data already collected.</p></div>
  <div class="card"><a href="local-seo.html">Local SEO</a><p>Business Profile, citations, reviews and rank by physical location.</p></div>
  <div class="card"><a href="ai-visibility.html">AI visibility</a><p>Whether AI assistants mention you, and who they cite instead.</p></div>
</div>`,
      },
      {
        id: "free",
        h2: "What &ldquo;free&rdquo; actually means",
        html: `
<p>Free to run, forever, with no paid service in the core paths. Specifically:</p>
<ul>
  <li><strong>No account and no licence.</strong> Download it, run it, done.</li>
  <li><strong>No paid APIs required.</strong> Google Search Console, Analytics and PageSpeed
  are free. Crawling and rank checks use your own machine.</li>
  <li><strong>Optional paid keys are yours.</strong> If you want a commercial SERP API or a
  paid AI model, you add your own key and pay that vendor directly. Nothing is resold.</li>
  <li><strong>MIT licensed.</strong> Use it for clients, change it, sell it.</li>
</ul>
<div class="note"><strong>The honest part</strong>
<p>Two things cost money if you want them at scale: heavy daily rank checking across
hundreds of keywords, and AI features beyond the free tiers. Everything else is genuinely
free. See <a href="faq.html#limits">the limits</a> before you plan around it.</p></div>`,
      },
      {
        id: "start",
        h2: "Get started",
        html: `
<ol class="steps">
  <li><strong>Install it</strong> Download the ZIP, extract, double-click the launcher for
  your computer. <a href="install.html">Full instructions &rarr;</a></li>
  <li><strong>Add your first site</strong> Paste a URL. It detects the platform and niche and
  builds a plan. <a href="first-run.html">What to do first &rarr;</a></li>
  <li><strong>Connect Search Console</strong> Free, about five minutes, and the single change
  that most affects what you get out of this. <a href="integrations.html#gsc">How &rarr;</a></li>
</ol>`,
      },
      {
        id: "privacy",
        h2: "Where your data lives",
        html: `
<p>One file: <code>_system/data.db</code> inside the folder you extracted. Every client,
audit, keyword, ranking, report and setting is in it. Copy that file and you have copied
your whole install.</p>
<p>Nothing is uploaded anywhere. The software talks to the internet only to crawl the sites
you ask it to, call the APIs you connect, and check for its own updates.</p>
<p><a href="backup.html">Backing up and restoring &rarr;</a></p>`,
      },
    ],
  },

  {
    slug: "install.html",
    keywords: "install setup download zip launcher windows mac linux docker node npm requirements first time getting started exe msi unzip extract",
    group: "Start here",
    title: "Install",
    lede:
      "One download, one launcher, nothing to configure. It works on Windows, macOS and Linux, " +
      "and it installs Node.js for you if you do not have it.",
    sections: [
      {
        id: "download",
        h2: "Download and run",
        html: `
<ol class="steps">
  <li><strong>Download the ZIP</strong>
    <p><a class="btn btn-primary" href="${SITE.download}" rel="noopener">Get the latest release</a></p></li>
  <li><strong>Extract it</strong>
    <p>Right-click the ZIP &rarr; <em>Extract All</em>. The app cannot run from inside a ZIP —
    it needs the <code>_system</code> folder next to the launcher.</p></li>
  <li><strong>Double-click the launcher for your computer</strong>
    <table>
      <tr><th>Windows</th><td><code>SEO Tool - WINDOWS</code></td></tr>
      <tr><th>macOS</th><td><code>SEO Tool - MAC</code></td></tr>
      <tr><th>Linux</th><td><code>SEO Tool - LINUX</code></td></tr>
    </table>
    <p>A small window opens with one button.</p></li>
  <li><strong>Click &ldquo;Set up the SEO Tool&rdquo; and wait</strong>
    <p>There is nothing to fill in. It fetches what it needs and builds the app, then opens
    in your browser by itself.</p></li>
</ol>
<div class="warn"><strong>Be realistic about the first run</strong>
<p>This is a full web application, so setup takes roughly 3&ndash;10 minutes and downloads a
few hundred MB. Every run after that starts in seconds. A black window appears while it
works — leave it alone, it closes on its own.</p></div>`,
      },
      {
        id: "node",
        h2: "You do not need to install Node.js",
        html: `
<p>If Node is not on your computer, the setup downloads the official portable copy and keeps
it <em>inside the app folder</em>. No administrator rights, nothing added to your system,
and a Node you already have is left alone.</p>
<p>If you would rather use your own, install Node 20.11 or newer from
<a href="https://nodejs.org" rel="noopener">nodejs.org</a> before running the launcher.</p>`,
      },
      {
        id: "windows-warning",
        h2: "&ldquo;Windows protected your PC&rdquo;",
        html: `
<p>Windows shows this for any program that is not code-signed. A signing certificate costs
around $300 a year, which would rather defeat the word &ldquo;free&rdquo;.</p>
<p>Click <strong>More info</strong>, then <strong>Run anyway</strong>.</p>
<p>If double-clicking does nothing at all, Windows may have blocked the file as
internet-sourced: right-click the launcher &rarr; <em>Properties</em> &rarr; tick
<strong>Unblock</strong> at the bottom &rarr; OK.</p>`,
      },
      {
        id: "one-line",
        h2: "One-line install (for developers)",
        html: `
<p>If you are comfortable in a terminal, this does the same thing and puts the app in
<code>~/seo</code>:</p>
<h3>Windows (PowerShell)</h3>
<pre><code>iwr -useb ${REPO.replace("github.com", "raw.githubusercontent.com")}/main/install.ps1 | iex</code></pre>
<h3>macOS / Linux</h3>
<pre><code>curl -fsSL ${REPO.replace("github.com", "raw.githubusercontent.com")}/main/install.sh | bash</code></pre>
<p>The installer asks whether to start the app when you log in. Say yes if you want the
nightly work to happen on its own — see <a href="automation.html#always-on">why that
matters</a>.</p>`,
      },
      {
        id: "docker",
        h2: "Docker",
        html: `
<pre><code>git clone ${REPO}.git
cd All-In-One-Free-SEO-Tool
docker compose up -d</code></pre>
<p>Then open <a href="http://localhost:3000">http://localhost:3000</a>.</p>
<div class="note"><strong>Docker installs work differently</strong>
<p>Your data lives in a Docker volume rather than a folder, so the desktop launcher's
backup buttons cannot reach it. Use <em>Settings &rarr; Backup</em> inside the app, and
<code>docker compose up -d</code> / <code>down</code> to start and stop.</p></div>`,
      },
      {
        id: "requirements",
        h2: "What it needs",
        html: `
<table>
  <tr><th>Disk</th><td>About 1.5 GB after install, plus your data</td></tr>
  <tr><th>Memory</th><td>1 GB free is enough for a handful of clients</td></tr>
  <tr><th>Node.js</th><td>20.11+ — fetched for you if missing</td></tr>
  <tr><th>Internet</th><td>Needed to crawl sites and call APIs. The app itself runs offline.</td></tr>
  <tr><th>A server?</th><td>No. It runs on your own machine. A $5 VPS works if you want it always on.</td></tr>
</table>`,
      },
    ],
  },

  {
    slug: "first-run.html",
    keywords: "getting started first steps begin setup wizard onboarding new user what next add site",
    group: "Start here",
    title: "Your first 10 minutes",
    navTitle: "First 10 minutes",
    lede: "Four steps, in this order. The third one is the one that matters most.",
    sections: [
      {
        id: "client",
        h2: "1. Add your first site",
        html: `
<p>Go to <strong>Clients &rarr; Add client</strong> and paste a URL. Nothing else is required.</p>
<p>The tool fetches the site and works out the platform (WordPress, Shopify, Next.js, Wix and
others), the niche, and the business details it can find. It then builds a task plan around
what it actually found — it checks the live site first, so you are not handed a checklist of
things the site already does.</p>`,
      },
      {
        id: "audit",
        h2: "2. Run an audit",
        html: `
<p>The first audit starts by itself when you add a client. It crawls the site and produces
findings sorted by how much they matter, each with an explanation of why it matters and what
to do about it.</p>
<p>This works with nothing else configured — no keys, no connections. It is the fastest way
to see whether the tool is useful to you. <a href="audits.html">More on audits &rarr;</a></p>`,
      },
      {
        id: "google",
        h2: "3. Connect Google Search Console",
        html: `
<div class="tip"><strong>This is the important one</strong>
<p>It is free, takes about five minutes, and it changes what the tool can do more than
anything else on this page. Without it, rankings come from a live search — one sample, from
one place. With it, they come from Google's own record of what actually happened.</p></div>
<p>It also unlocks the quick-wins finder, traffic-drop alerts, cannibalisation detection and
the traffic sections of your reports. <a href="integrations.html#gsc">Step-by-step &rarr;</a></p>`,
      },
      {
        id: "ai",
        h2: "4. Optional: add an AI provider",
        html: `
<p>AI is used for plain-English explanations, written fixes, content help and the executive
summary in reports. Everything else works without it.</p>
<p>Gemini and Groq have genuinely free tiers and take about two minutes to set up. Or run
<a href="https://ollama.com" rel="noopener">Ollama</a> locally and stay completely offline.
<a href="integrations.html#ai">How to connect one &rarr;</a></p>`,
      },
      {
        id: "then",
        h2: "Then what",
        html: `
<p>Once those four are done the tool starts doing the repetitive parts on its own: nightly
checks, rank updates, page monitoring and alerts. See
<a href="automation.html">Automation</a> — and note that it only runs while the app is
running, which is worth understanding early.</p>`,
      },
    ],
  },

  // ───────────────────────────── Everyday ─────────────────────────────
  {
    slug: "clients.html",
    keywords: "client website site add customer project dashboard health score portal share link white label",
    group: "Everyday",
    title: "Clients and the dashboard",
    navTitle: "Clients",
    lede:
      "Every site you work on is a client — including your own. Everything else in the tool " +
      "hangs off this.",
    sections: [
      {
        id: "adding",
        h2: "Adding a client",
        html: `
<p>Paste a URL. The tool detects the platform, hosting, CDN, analytics and e-commerce stack,
reads the business details from the page, and picks a niche. You can correct any of it.</p>
<p>Bulk-add from a CSV, or import straight from Google if you already have properties in
Search Console and Analytics.</p>`,
      },
      {
        id: "dashboard",
        h2: "The client dashboard",
        html: `
<p>One screen per client: health score and trend, the few things worth doing today, what
changed since you last looked, and quick wins waiting to be taken.</p>
<p>The cross-client view is the <strong>Morning briefing</strong> — everything that needs
attention across every client, in one ranked list.</p>`,
      },
      {
        id: "portal",
        h2: "The client portal",
        html: `
<p>Each client can be given a private link showing live progress — health score, work
completed, open items — without you sending anything. It carries your branding, not ours.</p>
<p>A task you mark <em>skipped</em> disappears from the client's view, because skipping it
was the decision.</p>`,
      },
    ],
  },

  {
    slug: "audits.html",
    keywords: "audit crawl scan site health errors issues findings problems broken technical seo checker severity fix",
    group: "Everyday",
    title: "Audits and findings",
    navTitle: "Audits",
    lede:
      "Crawl a site, get back the things that are wrong, ranked by how much they matter — " +
      "each with an explanation and a fix.",
    sections: [
      {
        id: "running",
        h2: "Running an audit",
        html: `
<p>The crawler follows your site the way a search engine would: it respects robots.txt,
crawls several pages at once, and records what it finds. A full audit of a small site takes
a minute or two.</p>
<p>You can re-crawl a single URL or a section without re-running everything.</p>`,
      },
      {
        id: "findings",
        h2: "Reading the findings",
        html: `
<p>Findings are grouped by severity, and every one tells you three things: what is wrong, why
it matters (with a link to Google's own documentation where one exists), and what to do.</p>
<p>Each carries a confidence level — <em>definitely fix this</em>, <em>probably worth
fixing</em>, <em>worth testing</em> — because not every finding deserves the same urgency.</p>
<p>Mark anything as fixed, ignored or a false positive. The next crawl remembers.</p>`,
      },
      {
        id: "checks",
        h2: "What it checks",
        html: `
<p>Broadly: titles and meta descriptions, headings, canonical tags, robots directives,
structured data, images and alt text, internal linking and orphan pages, redirects and
broken links, hreflang, sitemaps and robots.txt, mobile basics, security headers and TLS,
Core Web Vitals, JavaScript rendering, soft 404s, faceted-URL traps, and platform-specific
problems for WordPress, Shopify and Next.js.</p>`,
      },
      {
        id: "fixing",
        h2: "Fixing what it finds",
        html: `
<p>Every finding has a fix guide with the exact change to make, written for your platform.
For WordPress sites with the bridge plugin connected, the agent can apply many of them
directly — and undo them. <a href="agent.html">How the agent works &rarr;</a></p>`,
      },
    ],
  },

  {
    slug: "tasks.html",
    keywords: "task todo checklist work plan kanban priority assign done skipped playbook",
    group: "Everyday",
    title: "Tasks and ranked work",
    navTitle: "Tasks",
    lede: "One list that says what to do next, and who should do it — you or the tool.",
    sections: [
      {
        id: "where",
        h2: "Where tasks come from",
        html: `
<ul>
  <li><strong>Audit findings</strong> — anything worth doing becomes a task.</li>
  <li><strong>Your platform and niche</strong> — a starting checklist, filtered against what
  the live site already does, so you are not told to add a sitemap you already have.</li>
  <li><strong>Playbooks</strong> — named bundles for recurring work: a monthly technical
  sweep, a content refresh, a traffic-drop investigation.</li>
  <li><strong>You</strong> — add anything by hand.</li>
</ul>`,
      },
      {
        id: "states",
        h2: "Task states",
        html: `
<table>
  <tr><th>To do</th><td>Outstanding work</td></tr>
  <tr><th>In progress</th><td>Started</td></tr>
  <tr><th>Done</th><td>Finished — appears in the client report as work completed</td></tr>
  <tr><th>Skipped</th><td>Decided against. Stops being offered, and is never shown to the client as a recommendation.</td></tr>
</table>`,
      },
      {
        id: "ranked",
        h2: "The ranked list",
        html: `
<p><strong>Morning briefing</strong> pulls everything across every client into one ordered
list, and says for each item whether it needs you or whether the agent can handle it. Tasks
link straight to the tool that does them, so there is no hunting for the right screen.</p>`,
      },
    ],
  },

  {
    slug: "keywords.html",
    keywords: "keyword rank ranking position serp track tracker search console gsc average position quick wins cannibalization research volume",
    group: "Everyday",
    title: "Keywords and rankings",
    navTitle: "Keywords &amp; ranks",
    lede:
      "Track what a site ranks for — and always know where the number came from, because " +
      "two sources that disagree are not a bug.",
    sections: [
      {
        id: "sources",
        h2: "Two sources, never mixed",
        html: `
<table>
  <tr><th>Search Console</th><td>Google's own record. An <em>average position across everyone
  who saw the result</em>, for queries you already appear for. Free, accurate, no scraping,
  and it cannot be rate-limited. Lags two to three days.</td></tr>
  <tr><th>Live search</th><td>One position, from one location, right now. Works for keywords
  you do not rank for yet. Can be blocked by search engines, and the tool says so rather than
  recording a failed check as &ldquo;not ranking&rdquo;.</td></tr>
</table>
<div class="note"><strong>Why the distinction matters</strong>
<p>A Search Console average and a scraped position measure different things. If a movement
would be calculated across two different sources, the tool reports it as <em>not
comparable</em> rather than inventing a confident &ldquo;up 6 places&rdquo; that never
happened.</p></div>`,
      },
      {
        id: "tracking",
        h2: "Tracking keywords",
        html: `
<p>Add keywords by hand, import a CSV, or let the tool suggest them from the site's own
content and your Search Console queries. Desktop and mobile are tracked separately, and local
keywords can be pinned to a city.</p>
<p>Checks run on a schedule once the app is running, and history is kept so you can see
movement over time.</p>`,
      },
      {
        id: "quick-wins",
        h2: "Quick wins and cannibalisation",
        html: `
<p><strong>Quick wins</strong> finds keywords sitting just outside the positions that get
clicks — the ones where a small improvement pays immediately. Needs Search Console.</p>
<p><strong>Cannibalisation</strong> finds queries where two of your own pages compete, which
usually means neither ranks as well as one would.</p>`,
      },
      {
        id: "research",
        h2: "Finding new keywords",
        html: `
<p>Research pulls from Google autocomplete, People Also Ask, related searches, Wikipedia,
Reddit and YouTube — all free, no key needed. Results are grouped into clusters by topic and
labelled by intent.</p>`,
      },
    ],
  },

  {
    slug: "reports.html",
    keywords: "report pdf client report white label branding monthly export deliver send schedule proposal invoice summary",
    group: "Everyday",
    title: "Reports and client delivery",
    navTitle: "Reports",
    lede:
      "The part that takes agencies days every month. Everything is already collected, so a " +
      "report is a render rather than a gathering exercise.",
    sections: [
      {
        id: "generating",
        h2: "Generating a report",
        html: `
<p>Pick a client and a period. The PDF is built from data the tool already has: traffic,
rankings, technical health, work completed, backlinks, competitors and AI visibility.</p>
<p><strong>Generate all reports</strong> does every client in one run, then puts them in a
review queue. Nothing reaches a client until a person approves it — a batch cannot send on
its own.</p>`,
      },
      {
        id: "summary",
        h2: "The written summary",
        html: `
<p>If an AI provider is connected, the executive summary is written for you, following a
fixed shape: what direction things moved, the clearest win, and the priority for next period.</p>
<p>Every summary ships with a &ldquo;data behind this&rdquo; section mapping each claim to
the number it came from, so a client can check it and so you can too.</p>`,
      },
      {
        id: "branding",
        h2: "White labelling",
        html: `
<p>Your logo, colours and name on the PDF and the client portal. The tool's own branding does
not appear on anything a client sees.</p>`,
      },
      {
        id: "proposals",
        h2: "Proposals and invoices",
        html: `
<p>Proposals are built from real audit findings for that specific site, so what you are
pitching is what the crawl actually found. Invoices are there so the admin side does not need
a second tool.</p>`,
      },
    ],
  },

  // ───────────────────────────── Growth ─────────────────────────────
  {
    slug: "content.html",
    keywords: "content brief writing blog article decay refresh title test meta description rewrite editor score",
    group: "Growth",
    title: "Content",
    lede: "Briefs, scoring, decay detection and the experiments that move click-through.",
    sections: [
      {
        id: "briefs",
        h2: "Briefs and scoring",
        html: `
<p>A brief is built from what currently ranks: target length, the headings to cover, the
questions people also ask, and internal links you already have that should point at it.</p>
<p>Paste or import a draft to score it against that brief before publishing.</p>`,
      },
      {
        id: "decay",
        h2: "Content decay",
        html: `
<p>Finds pages losing traffic and ranks them by how much is recoverable, so a refresh goes to
the page where it is worth the afternoon. Needs Search Console.</p>`,
      },
      {
        id: "experiments",
        h2: "Title tests and meta rewrites",
        html: `
<p>Title A/B tests rotate a page title and measure the effect on click-through using Search
Console data. The batch meta rewriter fixes descriptions across many pages at once rather
than one screen at a time.</p>`,
      },
    ],
  },

  {
    slug: "backlinks.html",
    keywords: "backlink link building outreach referring domains anchor broken link prospect disavow toxic",
    group: "Growth",
    title: "Backlinks and outreach",
    navTitle: "Backlinks",
    lede: "Honest coverage, and the workflow around earning links rather than counting them.",
    sections: [
      {
        id: "honest",
        h2: "Read this before you plan around it",
        html: `
<div class="warn"><strong>Backlink data is the weakest part of any free tool</strong>
<p>Building a link index means crawling a large share of the web continuously. Nobody does
that for free. This tool does not pretend otherwise: it shows the links it can genuinely
see, and tells you where they came from.</p></div>
<p>What it can see: links Google reports for sites you have verified in Search Console, links
you import from Ahrefs Webmaster Tools (free for your own verified sites), links found while
crawling, and anything you log yourself.</p>
<p>If you need a full competitor backlink profile, that needs a paid index. Pair this tool
with Ahrefs Webmaster Tools for your own sites and you cover most of what matters.</p>`,
      },
      {
        id: "outreach",
        h2: "Outreach",
        html: `
<p>Prospects, templates, what was sent, who replied and what was won — tracked so that the
link-building half of the job appears in the client report alongside everything else.</p>`,
      },
      {
        id: "broken",
        h2: "Broken links",
        html: `
<p>Finds broken links on your own site, and broken pages elsewhere that still have links
pointing at them — the basis of broken-link building.</p>`,
      },
    ],
  },

  {
    slug: "local-seo.html",
    keywords: "local seo google business profile gbp map pack citations nap reviews near me location city grid heatmap",
    group: "Growth",
    title: "Local SEO",
    lede: "For businesses with an address or a service area, where the map pack is the ranking that pays.",
    sections: [
      {
        id: "gbp",
        h2: "Google Business Profile",
        html: `
<p>Connect a profile to pull reviews, posts and photos, and to reply to reviews from here.
Replies go out under the business's name and are public, so drafts wait for approval unless
you say otherwise.</p>`,
      },
      {
        id: "rank",
        h2: "Rank by location",
        html: `
<p>Local rankings change street by street. Track a keyword from a specific city, or run a
grid across an area to see a heatmap of where you appear and where you do not.</p>`,
      },
      {
        id: "citations",
        h2: "Citations and NAP",
        html: `
<p>Checks your name, address and phone number across directories and flags where they
disagree — inconsistency is the quiet cause of a lot of local ranking trouble.</p>`,
      },
    ],
  },

  {
    slug: "competitors.html",
    keywords: "competitor rival compare benchmark share of voice brand mention monitoring",
    group: "Growth",
    title: "Competitors and brand",
    navTitle: "Competitors",
    lede: "Who you are actually up against in the results, and what they changed.",
    sections: [
      {
        id: "tracking",
        h2: "Tracking competitors",
        html: `
<p>Competitors are suggested from the searches you track and can be added by hand. For each,
the tool records what they rank for that you do not, what they published recently, and when
their key pages change.</p>`,
      },
      {
        id: "compare",
        h2: "Side-by-side",
        html: `
<p>Compare any two sites directly — technical health, structure, content and speed — which is
the fastest way to answer &ldquo;why do they outrank us&rdquo; with something specific.</p>`,
      },
      {
        id: "brand",
        h2: "Brand visibility",
        html: `
<p>Watches for mentions of your brand and your competitors', so you find the conversation
while replying to it is still useful.</p>`,
      },
    ],
  },

  {
    slug: "ai-visibility.html",
    keywords: "ai visibility chatgpt perplexity claude gemini ai overview llm citation llms.txt gptbot crawler geo aeo",
    group: "Growth",
    title: "AI visibility",
    lede:
      "Whether AI assistants mention you when someone asks about your topic — and, when they " +
      "do not, who they cite instead.",
    sections: [
      {
        id: "why",
        h2: "Why this is here",
        html: `
<p>A growing share of searches end in an answer rather than a list of links. If an assistant
answers without mentioning you, the click never happens, and no ranking report will show it.</p>`,
      },
      {
        id: "checks",
        h2: "What it checks",
        html: `
<p>It asks assistants your tracked questions and records whether you were mentioned, who was
cited, and which sources the answer leaned on.</p>
<div class="note"><strong>Memory is not search</strong>
<p>A model answering from training data is describing what it absorbed months ago — that is
not evidence about what AI search cites today. Every result is labelled with whether the
model actually searched the web, and the citation ranking counts only answers that did.</p></div>`,
      },
      {
        id: "bots",
        h2: "AI crawlers and llms.txt",
        html: `
<p>See which AI crawlers visit your site — verified against the IP ranges their owners
publish, so a scraper claiming to be GPTBot is not counted as one. Decide which to allow,
and generate the robots.txt to match.</p>`,
      },
    ],
  },

  // ───────────────────────────── Automation ─────────────────────────────
  {
    slug: "agent.html",
    keywords: "agent autopilot automatic fix apply autonomy undo revert wordpress plugin bridge write changes ai agent",
    group: "Automation",
    title: "The AI agent",
    navTitle: "AI agent",
    lede:
      "It reads your audits, decides what to fix, applies the fix to your live site, checks it " +
      "worked, and keeps an undo for every change.",
    sections: [
      {
        id: "control",
        h2: "You decide how much it may do",
        html: `
<table>
  <tr><th>Off</th><td>It does nothing.</td></tr>
  <tr><th>Suggest only <span class="pill">default</span></th><td>It plans the work and shows you. Nothing is written to a live site.</td></tr>
  <tr><th>Fix the obvious</th><td>Mechanical changes apply automatically. Judgement calls — anything touching article text — wait for you.</td></tr>
  <tr><th>Full autopilot</th><td>Everything applies, including content edits.</td></tr>
</table>
<p>Caps on changes per run and per day, plus a cooldown, apply at every level, so it cannot
work through your whole site in one go.</p>`,
      },
      {
        id: "undo",
        h2: "Everything is reversible",
        html: `
<p>Before writing anything, the previous value is read from the CMS and stored. One click puts
it back. <strong>If the previous value cannot be read, the change does not happen</strong> —
an unrevertable edit is not worth the risk.</p>
<p>&ldquo;Applied&rdquo; and &ldquo;verified&rdquo; are tracked separately, because a CMS
accepting a change is not the same as the change appearing on the page. The tool re-reads the
page to confirm.</p>`,
      },
      {
        id: "what",
        h2: "What it can fix by itself",
        html: `
<p>Currently <strong>29 of the 72 things the crawler can find</strong>. Titles, meta
descriptions, image alt text, canonical tags, robots directives, Open Graph and Twitter tags,
schema, redirects, internal links to orphan pages, site hardening, and your robots.txt AI
crawler policy.</p>
<p>The rest need a person, and the tool says so rather than pretending. Some are server
configuration, some belong to another platform's source code, and some — thin content — are
writing rather than a mechanical edit.</p>`,
      },
      {
        id: "requires",
        h2: "What it needs",
        html: `
<p>A way to write to your site. Today that is the WordPress bridge plugin, which also works
for WordPress sites behind Cloudflare. <a href="integrations.html#wordpress">Setting it up
&rarr;</a></p>
<p>Without it the agent still plans the work and writes the exact change — you apply it.</p>`,
      },
    ],
  },

  {
    slug: "automation.html",
    keywords: "automation schedule scheduler cron nightly daily weekly monitor alerts notifications slack email digest always on startup",
    group: "Automation",
    title: "Automation and monitoring",
    navTitle: "Automation",
    lede: "The checks that run without you, and the one thing that decides whether they run at all.",
    sections: [
      {
        id: "always-on",
        h2: "It only runs while the app is running",
        html: `
<div class="warn"><strong>The most important sentence on this page</strong>
<p>Scheduled work happens inside the app. If the app is closed — or the computer is off —
nothing runs. It is easy to close the window and wonder months later why nothing has
updated.</p></div>
<p>Two ways to deal with it:</p>
<ul>
  <li><strong>Start it with your computer.</strong> The installer offers this; say yes, and it
  runs whenever you are logged in.</li>
  <li><strong>Put it on a machine that stays on.</strong> A $5/month VPS or a free-tier cloud
  box runs the nightly work regardless of whether your laptop is open.</li>
</ul>`,
      },
      {
        id: "nightly",
        h2: "What runs on a schedule",
        html: `
<p>Audits refresh when they go stale, rankings update, pages are watched for changes, the
Business Profile is checked, backlinks sync, and a set of technical checks sweeps every client
and records what it finds — so a problem is waiting for you rather than waiting to be
discovered.</p>
<p>Heavier checks that have to crawl run weekly instead of nightly. Anything needing a paid
quota is deliberately excluded.</p>`,
      },
      {
        id: "alerts",
        h2: "Alerts and digests",
        html: `
<p>Traffic drops, ranking falls, pages that change, certificates about to expire, and sites
that go down. Delivered by email, Slack, Discord or Teams, plus a weekly digest.</p>`,
      },
      {
        id: "monitor",
        h2: "Page monitoring",
        html: `
<p>Watches your important pages and tells you when a title, description, heading, robots
directive or structured data changes — including when a page starts returning an error. Each
change is rated by how much it matters.</p>`,
      },
    ],
  },

  // ───────────────────────────── Connections ─────────────────────────────
  {
    slug: "integrations.html",
    keywords: "connect integration google search console analytics ga4 oauth api key wordpress plugin bing shopify webflow ollama openai gemini groq provider",
    group: "Connections",
    title: "Connections",
    lede:
      "Nothing is required — the tool works with no connections at all. Each one you add " +
      "replaces a guess with a fact.",
    sections: [
      {
        id: "gsc",
        h2: "Google Search Console",
        html: `
<p><span class="pill pill-free">Free</span> The highest-value connection by a distance. It
gives real ranking positions, the queries you actually appear for, impressions and clicks,
index status, and the data behind quick wins, cannibalisation and traffic alerts.</p>
<ol class="steps">
  <li><strong>Open Settings &rarr; Connect accounts</strong></li>
  <li><strong>Sign in with Google</strong><p>Read-only access. The tool cannot change anything
  in your Search Console.</p></li>
  <li><strong>Pick the property for each client</strong><p>Match the site to its verified
  property. A domain property covers every subdomain.</p></li>
</ol>
<p>There is also a service-account route for servers with no browser.</p>`,
      },
      {
        id: "ga4",
        h2: "Google Analytics 4",
        html: `
<p><span class="pill pill-free">Free</span> Adds sessions, conversions and behaviour, so
reports can show what the traffic did rather than only that it arrived.</p>`,
      },
      {
        id: "wordpress",
        h2: "WordPress",
        html: `
<p><span class="pill pill-free">Free</span> The bridge plugin is what lets the agent apply
fixes to a live site and undo them.</p>
<ol class="steps">
  <li><strong>Find the plugin</strong><p>It ships with the app, at
  <code>_system/wordpress-plugin/seo-tool-bridge.php</code>.</p></li>
  <li><strong>Upload it to the site</strong><p>WordPress admin &rarr; Plugins &rarr; Add New
  &rarr; Upload, then activate.</p></li>
  <li><strong>Paste the key</strong><p>The plugin shows a connection key. Paste it into the
  client's WordPress panel in the tool.</p></li>
</ol>
<div class="note"><strong>Keep the plugin current</strong>
<p>Older versions saved some changes without rendering them on the page. The app tells you
when a capability needs a newer plugin rather than failing quietly.</p></div>`,
      },
      {
        id: "ai",
        h2: "AI providers",
        html: `
<p><span class="pill pill-key">Your key</span> Optional. Used for explanations, written fixes,
content help and report summaries.</p>
<table>
  <tr><th>Free tiers</th><td>Gemini, Groq, OpenRouter, DeepSeek — a key takes about two minutes</td></tr>
  <tr><th>Local</th><td>Ollama — completely offline, nothing leaves the machine</td></tr>
  <tr><th>Paid</th><td>OpenAI, Anthropic — your key, billed to you directly</td></tr>
</table>
<p>Each tool says what it costs before you run it, and there is a monthly spend cap.</p>`,
      },
      {
        id: "other",
        h2: "Everything else",
        html: `
<p>Bing Webmaster Tools for extra index and backlink data, Google Business Profile for local,
Slack / Discord / Teams / email for alerts, and Shopify and Webflow for non-WordPress sites.</p>`,
      },
    ],
  },

  {
    slug: "mcp.html",
    keywords: "mcp claude cursor claude desktop model context protocol token connector ai assistant chat",
    group: "Connections",
    title: "Use it from Claude or Cursor",
    navTitle: "Claude &amp; MCP",
    lede:
      "Point an AI assistant at your own SEO data and ask questions in plain English — against " +
      "your crawls, your rankings and your history, not a generic web search.",
    sections: [
      {
        id: "what",
        h2: "What this gives you",
        html: `
<p>Most SEO integrations wrap a single API. This one is backed by everything the tool already
stores — crawl findings, rank history from both sources, AI citations, Search Console, and
every change the agent made — joined together. &ldquo;Why did this page drop last month&rdquo;
needs all of it at once.</p>
<p>22 tools in total: reading your data, reading Search Console, and acting (running the
agent, applying a queued fix, replying to a review).</p>`,
      },
      {
        id: "setup",
        h2: "Connecting a local client",
        html: `
<p>Claude Desktop, Claude Code and Cursor run the server themselves — nothing is exposed and
no token is involved. Open <strong>Settings &rarr; AI connection</strong> and copy the
configuration shown there; it is filled in with your real paths already.</p>`,
      },
      {
        id: "remote",
        h2: "Connecting a chat app",
        html: `
<p>For connectors that need a URL, the tool can serve the same tools over HTTP. It stays off
until you generate a token.</p>
<p>Generate a <strong>read-only</strong> token for this. It reaches 15 of the 22 tools and
cannot run the agent or change your site — which is what you want for a token living in
someone else's settings screen. Requests are capped per token.</p>`,
      },
      {
        id: "safety",
        h2: "What it will not do",
        html: `
<p>An assistant cannot edit your site directly — there is no &ldquo;set the title&rdquo; tool.
Changes go through the agent, so your autonomy setting still decides what happens, and every
change keeps its undo.</p>
<p>Numbers come back with their source attached, and a movement calculated across two
different sources is reported as not comparable rather than as a confident figure.</p>`,
      },
    ],
  },

  // ───────────────────────────── Running it ─────────────────────────────
  {
    slug: "backup.html",
    keywords: "backup restore save data database db export move migrate transfer another computer update upgrade version",
    group: "Running it",
    title: "Backup, restore and updating",
    navTitle: "Backup &amp; updating",
    lede: "Everything you have is one file. Copying it is the whole backup strategy.",
    sections: [
      {
        id: "backup",
        h2: "Backing up",
        html: `
<p>Open the launcher and click <strong>Back up now</strong>. It writes a complete, consistent
snapshot next to your database — taken properly with SQLite rather than copying the file,
which would miss recent changes still in the write-ahead log.</p>
<p>The app also takes one automatically every day and keeps the last several.</p>
<div class="tip"><strong>Before anything risky</strong>
<p>Take a backup before an update, before a big agent run, and before anything you would
regret. It takes a second.</p></div>`,
      },
      {
        id: "restore",
        h2: "Restoring",
        html: `
<p>Pick a backup in the launcher and click <strong>Restore</strong>. It stops the app, copies
your current database aside first so a wrong choice is undoable, swaps the file, and tells you
to start again.</p>`,
      },
      {
        id: "moving",
        h2: "Moving to another computer",
        html: `
<p>Copy the whole folder across and run the launcher there. Your clients, audits and settings
come with it. Nothing is tied to the machine.</p>`,
      },
      {
        id: "updating",
        h2: "Updating",
        html: `
<p><strong>Update to latest</strong> in the control panel pulls the newest version and
rebuilds. Your data is never touched by an update, and database changes are applied
automatically on the next start.</p>`,
      },
    ],
  },

  {
    slug: "troubleshooting.html",
    keywords: "troubleshoot problem error crash broken not working fails wont start blank page port in use stuck help fix issue",
    group: "Running it",
    title: "Troubleshooting",
    lede: "The things that actually go wrong, and what to do about them.",
    sections: [
      {
        id: "install",
        h2: "It will not install or start",
        html: `
<h3>&ldquo;Some files are missing&rdquo;</h3>
<p>The ZIP was only half extracted. Extract it again, keeping every file together, and open
the launcher from the extracted folder — not from inside the ZIP.</p>

<h3>Nothing happens when I double-click the launcher</h3>
<p>Windows blocks files downloaded from the internet. Right-click the launcher &rarr;
<em>Properties</em> &rarr; tick <strong>Unblock</strong> &rarr; OK.</p>

<h3>Setup failed part-way</h3>
<p>Almost always no internet, or antivirus holding a file while it is being written. Open the
launcher and choose <strong>Set up again (repair)</strong>.</p>

<h3>The port is already in use</h3>
<p>Another program has it. The launcher picks a free port automatically; if you set one by
hand, choose a different one.</p>`,
      },
      {
        id: "data",
        h2: "Numbers look wrong or missing",
        html: `
<h3>No rankings at all</h3>
<p>Check Search Console is connected for that client. Without it, rankings come from a live
search, which search engines sometimes block — the tool reports that as a blocked check rather
than as &ldquo;not ranking&rdquo;, so look for that message.</p>

<h3>Nothing has updated for days</h3>
<p>Scheduled work only runs while the app is running. See
<a href="automation.html#always-on">Automation</a>.</p>

<h3>An AI feature says it needs a provider</h3>
<p>No AI key is connected. Settings &rarr; Connect accounts. Gemini and Groq are free.</p>`,
      },
      {
        id: "help",
        h2: "Getting help",
        html: `
<p>The control panel has <strong>Collect info for support</strong>, which gathers diagnostics
you can paste into an issue. Open one at
<a href="${REPO}/issues" rel="noopener">GitHub</a> — include what you expected, what happened,
and that diagnostic output.</p>`,
      },
    ],
  },

  {
    slug: "faq.html",
    keywords: "faq question limit limitation free cost price licence license commercial privacy data safe compare paid",
    group: "Running it",
    title: "Questions and limits",
    navTitle: "FAQ &amp; limits",
    lede: "Including the parts that are genuinely weaker than a paid tool.",
    sections: [
      {
        id: "cost",
        h2: "Is it really free?",
        html: `
<p>Yes. MIT licensed, no account, no tier, no per-seat charge, and nothing is resold to you.
You can use it for client work and charge for that work.</p>
<p>What can cost money, only if you choose it: a commercial SERP API for heavy daily rank
tracking, and paid AI models. Both are your own key, billed to you by that vendor.</p>`,
      },
      {
        id: "limits",
        h2: "Where it is weaker than Ahrefs or Semrush",
        html: `
<ul>
  <li><strong>Backlinks.</strong> No free tool has a real link index. You get what Search
  Console reports, what you import, and what crawling finds. See
  <a href="backlinks.html#honest">the detail</a>.</li>
  <li><strong>Keyword search volume.</strong> Precise volumes come from paid sources. The tool
  is strong on finding and grouping keywords, weaker on exact monthly numbers.</li>
  <li><strong>Rank tracking at scale.</strong> Fine for normal client work from Search
  Console. Hundreds of keywords checked daily from a live search needs a paid API.</li>
  <li><strong>It runs on your machine.</strong> If the machine is off, nothing runs.</li>
</ul>
<p>Where it is stronger: everything is joined together, nothing is metered, your data is
yours, and the agent actually applies fixes rather than only listing them.</p>`,
      },
      {
        id: "clients",
        h2: "Can I use it for client work?",
        html: `
<p>Yes — that is what it is for. Reports and the client portal are white-labelled, and the
licence permits commercial use without restriction.</p>`,
      },
      {
        id: "data",
        h2: "Who can see my data?",
        html: `
<p>Nobody. It runs on your computer and stores everything in one local file. There is no
account system and no server of ours involved. If you expose the app to the internet
yourself, set a password first.</p>`,
      },
      {
        id: "ai-needed",
        h2: "Do I need AI for it to be useful?",
        html: `
<p>No. Crawling, audits, rank tracking, monitoring, reports and the whole technical side work
with no AI at all. AI adds explanations, written fixes and summaries.</p>`,
      },
    ],
  },
];
