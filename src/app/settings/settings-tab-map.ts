import type { PageTab } from "@/components/shell/page-tabs";

/**
 * The five settings groups, and which sections each one owns.
 *
 * These are the groups the page's jump-link nav already used, kept
 * deliberately: anyone who learned that Privacy lives under "About"
 * does not have to learn it again.
 *
 * Shared between the tab UI and settings-tabs.test.ts, which checks
 * three things this file can otherwise get wrong silently:
 *   - every section rendered on the page is owned by exactly one tab
 *     (a section owned by none is hidden on every tab, and nothing
 *     throws — the setting simply becomes unreachable)
 *   - no section is claimed twice
 *   - every `settings#...` link in the app names a section that exists
 */
export const SETTINGS_TABS: readonly PageTab[] = [
  {
    id: "setup",
    label: "Setup",
    primary: true,
    sections: ["general", "ai", "google", "team", "email"],
  },
  { id: "brand", label: "Brand", sections: ["brand"] },
  { id: "power", label: "Power", sections: ["notify", "api", "data", "webhooks"] },
  {
    id: "advanced",
    label: "Advanced",
    sections: ["claude-code", "rank-sources", "browser", "ai-learning"],
  },
  { id: "about", label: "About", sections: ["install", "update", "privacy", "about"] },
] as const;
