import type { PageTab } from "@/components/shell/page-tabs";

/**
 * The per-client page's five groups.
 *
 * Unlike Settings and the knowledge hub, the sections here are not
 * individually addressable: most of this page's direct children are
 * components (DailyAutomationCard, WpBridgePanel, ShareCard), bare
 * conditionals, or a Suspense boundary that renders no element of its
 * own. Giving each one an id would mean editing a dozen other files to
 * thread it down to the right root element.
 *
 * So each tab owns one wrapper div instead, and the groups are
 * contiguous runs of the existing page order. Nothing was reordered to
 * make them fit — on a 1,315-line file that is where the damage would
 * have come from, and a tab whose contents are in a slightly odd group
 * is a much smaller problem than a card that silently stopped
 * rendering.
 *
 * Checked by page-tabs.test.ts: every wrapper the page renders is owned
 * by exactly one tab, and no tab names a wrapper that does not exist.
 */
export const CLIENT_TABS: readonly PageTab[] = [
  {
    id: "client-overview",
    label: "Overview",
    primary: true,
    // Hero + score, what to do next, the stats row, daily automation.
    sections: ["client-overview-panel"],
  },
  {
    id: "client-google",
    label: "Google",
    // Property links, then the live GA4 / Ads / GSC reads and the
    // snapshot sparklines those feed.
    sections: ["client-google-panel"],
  },
  {
    id: "client-site",
    label: "Site",
    // WordPress bridge, scheduled reports, tech stack, niche, checklist.
    sections: ["client-site-panel"],
  },
  {
    id: "client-audits",
    label: "Audits",
    sections: ["client-audits-panel"],
  },
  {
    id: "client-manage",
    label: "Manage",
    // Client portal sharing, and deleting the client.
    sections: ["client-manage-panel"],
  },
] as const;
