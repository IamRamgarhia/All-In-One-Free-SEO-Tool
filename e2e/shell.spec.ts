import { test, expect } from "@playwright/test";

/**
 * The app shell: navigation, theme, and the two client-side behaviours
 * that were rewritten from useState+useEffect to useSyncExternalStore.
 *
 * Those rewrites are exactly the kind of change SSR smoke tests can't
 * catch — the server HTML is identical either way; what changed is
 * whether the browser flashes the wrong state before correcting itself.
 */

test.describe("shell", () => {
  test("dashboard renders and the sidebar reaches the main sections", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/SEO Tool/i);

    if (isMobile) {
      // Desktop sidebar is hidden below md; the drawer is the nav.
      await page.getByRole("button", { name: "Open menu" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
    }

    const nav = isMobile ? page.getByRole("dialog") : page.locator("aside");
    for (const label of ["Clients", "Audits", "Tasks", "All tools"]) {
      await expect(nav.getByRole("link", { name: label })).toBeVisible();
    }
  });

  test("sidebar collapse survives a reload without flashing back open", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "Desktop-only control — the drawer has no collapse.");

    await page.goto("/");
    const sidebar = page.locator("aside").first();
    await expect(sidebar).toHaveClass(/w-\[260px\]/);

    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(sidebar).toHaveClass(/w-\[60px\]/);

    // The regression this guards: the old code hydrated from
    // localStorage in an effect, so on reload the sidebar rendered
    // expanded, committed, and only then snapped shut. Asserting on the
    // very first paint is what makes the difference observable.
    await page.reload();
    await expect(page.locator("aside").first()).toHaveClass(/w-\[60px\]/);
  });

  test("theme toggle cycles and persists", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");

    // Theme is a workspace setting in the database, not per-browser
    // state, so it carries over between tests. Read the current value
    // rather than assuming this test starts from "system".
    const before = await html.getAttribute("data-theme");

    const toggle = page.getByRole("button", {
      name: /Switch to (light|dark) theme|Match system theme/,
    });
    await expect(toggle).toBeVisible();
    await toggle.click();

    // Wait for the value to actually change — the server action has to
    // round-trip and revalidate before the attribute updates.
    await expect(html).not.toHaveAttribute("data-theme", before!);
    const after = await html.getAttribute("data-theme");
    expect(["light", "dark", "system"]).toContain(after);

    await page.reload();
    await expect(html).toHaveAttribute("data-theme", after!);
  });

  test("mobile drawer exposes grouped nav and filters it", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "Drawer only exists below md.");

    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    const drawer = page.getByRole("dialog");

    // Grouped, not the old flat list of 11 hardcoded links.
    await expect(drawer.getByText("Essentials", { exact: true })).toBeVisible();

    await drawer.getByLabel("Filter navigation").fill("report");
    await expect(drawer.getByRole("link", { name: /Reports/ })).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Clients" })).toHaveCount(0);
  });
});
