/**
 * The WordPress plugin tells people where to paste the key. That place
 * has to exist.
 *
 * MEASURED 19 Nov 2026: the plugin's admin page said
 *
 *   "Paste this into SEO Tool → Settings → CMS connections."
 *
 * and there was no CMS connections anywhere in Settings. The fields were
 * on the client page's Site tab — reachable, but only if you already
 * knew. The maintainer installed the plugin on his own site, read that
 * line, went to Settings, and could not find where the key goes.
 *
 * It is worth being precise about the cost: that one paste is the step
 * the entire one-click-fix feature depends on. Without it the agent can
 * plan fixes and never apply one, which is exactly the state this
 * install had been in — 14 approved fixes queued with nowhere to go.
 *
 * The plugin ships separately from the app and updates on its own
 * schedule, so these two texts drift by default. This test is the only
 * thing connecting them.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SETTINGS_TABS } from "@/app/settings/settings-tab-map";

const ROOT = process.cwd();
const PLUGIN = readFileSync(
  join(ROOT, "wordpress-plugin/seo-tool-bridge.php"),
  "utf8",
);
const SETTINGS_PAGE = readFileSync(
  join(ROOT, "src/app/settings/page.tsx"),
  "utf8",
);

/** Every section id the settings tab map owns. */
function ownedSections(): string[] {
  return SETTINGS_TABS.flatMap((t) => [...t.sections]);
}

describe("the plugin's instruction names a real place", () => {
  it("the plugin does tell the user where to go", () => {
    // If this stops matching, the assertions below pass vacuously — and
    // the plugin would then be telling people nothing at all, which is
    // its own bug.
    expect(PLUGIN).toMatch(/Paste this into SEO Tool/);
  });

  it("names Settings → CMS connections, and that section exists", () => {
    expect(PLUGIN).toContain("Settings → CMS connections");

    // The section is rendered…
    expect(
      SETTINGS_PAGE,
      'settings/page.tsx has no `id="cms"` section',
    ).toMatch(/id="cms"/);

    // …and owned by a tab. A section owned by none is hidden on every
    // tab and nothing throws: the setting simply becomes unreachable,
    // which is the same outcome as not building it.
    expect(
      ownedSections(),
      "the cms section is not claimed by any settings tab, so it renders on none",
    ).toContain("cms");
  });

  it("the section carries a heading the user can match to the plugin", () => {
    // Someone reading "CMS connections" in WordPress has to see those
    // words in Settings. "Sites" or "Integrations" would be a different
    // instruction.
    expect(SETTINGS_PAGE).toContain("CMS connections");
  });

  it("the plugin download link is the one place that owns the URL", () => {
    // The settings section links the zip; repo.ts owns the URL. A second
    // hardcoded github.com/... link here is how the pre-rename name
    // survived in 20 places.
    const section = readFileSync(
      join(ROOT, "src/app/settings/cms-connections.tsx"),
      "utf8",
    );
    expect(section).toContain("WP_PLUGIN_ZIP_URL");
    expect(
      section.replace(/WP_PLUGIN_ZIP_URL/g, ""),
      "a hardcoded GitHub URL — use WP_PLUGIN_ZIP_URL from lib/repo",
    ).not.toMatch(/https:\/\/github\.com\//);
  });

  it("reuses the client page's panel instead of a second form", () => {
    // Two connection forms that can drift is this project's
    // most-repeated bug. One component, rendered in both places.
    const section = readFileSync(
      join(ROOT, "src/app/settings/cms-connections.tsx"),
      "utf8",
    );
    expect(section).toContain("WpBridgePanel");
    expect(
      section,
      "a second <form> here means two connection screens to keep in step",
    ).not.toMatch(/<form\b/);
  });
});
