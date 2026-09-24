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
    //
    // Scoped to the grid's category sections. The "most used" and
    // "recently run" rails above it are server-rendered from run history
    // and deliberately outside the filter, so counting every /tools/ link
    // on the page made this fail whenever any other spec left a tool run
    // behind — a failure that pointed at the filter and was nothing to do
    // with it.
    await filter.fill("zzzznotarealtool");
    await expect(
      page.locator("section[id^='cat-'] a[href^='/tools/']"),
    ).toHaveCount(0);
    await expect(page.getByText(/No tools match/)).toBeVisible();
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
  // Each route carries something only a working page renders. A status
  // code and an absent error boundary prove the server did not throw;
  // they do not prove the page produced anything. Next will happily
  // serve a 200 with an empty shell, and "renders without a server
  // error" passed on exactly that for months.
  // Each route carries the heading its own page renders. Asserting
  // against <body> would be worthless here: "Clients", "Tasks",
  // "Audits", "Reports" and "Settings" are all sidebar links, so an
  // empty page with a working sidebar would pass. These are matched
  // against the <h1> inside <main>, which only the page itself renders.
  const ROUTES: { path: string; heading: RegExp }[] = [
    { path: "/clients", heading: /^Clients$/ },
    { path: "/tasks", heading: /^Tasks$/ },
    { path: "/audits", heading: /^Audits$/ },
    { path: "/keywords", heading: /^Keywords$/ },
    { path: "/reports", heading: /^Reports$/ },
    { path: "/settings", heading: /^Settings$/ },
    { path: "/welcome", heading: /Get started/ },
    { path: "/automations/overview", heading: /what's manual/i },
    // The cross-client ranked list. It runs a query per client per
    // signal, so it is the page most likely to break on a schema change
    // and the one whose failure is least visible — an empty list looks
    // calm rather than broken.
    { path: "/morning", heading: /Morning briefing/i },
  ];


  // The dashboard is not in the list above because what it renders
  // depends on whether any clients exist — onboarding on an empty
  // install, the real dashboard once there is something to show. So
  // assert the weaker but state-independent thing: it rendered a
  // heading of its own. An empty frame has none.
  test("/ renders a heading of its own", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBeLessThan(400);
    const h1 = page.locator("main h1").first();
    await expect(h1).toBeVisible();
    await expect(h1).not.toHaveText("");
  });

  for (const route of ROUTES) {
    test(`${route.path} renders, and says something`, async ({ page }) => {
      const failures: string[] = [];
      page.on("pageerror", (e) => failures.push(e.message));

      const res = await page.goto(route.path);
      expect(
        res?.status(),
        `${route.path} returned ${res?.status()}`,
      ).toBeLessThan(400);

      // Next renders its error boundary with a 200, so status alone
      // isn't enough to know the page actually worked.
      await expect(
        page.getByText(/Application error|Something went wrong/i),
      ).toHaveCount(0);
      expect(failures, `${route.path} threw: ${failures.join("; ")}`).toEqual([]);

      // And the part that makes this more than a smoke test: the page's
      // own heading, inside main. A 200 with an empty frame fails here.
      await expect(
        page.locator("main h1").first(),
        `${route.path} loaded but never rendered its own heading`,
      ).toHaveText(route.heading);
    });
  }
});
