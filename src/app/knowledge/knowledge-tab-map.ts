import type { PageTab } from "@/components/shell/page-tabs";

/**
 * The knowledge hub's five groups, and which sections each one owns.
 *
 * The page is ~1,240 lines of thirteen stacked guides. Its table of
 * contents stays above the tabs and keeps listing all thirteen, because
 * that overview is the reason someone opens this page — the tabs are for
 * reading one group without scrolling past four others, not for hiding
 * what is here. Clicking a contents link switches to the owning tab.
 *
 * Shared with page-tabs.test.ts, which fails the build if a section
 * belongs to no tab. That failure is silent otherwise: the guide stays
 * in the DOM, server-rendered, and invisible on every tab.
 */
export const KNOWLEDGE_TABS: readonly PageTab[] = [
  {
    id: "start",
    label: "Start here",
    primary: true,
    sections: ["playbooks", "free-courses", "ranking-signals"],
  },
  {
    id: "content",
    label: "Content",
    sections: [
      "topical-authority",
      "why-blog",
      "blogging-rules",
      "daily-rhythm",
    ],
  },
  { id: "speed", label: "Speed", sections: ["page-speed", "lcp"] },
  { id: "local", label: "Local", sections: ["gbp"] },
  {
    id: "authority",
    label: "Authority",
    sections: ["knowledge-graph", "rich-snippets", "eeat"],
  },
] as const;
