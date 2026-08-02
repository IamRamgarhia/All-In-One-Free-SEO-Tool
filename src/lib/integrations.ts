/**
 * Everything you can connect, in one definition.
 *
 * The problem this solves is not that any single setup flow was bad —
 * the AI provider catalog already carries genuinely good step-by-step
 * guidance. It's that they were scattered, so a user had to already know
 * a thing existed to go and set it up:
 *
 *   AI keys        Settings → AI
 *   Google         Settings → Google
 *   Bing           /tools/bing — one page out of ninety-six
 *   PageSpeed      an env var, documented nowhere in the UI
 *   WordPress      per-client, on the client's edit page
 *   Email          Settings → Email
 *
 * Nobody discovers that list. Worse, the backlink import I shipped told
 * people to add their Bing key "in Settings", where it isn't — I wrote
 * that copy without checking, and it would have sent every user hunting
 * through the wrong page.
 *
 * So: one catalog, one page, and every "you need a key for this" message
 * in the app links to the specific entry rather than to a generic
 * settings screen.
 *
 * Ordered by what a new user should do first. `whatYouGet` is written in
 * terms of what changes for them, not what the integration is — "your
 * rankings come from Google instead of being scraped" rather than
 * "enables the Search Console API".
 */

export type IntegrationTier =
  /** Genuinely free, no card, no trial. */
  | "free"
  /** Free tier that's enough for real use, paid above it. */
  | "free-tier"
  /** Costs money. Never required for anything core. */
  | "paid";

export type IntegrationStatus = "connected" | "not-connected" | "unknown";

export type Integration = {
  id: string;
  label: string;
  tier: IntegrationTier;
  /** Why a user would bother, in their terms. */
  whatYouGet: string[];
  /** What stays broken or degraded without it. Honest, not scary. */
  withoutIt: string;
  /** Roughly how long, so nobody starts something open-ended. */
  minutes: number;
  /** Where to go and get the credential. */
  keyUrl?: string;
  keyUrlLabel?: string;
  /** Numbered instructions. Short, imperative, no assumed knowledge. */
  steps: string[];
  /** Where in THIS app the value gets entered. */
  setupHref: string;
  setupLabel: string;
  /** Env var, for people who prefer configuring by file. */
  envVar?: string;
  /** Grouping on the hub page. */
  group: "start" | "data" | "publishing" | "delivery";
};

export const INTEGRATIONS: Integration[] = [
  {
    id: "ai",
    label: "An AI provider",
    tier: "free",
    minutes: 3,
    whatYouGet: [
      "The agent can write replacement titles and meta descriptions, not just tell you they're wrong",
      "Executive summaries on client reports",
      "The SEO chat and 'ask the tool' assistant",
      "Content briefs, blog drafts, and the AI audit",
    ],
    withoutIt:
      "Everything that finds problems still works. Anything that writes new wording is unavailable — the agent will flag a 102-character title but can't propose a shorter one.",
    keyUrl: "https://aistudio.google.com/apikey",
    keyUrlLabel: "Google AI Studio",
    steps: [
      "Open Google AI Studio and sign in with any Google account.",
      "Click 'Create API key', then 'Create API key in new project' if it asks.",
      "Copy the key — it starts with AIza.",
      "Paste it on the AI settings page and save.",
      "Groq is an equally good free alternative if you'd rather not use Google.",
    ],
    setupHref: "/settings#ai",
    setupLabel: "Add an AI key",
    envVar: "GEMINI_API_KEY",
    group: "start",
  },
  {
    id: "google",
    label: "Google Search Console + Analytics",
    tier: "free",
    minutes: 5,
    whatYouGet: [
      "Rankings come from Google's own data instead of being scraped — more accurate, and it can't be rate-limited",
      "Real clicks, impressions and CTR per query",
      "Quick wins: the keywords you rank 4th-15th for, where one push reaches page one",
      "Content decay detection — pages quietly losing traffic",
    ],
    withoutIt:
      "Rank tracking falls back to loading search results in a headless browser. It works, it's free, and it's slower and noisier than Google telling you directly.",
    keyUrl: "https://search.google.com/search-console",
    keyUrlLabel: "Google Search Console",
    steps: [
      "Make sure the site is verified in Search Console — if you can see its data there, you're set.",
      "Open the Google page below and click Connect.",
      "Sign in and approve read-only access.",
      "Pick which Search Console property belongs to which client.",
    ],
    setupHref: "/settings/google",
    setupLabel: "Connect Google",
    group: "start",
  },
  {
    id: "bing",
    label: "Bing Webmaster Tools",
    tier: "free",
    minutes: 2,
    whatYouGet: [
      "Backlinks — Microsoft shares their own link graph for sites you've verified, which is the best free backlink data available",
      "Real search volume on keyword research, measured rather than estimated",
      "Submit URLs to Bing for indexing",
    ],
    withoutIt:
      "Backlinks are limited to what you log by hand or import from a CSV, and keyword research has no volume figures to sort by.",
    keyUrl: "https://www.bing.com/webmasters",
    keyUrlLabel: "Bing Webmaster Tools",
    steps: [
      "Open Bing Webmaster Tools and sign in. You can import your sites straight from Search Console.",
      "Verify the site if it isn't already — Bing only shares link data for verified sites.",
      "Click the gear icon → Settings → API access → API key.",
      "Copy the key and paste it on the Bing page below.",
    ],
    setupHref: "/tools/bing",
    setupLabel: "Add the Bing key",
    group: "data",
  },
  {
    id: "pagespeed",
    label: "PageSpeed Insights",
    tier: "free",
    minutes: 2,
    whatYouGet: [
      "Higher rate limits on speed and Core Web Vitals checks",
      "Fewer 'try again later' errors when auditing several pages at once",
    ],
    withoutIt:
      "Speed checks still run — Google allows a small number of anonymous requests. You'll hit the limit if you audit a lot of pages in one go.",
    keyUrl: "https://developers.google.com/speed/docs/insights/v5/get-started",
    keyUrlLabel: "PageSpeed API docs",
    steps: [
      "Open the link below and click 'Get a Key'.",
      "Pick or create a Google Cloud project — the free quota is 25,000 requests a day.",
      "Copy the key and paste it on the AI settings page, under PageSpeed.",
    ],
    setupHref: "/settings#ai",
    setupLabel: "Add the PageSpeed key",
    envVar: "PAGESPEED_API_KEY",
    group: "data",
  },
  {
    id: "wordpress",
    label: "WordPress",
    tier: "free",
    minutes: 5,
    whatYouGet: [
      "The agent can apply fixes directly — titles, meta descriptions, alt text, schema",
      "Every change is logged with its previous value and undoable in one click",
      "Stop copying suggestions into WordPress by hand",
    ],
    withoutIt:
      "The agent still finds problems and turns them into tasks. It just can't act on them — you apply the fixes yourself.",
    steps: [
      "Install the companion plugin on the client's WordPress site.",
      "In the plugin settings, copy the generated key.",
      "Open the client's page in this app, then Edit, and paste it under WordPress.",
      "Use 'Test connection' to confirm before turning the agent up.",
    ],
    setupHref: "/clients",
    setupLabel: "Pick a client to connect",
    group: "publishing",
  },
  {
    id: "smtp",
    label: "Email delivery",
    tier: "free",
    minutes: 5,
    whatYouGet: [
      "Send reports to clients from this app",
      "Scheduled monthly reports that go out on their own",
      "Alerts when something drops",
    ],
    withoutIt:
      "Reports still generate and download as PDFs — you send them however you already do.",
    steps: [
      "Get SMTP details from your email provider (Gmail, Fastmail, your host, or a service like Resend).",
      "For Gmail you'll need an App Password, not your normal password.",
      "Enter the host, port, username and password on the email settings page.",
      "Send a test to yourself before relying on it.",
    ],
    setupHref: "/settings#email",
    setupLabel: "Set up email",
    group: "delivery",
  },
];

export const GROUP_LABELS: Record<Integration["group"], string> = {
  start: "Start here",
  data: "Better data",
  publishing: "Let it make changes",
  delivery: "Sending things out",
};

export const GROUP_BLURBS: Record<Integration["group"], string> = {
  start:
    "Two connections, both free, about eight minutes total. They make the biggest difference to what this tool can tell you.",
  data: "Optional, and each one improves a specific thing rather than the whole app.",
  publishing:
    "Only needed if you want the agent to fix things rather than just find them.",
  delivery: "Only needed if you want this app to send email for you.",
};

export function integrationById(id: string): Integration | undefined {
  return INTEGRATIONS.find((i) => i.id === id);
}

export const TIER_LABELS: Record<IntegrationTier, string> = {
  free: "Free",
  "free-tier": "Free tier",
  paid: "Paid",
};
