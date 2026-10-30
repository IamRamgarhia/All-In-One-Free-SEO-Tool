import { test, expect } from "@playwright/test";

/**
 * The help button is added once, in PageHeader, and therefore appears on
 * 192 screens — 195 render PageHeader, and /docs, /learn and /welcome
 * opt out because they are the help. That is exactly the kind of change
 * that is easy to break
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

  test("every tool deep-links to its own row in the reference", async ({ page }) => {
    /**
     * All ~92 tools share one generated reference page, so a link to
     * the page alone drops the reader at the top of a table of ninety
     * rows to find their own.
     *
     * A sweep on 30 Oct 2026 found 18 tools with no help link at all:
     * they hand-roll their header instead of using PageHeader, which is
     * where HelpLink lives, so the whole feature was simply absent and
     * nothing said so. These four are two from each group — two that
     * always had it, two that did not — so this fails if either idiom
     * loses the button again.
     */
    for (const slug of ["geo-swot", "meta-tag-generator", "headers", "schema"]) {
      await page.goto(`/tools/${slug}`);
      const help = page.getByRole("link", { name: /help for this screen/i }).first();
      await expect(help, `/tools/${slug} has no help link`).toBeVisible();
      expect(
        await help.getAttribute("href"),
        `/tools/${slug} should link to its own anchor`,
      ).toContain(`tools.html#tool-${slug}`);
    }
  });

  test("screens that are themselves an explanation do not offer one", async ({ page }) => {
    await page.goto("/docs");
    await expect(
      page.getByRole("link", { name: /help for this screen/i }),
    ).toHaveCount(0);
    // It offers the full handbook instead.
    await expect(page.getByRole("link", { name: /full handbook/i })).toBeVisible();
  });
});
