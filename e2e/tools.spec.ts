import { test, expect } from "@playwright/test";

/**
 * The tools hub — search, and the pin behaviour that moved from
 * useState+useEffect to useSyncExternalStore.
 */

test.describe("tools hub", () => {
  test("lists tools and filters them", async ({ page }) => {
    await page.goto("/tools");
    await expect(
      page.getByRole("heading", { name: "Tools", exact: true }),
    ).toBeVisible();

    const filter = page.getByPlaceholder(/Filter tools/);
    await filter.fill("sitemap");
    await expect(page.getByRole("link", { name: /sitemap/i }).first()).toBeVisible();

    // A term no tool matches should empty the grid rather than silently
    // showing everything — the failure mode of a broken filter.
    await filter.fill("zzzznotarealtool");
    await expect(page.locator("a[href^='/tools/']")).toHaveCount(0);
  });

  test("pinned tools survive a reload", async ({ page, isMobile }) => {
    test.skip(isMobile, "Pin buttons are hover-revealed on desktop only.");

    await page.goto("/tools");
    const filter = page.getByPlaceholder(/Filter tools/);
    const pinnedHeading = page.getByRole("heading", { name: /^Pinned/ });

    // Start clean — pins live in localStorage and persist across tests.
    await page.evaluate(() => window.localStorage.removeItem("seo:tools-pinned"));
    await page.reload();
    await expect(pinnedHeading).toHaveCount(0);

    await filter.fill("robots");
    await page.getByRole("button", { name: "Pin tool" }).first().click();

    // The pinned rail is deliberately hidden while a filter is active —
    // the filtered grid takes over the viewport — so clear it first.
    await filter.fill("");
    await expect(pinnedHeading).toBeVisible();

    // Same regression shape as the sidebar: the old code rendered zero
    // pins, committed, then re-rendered with the real set, so pinned
    // tools visibly jumped to the top a beat after load.
    await page.reload();
    await expect(pinnedHeading).toBeVisible();
  });
});

test.describe("core routes", () => {
  // Cheap breadth: every one of these is a top-level destination, and a
  // 500 on any of them is the kind of thing that shipped unnoticed
  // before there were tests at all (/tasks could not render for months).
  const ROUTES = [
    "/",
    "/clients",
    "/tasks",
    "/audits",
    "/keywords",
    "/tools",
    "/reports",
    "/settings",
    "/welcome",
    "/automations/overview",
  ];

  for (const route of ROUTES) {
    test(`${route} renders without a server error`, async ({ page }) => {
      const failures: string[] = [];
      page.on("pageerror", (e) => failures.push(e.message));

      const res = await page.goto(route);
      expect(res?.status(), `${route} returned ${res?.status()}`).toBeLessThan(400);

      // Next renders its error boundary with a 200, so status alone
      // isn't enough to know the page actually worked.
      await expect(
        page.getByText(/Application error|Something went wrong/i),
      ).toHaveCount(0);
      expect(failures, `${route} threw: ${failures.join("; ")}`).toEqual([]);
    });
  }
});
