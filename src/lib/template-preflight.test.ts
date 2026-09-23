import { describe, it, expect } from "vitest";
import {
  CHECKED_TEMPLATE_TITLES,
  canonicalOf,
  internalLinks,
  jsonLdTypes,
  splitTemplatesByState,
  templateSatisfied,
  type SiteFacts,
} from "./template-preflight";
import { STACK_LABELS, getTemplatesByKey } from "./tech-stack-templates";
import { nicheTemplates } from "./niche-templates";

function facts(overrides: Partial<SiteFacts> = {}): SiteFacts {
  const html = overrides.html ?? "<html><head></head><body></body></html>";
  return {
    requestedUrl: "https://example.com/",
    finalUrl: "https://example.com/",
    reachable: true,
    status: 200,
    html,
    headers: {},
    pages: [{ url: "https://example.com/", status: 200, html }],
    robotsTxt: null,
    sitemap: null,
    directoryListing: null,
    staticAsset: null,
    alpn: null,
    httpsRedirect: null,
    fetchedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("the check table matches the templates it claims to check", () => {
  // A check keyed to a title that no longer exists is a check that stops
  // running, silently, and the task it was meant to suppress comes back.
  // This is the pair-drift failure that has already happened twice in
  // this codebase, so it gets a test rather than a convention.
  it("every checked title is a real template title", () => {
    const real = new Set<string>();
    for (const key of Object.keys(STACK_LABELS) as (keyof typeof STACK_LABELS)[]) {
      for (const t of getTemplatesByKey(key)) real.add(t.title);
    }
    for (const list of Object.values(nicheTemplates)) {
      for (const t of list) real.add(t.title);
    }

    const orphans = CHECKED_TEMPLATE_TITLES.filter((title) => !real.has(title));
    expect(orphans).toEqual([]);
  });

  it("checks a meaningful share of the mechanically checkable work", () => {
    expect(CHECKED_TEMPLATE_TITLES.length).toBeGreaterThanOrEqual(18);
  });
});

describe("unknown keeps the task", () => {
  it("keeps everything when the site could not be read", () => {
    const templates = [
      { title: "Add canonical link tags to every page" },
      { title: "Generate and submit a sitemap.xml" },
    ];
    const { keep, alreadyDone } = splitTemplatesByState(templates, null);
    expect(keep).toHaveLength(2);
    expect(alreadyDone).toEqual([]);
  });

  it("keeps everything when the homepage fetch failed", () => {
    const dead = facts({ reachable: false, status: 0, html: "", pages: [] });
    const { keep } = splitTemplatesByState(
      [{ title: "Add canonical link tags to every page" }],
      dead,
    );
    expect(keep).toHaveLength(1);
  });

  it("keeps templates it has no check for", () => {
    expect(
      templateSatisfied("Publish 3–5 detailed case studies", facts()),
    ).toBeNull();
  });
});

describe("canonical tags", () => {
  const withCanonical = '<link rel="canonical" href="https://example.com/">';

  it("is satisfied only when every sampled page has one", () => {
    const f = facts({
      html: `<head>${withCanonical}</head>`,
      pages: [
        { url: "https://example.com/", status: 200, html: `<head>${withCanonical}</head>` },
        { url: "https://example.com/a", status: 200, html: `<head>${withCanonical}</head>` },
      ],
    });
    const verdict = templateSatisfied("Add canonical link tags to every page", f);
    expect(verdict?.done).toBe(true);
    expect(verdict?.evidence).toContain("1 sampled page");
  });

  it("keeps the task when one sampled page is missing it", () => {
    const f = facts({
      html: `<head>${withCanonical}</head>`,
      pages: [
        { url: "https://example.com/", status: 200, html: `<head>${withCanonical}</head>` },
        { url: "https://example.com/a", status: 200, html: "<head></head>" },
      ],
    });
    expect(templateSatisfied("Add canonical link tags to every page", f)).toBeNull();
  });

  it("reads rel and href in either order", () => {
    expect(canonicalOf('<link href="https://x.test/" rel="canonical">')).toBe(
      "https://x.test/",
    );
  });
});

describe("permalinks", () => {
  const links = (...paths: string[]) =>
    paths.map((p) => `<a href="${p}">x</a>`).join("");

  it("ignores the ?p= shortlink WordPress prints in the head", () => {
    // This exact confusion shipped once as a high-severity finding on a
    // site with perfectly clean URLs. Only anchors count.
    const html = `<head><link rel="shortlink" href="https://example.com/?p=123"></head><body>${links(
      "/about/",
      "/blog/",
      "/contact/",
      "/services/",
      "/pricing/",
    )}</body>`;
    const f = facts({ html, pages: [{ url: "https://example.com/", status: 200, html }] });
    const verdict = templateSatisfied(
      "Configure permalinks: Settings → Permalinks → Post name",
      f,
    );
    expect(verdict?.done).toBe(true);
  });

  it("keeps the task when an actual link uses ?p=", () => {
    const html = `<body>${links(
      "/about/",
      "/?p=42",
      "/contact/",
      "/services/",
      "/pricing/",
    )}</body>`;
    const f = facts({ html, pages: [{ url: "https://example.com/", status: 200, html }] });
    expect(
      templateSatisfied("Configure permalinks: Settings → Permalinks → Post name", f),
    ).toBeNull();
  });

  it("keeps the task when there are too few links to judge", () => {
    const html = `<body>${links("/about/")}</body>`;
    const f = facts({ html, pages: [{ url: "https://example.com/", status: 200, html }] });
    expect(
      templateSatisfied("Configure permalinks: Settings → Permalinks → Post name", f),
    ).toBeNull();
  });
});

describe("sitemap", () => {
  it("is satisfied by a valid urlset, and says what it did not check", () => {
    const f = facts({
      sitemap: { url: "https://example.com/sitemap.xml", status: 200, valid: true },
      robotsTxt: { status: 200, body: "User-agent: *\nSitemap: https://example.com/sitemap.xml" },
    });
    const verdict = templateSatisfied("Generate and submit a sitemap.xml", f);
    expect(verdict?.done).toBe(true);
    expect(verdict?.evidence).toContain("robots.txt points to it");
    expect(verdict?.evidence).toContain("not checked from here");
  });

  it("keeps the task when sitemap.xml is a 404 page that returns 200", () => {
    const f = facts({
      sitemap: { url: "https://example.com/sitemap.xml", status: 200, valid: false },
    });
    expect(templateSatisfied("Generate and submit a sitemap.xml", f)).toBeNull();
  });
});

describe("JSON-LD", () => {
  it("collects types from @graph and arrays", () => {
    const html = `<script type="application/ld+json">{"@graph":[{"@type":"Organization"},{"@type":["WebSite","Thing"]}]}</script>`;
    expect(jsonLdTypes(html).sort()).toEqual(["Organization", "Thing", "WebSite"]);
  });

  it("survives a malformed block", () => {
    expect(jsonLdTypes('<script type="application/ld+json">{nope</script>')).toEqual([]);
  });

  it("is satisfied by a business type", () => {
    const html = `<script type="application/ld+json">{"@type":"Organization","name":"X"}</script>`;
    const verdict = templateSatisfied(
      "Add JSON-LD schema for your business type",
      facts({ html }),
    );
    expect(verdict?.done).toBe(true);
  });

  it("keeps the task when only non-business types are present", () => {
    const html = `<script type="application/ld+json">{"@type":"BreadcrumbList"}</script>`;
    expect(
      templateSatisfied("Add JSON-LD schema for your business type", facts({ html })),
    ).toBeNull();
  });

  it("accepts LocalBusiness subtypes it has never heard of", () => {
    const html = `<script type="application/ld+json">{"@type":"HVACBusiness"}</script>`;
    const verdict = templateSatisfied(
      "Add LocalBusiness schema to your homepage",
      facts({ html }),
    );
    expect(verdict?.done).toBe(true);
  });
});

describe("transport and caching", () => {
  it("is satisfied when ALPN negotiated h2", () => {
    const verdict = templateSatisfied(
      "Enable HTTP/2 or HTTP/3 + gzip/brotli compression",
      facts({ alpn: "h2", headers: { "content-encoding": "br" } }),
    );
    expect(verdict?.done).toBe(true);
    expect(verdict?.evidence).toContain("br");
  });

  it("keeps the task on HTTP/1.1", () => {
    expect(
      templateSatisfied(
        "Enable HTTP/2 or HTTP/3 + gzip/brotli compression",
        facts({ alpn: "http/1.1" }),
      ),
    ).toBeNull();
  });

  it("is satisfied by a long max-age on a real asset", () => {
    const verdict = templateSatisfied(
      "Configure proper cache-control headers for static assets",
      facts({
        staticAsset: {
          url: "https://example.com/app.css",
          cacheControl: "public, max-age=31536000, immutable",
        },
      }),
    );
    expect(verdict?.done).toBe(true);
    expect(verdict?.evidence).toContain("365 days");
  });

  it("keeps the task when the asset is barely cached", () => {
    expect(
      templateSatisfied(
        "Configure proper cache-control headers for static assets",
        facts({
          staticAsset: { url: "https://example.com/app.css", cacheControl: "max-age=60" },
        }),
      ),
    ).toBeNull();
  });
});

describe("directory indexing", () => {
  it("is satisfied when the uploads directory refuses", () => {
    const verdict = templateSatisfied(
      "Disable directory indexing in .htaccess",
      facts({
        directoryListing: {
          url: "https://example.com/wp-content/uploads/",
          status: 403,
          isListing: false,
        },
      }),
    );
    expect(verdict?.done).toBe(true);
    expect(verdict?.evidence).toContain("403");
  });

  it("keeps the task when the directory lists its contents", () => {
    expect(
      templateSatisfied(
        "Disable directory indexing in .htaccess",
        facts({
          directoryListing: {
            url: "https://example.com/wp-content/uploads/",
            status: 200,
            isListing: true,
          },
        }),
      ),
    ).toBeNull();
  });

  it("keeps the task when the directory answers 200 with something else", () => {
    // An empty index.html is not proof that listing is off.
    expect(
      templateSatisfied(
        "Disable directory indexing in .htaccess",
        facts({
          directoryListing: {
            url: "https://example.com/wp-content/uploads/",
            status: 200,
            isListing: false,
          },
        }),
      ),
    ).toBeNull();
  });
});

describe("images and plugins", () => {
  const imgs = (...srcs: string[]) => srcs.map((s) => `<img src="${s}">`).join("");

  it("is satisfied when nearly every image is WebP", () => {
    const html = imgs(
      "/a.webp",
      "/b.webp",
      "/c.webp",
      "/d.avif",
      "/e.webp",
    );
    const verdict = templateSatisfied(
      "Install ShortPixel or Smush — convert images to WebP",
      facts({ html }),
    );
    expect(verdict?.done).toBe(true);
  });

  it("keeps the task when half the images are still JPEG", () => {
    const html = imgs("/a.webp", "/b.jpg", "/c.jpg", "/d.webp");
    expect(
      templateSatisfied("Install ShortPixel or Smush — convert images to WebP", facts({ html })),
    ).toBeNull();
  });

  it("recognises an SEO plugin from its markup", () => {
    const html = '<head><meta name="generator" content="Rank Math SEO 1.0"></head>';
    const verdict = templateSatisfied("Install Rank Math or Yoast SEO", facts({ html }));
    expect(verdict?.done).toBe(true);
    expect(verdict?.evidence).toContain("Rank Math");
  });

  it("recognises Cloudflare from a response header", () => {
    const verdict = templateSatisfied(
      "Set up Cloudflare (free tier) as a CDN",
      facts({ headers: { "cf-ray": "8a1b2c3d4e5f" } }),
    );
    expect(verdict?.done).toBe(true);
  });

  it("counts a non-Cloudflare CDN as a CDN", () => {
    // Measured live: Hostinger's CDN answers with these two headers and
    // no cf-ray, and the task was being created on a site that had one.
    const verdict = templateSatisfied(
      "Set up Cloudflare (free tier) as a CDN",
      facts({ headers: { server: "hcdn", "x-hcdn-cache-status": "DYNAMIC" } }),
    );
    expect(verdict?.done).toBe(true);
    expect(verdict?.evidence).toContain("hcdn");
  });

  it("keeps the caching task when the cache header says the origin answered", () => {
    // cf-cache-status: DYNAMIC means nothing was cached. Reading the
    // header's presence as "caching is on" is the exact shape of wrong
    // answer this module exists to stop.
    expect(
      templateSatisfied(
        "Enable caching — install LiteSpeed Cache or WP Rocket",
        facts({ headers: { "cf-cache-status": "DYNAMIC" } }),
      ),
    ).toBeNull();
  });

  it("is satisfied when the page actually came from cache", () => {
    const verdict = templateSatisfied(
      "Enable caching — install LiteSpeed Cache or WP Rocket",
      facts({ headers: { "x-litespeed-cache": "hit" } }),
    );
    expect(verdict?.done).toBe(true);
    expect(verdict?.evidence).toContain("served from cache");
  });
});

describe("internalLinks", () => {
  it("keeps same-origin document links and drops the rest", () => {
    const html = [
      '<a href="/about">a</a>',
      '<a href="https://other.test/x">b</a>',
      '<a href="#top">c</a>',
      '<a href="mailto:x@y.test">d</a>',
      '<a href="/logo.png">e</a>',
      '<a href="/about#team">f</a>',
    ].join("");
    expect(internalLinks(html, "https://example.com/")).toEqual([
      "https://example.com/about",
    ]);
  });
});

describe("splitTemplatesByState", () => {
  it("reports evidence for each skip", () => {
    const f = facts({
      sitemap: { url: "https://example.com/sitemap.xml", status: 200, valid: true },
    });
    const { keep, alreadyDone } = splitTemplatesByState(
      [
        { title: "Generate and submit a sitemap.xml" },
        { title: "Add canonical link tags to every page" },
      ],
      f,
    );
    expect(keep.map((t) => t.title)).toEqual(["Add canonical link tags to every page"]);
    expect(alreadyDone).toHaveLength(1);
    expect(alreadyDone[0].evidence).toBeTruthy();
  });
});
