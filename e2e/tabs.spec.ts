import { test, expect } from "@playwright/test";

/**
 * Tabs, in a real browser.
 *
 * page-tabs.test.ts checks the maps against the page source — that every
 * section is owned and no tab points at nothing. It cannot tell you
 * whether the generated stylesheet actually hides anything, because that
 * only happens once a browser applies the CSS. The whole mechanism is
 * one generated `#panel[data-tab=x] > :not(#a):not(#b){display:none}`
 * rule, and if the selector is wrong every section shows on every tab:
 * the page looks like it did before tabs, nothing errors, and the tab
 * bar is decoration.
 *
 * The deep-link half is worth its own checks because it fails the other
 * way — a section that stays hidden when something links straight to it
 * is a setting the user cannot reach at all.
 */

test.describe("settings tabs", () => {
  test("shows one group at a time", async ({ page }) => {
    await page.goto("/settings");

    // Setup is the default tab, so its sections are the visible ones.
    await expect(page.locator("#ai")).toBeVisible();
    await expect(page.locator("#google")).toBeVisible();
    // ...and a section from another tab is not merely further down the
    // page, it is hidden. This is the assertion that fails if the CSS
    // selector is wrong.
    await expect(page.locator("#privacy")).toBeHidden();
    await expect(page.locator("#brand")).toBeHidden();

    await page.getByRole("tab", { name: "Brand" }).click();
    await expect(page.locator("#brand")).toBeVisible();
    await expect(page.locator("#ai")).toBeHidden();

    await page.getByRole("tab", { name: "About" }).click();
    await expect(page.locator("#privacy")).toBeVisible();
    await expect(page.locator("#brand")).toBeHidden();
  });

  test("a deep link opens the tab that owns the section", async ({ page }) => {
    // The browser's own jump-to-anchor has already failed by the time
    // React mounts, because the target was display:none when it tried.
    for (const [hash, tab] of [
      ["privacy", "About"],
      ["brand", "Brand"],
      ["notify", "Power"],
      ["browser", "Advanced"],
    ] as const) {
      await page.goto(`/settings#${hash}`);
      await expect(page.locator(`#${hash}`)).toBeVisible();
      await expect(page.getByRole("tab", { name: tab })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    }
  });

  test("switching tabs drops a stale hash", async ({ page }) => {
    // Otherwise a reload bounces the reader back to the tab they left.
    await page.goto("/settings#privacy");
    await expect(page.locator("#privacy")).toBeVisible();
    await page.getByRole("tab", { name: "Brand" }).click();
    expect(new URL(page.url()).hash).toBe("");
  });
});

test.describe("knowledge hub tabs", () => {
  test("shows one group at a time", async ({ page }) => {
    await page.goto("/knowledge");
    await expect(page.locator("#ranking-signals")).toBeVisible();
    await expect(page.locator("#gbp")).toBeHidden();

    await page.getByRole("tab", { name: "Local" }).click();
    await expect(page.locator("#gbp")).toBeVisible();
    await expect(page.locator("#ranking-signals")).toBeHidden();
  });

  test("the contents list reaches sections on other tabs", async ({ page }) => {
    // The table of contents stays outside the tabs and still lists all
    // thirteen guides. Clicking one is a same-page hash change, which
    // fires no mount — the first version of the tabs component only
    // looked at the hash on mount, so these links updated the URL and
    // did nothing at all.
    await page.goto("/knowledge");
    await expect(page.locator("#gbp")).toBeHidden();

    await page
      .getByRole("link", { name: /Google Business Profile — full playbook/ })
      .click();

    await expect(page.locator("#gbp")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Local" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
