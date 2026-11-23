/**
 * The settings window: every section, in the order the left rail shows
 * them, grouped. One section is shown at a time, each at its own URL, so a
 * link can open the window on the right section.
 *
 * The page used to be one 800-line column with a jump list on top; the
 * list did not match the order of the sections below it, half of them
 * were English-only, and the ten sub-pages under /settings/* were reachable
 * only from a link inside one section or another.
 */

export type SettingsSectionId =
  | "profile"
  | "memory"
  | "general"
  | "ai"
  | "ai-usage"
  | "ai-learning"
  | "tools"
  | "google"
  | "serp"
  | "email"
  | "notifications"
  | "api"
  | "brand"
  | "team"
  | "data"
  | "backup"
  | "browser"
  | "edge"
  | "health"
  | "errors"
  | "privacy";

export type SettingsIconName =
  | "user"
  | "settings"
  | "sparkles"
  | "gauge"
  | "brain"
  | "wrench"
  | "plug"
  | "mail"
  | "bell"
  | "key"
  | "palette"
  | "users"
  | "database"
  | "archive"
  | "globe"
  | "cloud"
  | "activity"
  | "bug"
  | "shield"
  | "search";

export type SettingsNavItem = {
  id: SettingsSectionId;
  href: string;
  icon: SettingsIconName;
  /** Pages that redirect anyone but the owner: hidden from the rail for them. */
  ownerOnly?: boolean;
};

export type SettingsNavGroup = {
  id: "account" | "general" | "ai" | "tools" | "integrations" | "agency" | "system" | "about";
  items: SettingsNavItem[];
};

export const SETTINGS_NAV: SettingsNavGroup[] = [
  {
    // What belongs to the person, not the workspace (GsKnora's "Account").
    id: "account",
    items: [
      { id: "profile", href: "/settings/profile", icon: "user" },
      { id: "memory", href: "/settings/memory", icon: "brain" },
    ],
  },
  {
    id: "general",
    items: [{ id: "general", href: "/settings", icon: "settings" }],
  },
  {
    id: "ai",
    items: [
      { id: "ai", href: "/settings/ai", icon: "sparkles" },
      { id: "ai-usage", href: "/settings/ai-usage", icon: "gauge" },
      { id: "ai-learning", href: "/settings/ai-learning", icon: "brain" },
    ],
  },
  {
    id: "tools",
    items: [{ id: "tools", href: "/settings/tools", icon: "wrench" }],
  },
  {
    id: "integrations",
    items: [
      { id: "google", href: "/settings/google", icon: "plug", ownerOnly: true },
      { id: "serp", href: "/settings/serp", icon: "search", ownerOnly: true },
      { id: "email", href: "/settings/email", icon: "mail" },
      { id: "notifications", href: "/settings/notifications", icon: "bell" },
      { id: "api", href: "/settings/api", icon: "key" },
    ],
  },
  {
    id: "agency",
    items: [
      { id: "brand", href: "/settings/brand", icon: "palette" },
      { id: "team", href: "/settings/team", icon: "users" },
    ],
  },
  {
    id: "system",
    items: [
      { id: "data", href: "/settings/data", icon: "database" },
      { id: "backup", href: "/settings/backup", icon: "archive", ownerOnly: true },
      { id: "browser", href: "/settings/browser", icon: "globe" },
      { id: "edge", href: "/settings/edge", icon: "cloud", ownerOnly: true },
      { id: "health", href: "/settings/health", icon: "activity" },
      { id: "errors", href: "/settings/errors", icon: "bug" },
    ],
  },
  {
    id: "about",
    items: [{ id: "privacy", href: "/settings/privacy", icon: "shield" }],
  },
];

/**
 * Old anchors of the single-page layout. Links all over the app (error
 * messages, onboarding, the profile menu) still point at /settings#ai and
 * the like; the window sends them to the section's own URL.
 */
export const LEGACY_ANCHORS: Record<string, string> = {
  profile: "/settings/profile",
  ai: "/settings/ai",
  google: "/settings/google",
  integrations: "/settings/google",
  team: "/settings/team",
  email: "/settings/email",
  smtp: "/settings/email",
  language: "/settings",
  brand: "/settings/brand",
  notify: "/settings/notifications",
  api: "/settings/api",
  data: "/settings/data",
  browser: "/settings/browser",
  "ai-learning": "/settings/ai-learning",
  privacy: "/settings/privacy",
  about: "/settings/privacy",
};

/** The rail entry for a pathname: exact match, else the longest prefix. */
export function activeSettingsItem(pathname: string): SettingsNavItem | null {
  const items = SETTINGS_NAV.flatMap((g) => g.items);
  const exact = items.find((i) => i.href === pathname);
  if (exact) return exact;
  return (
    items
      .filter((i) => i.href !== "/settings" && pathname.startsWith(i.href + "/"))
      .sort((a, b) => b.href.length - a.href.length)[0] ?? null
  );
}
