/**
 * Step-by-step guides for the docs section.
 *
 * Deliberately short. Each step is one action and, where it helps, one
 * line saying what you should see — so you can tell whether it worked
 * without reading a paragraph to find out.
 *
 * Tool descriptions are NOT duplicated here; the docs read those from
 * tool-capabilities.generated.ts, which is derived from the tools grid.
 */

export type DocStep = {
  /** The action. Imperative, one line. */
  do: string;
  /** What you should see, or the one thing worth knowing. Optional. */
  then?: string;
};

export type DocGuide = {
  slug: string;
  title: string;
  /** One line. Shown on the card and under the heading. */
  summary: string;
  minutes: number;
  group: "Start here" | "Daily work" | "Clients" | "Running it";
  steps: DocStep[];
  /** Tool routes this guide links to. Checked by a test — no dead links. */
  related?: string[];
  /** Anything genuinely worth flagging. Kept rare so it stays read. */
  note?: string;
};

export const DOC_GUIDES: DocGuide[] = [
  {
    slug: "install",
    title: "Install and start it",
    summary: "Download, double-click one file, and you are running.",
    minutes: 5,
    group: "Start here",
    steps: [
      {
        do: "Download the ZIP from the releases page and unzip it anywhere.",
        then: "One folder, and one file you need: SEO Tool.cmd on Windows, SEO Tool.command on Mac.",
      },
      {
        do: "Double-click that file.",
        then: "A control panel opens in your browser. The first run installs and builds — 3 to 5 minutes, once.",
      },
      {
        do: "Click Start.",
        then: "The app opens on its own port and stays there.",
      },
      {
        do: "Use Add to Desktop in the control panel.",
        then: "From then on it is one click from your desktop.",
      },
    ],
    note: "Node 20 or newer must be installed. Nothing else — no database to set up, no API keys.",
  },
  {
    slug: "first-client",
    title: "Add your first website",
    summary: "What happens when you click Add client, and what to do while it works.",
    minutes: 8,
    group: "Start here",
    steps: [
      { do: "Go to Clients and click Add client." },
      {
        do: "Paste the website URL and give it a name.",
        then: "Everything else is optional. Niche can be left blank.",
      },
      {
        do: "Click Add client.",
        then: "You land on the onboarding wizard in about half a second. You are never left waiting.",
      },
      {
        do: "Watch the bar at the top — Checking your site.",
        then: "A full crawl runs in the background while you fill in the steps below it. On a 25-page site it takes about a minute.",
      },
      { do: "Fill in the brand step, then run keyword discovery." },
      {
        do: "Generate the 30-day plan on the last step.",
        then: "Tasks are created with due dates, grouped into weeks.",
      },
      {
        do: "Click Create the approval document.",
        then: "A PDF for the client: what was found, where their keywords stand today, and what happens in which week.",
      },
    ],
    related: ["/clients", "/audits", "/tasks", "/proposals"],
  },
  {
    slug: "connect-ai",
    title: "Connect AI, or don't",
    summary: "Most of the tool needs no AI at all. Here is what the rest needs.",
    minutes: 4,
    group: "Start here",
    steps: [
      {
        do: "Open Settings and find AI connection.",
        then: "Anything tagged free in the sidebar or on a tool card already works, with nothing connected.",
      },
      {
        do: "Pick how you want to connect.",
        then: "An API key, or the Claude / ChatGPT subscription you already pay for, over MCP. Both drive exactly the same tools.",
      },
      {
        do: "For a subscription: copy the config block, paste it into Claude Desktop, Claude Code or Cursor, and restart it.",
        then: "Your chat app connects to this tool. Your subscription does the writing; nothing is charged per use.",
      },
      {
        do: "For a key: paste it into any provider. Gemini and Groq have free tiers.",
        then: "Keys are encrypted and stored on your own machine.",
      },
    ],
    note: "One real difference. A subscription only writes while you are at the keyboard, so anything unattended — overnight audits, scheduled reports, alerts — needs a key.",
    related: ["/settings", "/connect"],
  },
  {
    slug: "audit",
    title: "Audit a site and fix what it finds",
    summary: "Crawl, read the findings by severity, then fix them.",
    minutes: 10,
    group: "Daily work",
    steps: [
      {
        do: "Open Audits and pick a client, or run a one-off from the health check tool.",
      },
      {
        do: "Click Run audit.",
        then: "Up to 25 pages by default, respecting robots.txt.",
      },
      {
        do: "Read the findings top-down — critical first.",
        then: "Each says what it is, why it matters, and which URLs are affected.",
      },
      {
        do: "Open a finding and use the fix wizard where one is offered.",
        then: "You get the exact change for your platform, ready to copy.",
      },
      {
        do: "Mark anything that does not apply as ignored or a false positive.",
        then: "That decision carries forward — re-running will not resurrect it.",
      },
      {
        do: "Re-run the audit to confirm.",
        then: "Compare against the previous run to see what actually moved.",
      },
    ],
    related: [
      "/audits",
      "/tools/health-check",
      "/tools/link-checker",
      "/tools/redirects-bulk",
    ],
  },
  {
    slug: "keywords",
    title: "Find and track keywords",
    summary: "Discover, track, and spot the ones close to page one.",
    minutes: 8,
    group: "Daily work",
    steps: [
      { do: "Open Keywords for a client." },
      {
        do: "Run discovery from a seed word or from the site itself.",
        then: "Suggestions come from Google autocomplete, People Also Ask and related searches. No key needed.",
      },
      { do: "Select the ones worth tracking and add them." },
      {
        do: "Let ranks build up over a few days.",
        then: "Positions are checked in a real browser — slower than a paid API, and free.",
      },
      {
        do: "Check the quick wins view.",
        then: "Anything at 11 to 20 is one good change away from page one.",
      },
    ],
    related: [
      "/keywords",
      "/tools/search-volume",
      "/tools/cluster",
      "/tools/cannibalization",
    ],
  },
  {
    slug: "client-report",
    title: "Send a client something to approve",
    summary: "One document: findings, starting position, and the plan by week.",
    minutes: 6,
    group: "Clients",
    steps: [
      {
        do: "Finish onboarding for the client, or run an audit and generate a 30-day plan.",
        then: "The document is built from real findings — it refuses to generate from nothing.",
      },
      { do: "Click Create the approval document." },
      {
        do: "Open the PDF and read it.",
        then: "Findings by severity, keywords tracked and where they rank today, and week-by-week work.",
      },
      {
        do: "Edit the opening paragraph, and add pricing if you charge.",
        then: "Pricing starts empty — the tool has no basis for pricing your labour.",
      },
      {
        do: "Send it, then mark it accepted when they agree.",
        then: "The starting numbers are frozen in, so next month's report has something to be measured against.",
      },
    ],
    related: ["/proposals", "/reports"],
  },
  {
    slug: "monthly-report",
    title: "Produce the monthly report",
    summary: "Every number is already collected. You are only choosing a shape.",
    minutes: 5,
    group: "Clients",
    steps: [
      { do: "Open Reports and choose the client and the period." },
      {
        do: "Pick a template.",
        then: "Executive, detailed, technical, or a stakeholder variant — same data, different framing.",
      },
      {
        do: "Review the summary and edit it.",
        then: "Numbers come from the database. Only the wording is AI-written, and only if you connected AI.",
      },
      {
        do: "Export the PDF, or send a portal link so the client sees it live.",
      },
    ],
    related: ["/reports", "/reports/batch"],
  },
  {
    slug: "update-backup",
    title: "Update, back up, move machines",
    summary: "All three from the control panel. No terminal.",
    minutes: 4,
    group: "Running it",
    steps: [
      {
        do: "Double-click SEO Tool.cmd (or .command) to open the control panel.",
      },
      {
        do: "Click Update.",
        then: "Pulls the latest version and rebuilds. Your database is untouched.",
      },
      {
        do: "Click Backup before anything risky.",
        then: "Writes a timestamped copy of the database into backups/.",
      },
      {
        do: "To move machines: back up, copy the whole folder across, double-click the same file there.",
        then: "Everything lives in that folder. Nothing is installed anywhere else.",
      },
    ],
    note: "Your data never leaves the machine. There is no account, and no server to sync with.",
  },
];

export const GUIDE_GROUPS = [
  "Start here",
  "Daily work",
  "Clients",
  "Running it",
] as const;

export function guideBySlug(slug: string): DocGuide | null {
  return DOC_GUIDES.find((g) => g.slug === slug) ?? null;
}
