import { test, expect } from "@playwright/test";

/**
 * The help button is added once, in PageHeader, and therefore appears on
 * 195 screens. That is exactly the kind of change that is easy to break
 * later without noticing — a header refactor, a stray conditional — and
 * nobody files a bug for "the help link is gone".
 *
 * So: it is there, it goes somewhere different depending on the screen,
 * and it opens in a new tab.
 */

test.describe("help link", () => {
  const CASES = [
    { path: "/audits", page: "audits.html" },
    { path: "/keywords", page: "keywords.html" },
    { path: "/reports", page: "reports.html" },
    { path: "/tools", page: "tools.html" },
    { path: "/settings", page: "integrations.html" },
  ];

  for (const c of CASES) {
    test(`${c.path} links to ${c.page}`, async ({ page }) => {
      await page.goto(c.path);
      const help = page.getByRole("link", { name: /help for this screen/i }).first();
      await expect(help).toBeVisible();
      const href = await help.getAttribute("href");
      expect(href, `${c.path} should link to ${c.page}`).toContain(c.page);
      // Mid-task is the usual moment someone needs this, so losing the
      // screen they were on would make things worse.
      expect(await help.getAttribute("target")).toBe("_blank");
      expect(await help.getAttribute("rel")).toContain("noopener");
    });
  }

  test("screens that are themselves an explanation do not offer one", async ({ page }) => {
    await page.goto("/docs");
    await expect(
      page.getByRole("link", { name: /help for this screen/i }),
    ).toHaveCount(0);
    // It offers the full handbook instead.
    await expect(page.getByRole("link", { name: /full handbook/i })).toBeVisible();
  });
});
