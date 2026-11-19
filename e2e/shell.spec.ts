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

  test("profile and mode toggle live in the top bar; the dot legend lives with its dots", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "No desktop rail below md.");

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const header = page.locator("header").first();
    const rail = page.locator("aside").first();

    // Profile and mode are genuinely global: one account, one
    // preference, same on every page. They belong in global chrome, and
    // asserting they are INSIDE <header> is the point — asserting they
    // exist on the page would pass with the old duplicate still sitting
    // at the foot of the rail.
    await expect(header.getByRole("button", { name: "Profile menu" })).toBeVisible();
    await expect(header.getByRole("button", { name: "Guided" })).toBeVisible();

    // The DOT LEGEND is not, and this assertion reversed on 19 Nov 2026.
    //
    // It was moved into the top bar because the foot of a collapsed
    // rail hid it. But the per-client tools panel renders its own copy
    // right above the column of dots it describes — so both existed,
    // and the top bar explained a colour code for dots that are not in
    // the top bar, on every page, including pages with no dots at all.
    //
    // A legend goes next to its dots. "/" has no tools panel, so there
    // is nothing here for it to explain and it should be absent
    // entirely — which is a stronger check than "not in the header",
    // because that would pass with it moved anywhere else on the page.
    await expect(page.getByText("Needs setup")).toHaveCount(0);

    // ...and neither control is duplicated in the rail. Both were in
    // two places at once before 30 Oct, with the two copies drifted
    // into different wording for the same switch.
    await expect(rail.getByText("Local user")).toHaveCount(0);
    await expect(rail.getByText(/Guided mode|Show all tools/)).toHaveCount(0);

    // The rail keeps its own route to settings, so dropping the footer
    // user block did not cost one.
    await expect(rail.getByRole("link", { name: "Settings" })).toBeVisible();
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
