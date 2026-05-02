type DetectionRule = {
  name: string;
  category: "cms" | "framework" | "hosting" | "ecommerce" | "analytics" | "cdn";
  htmlMatch?: RegExp;
  headerMatch?: { name: string; pattern: RegExp };
  metaGenerator?: RegExp;
};

const rules: DetectionRule[] = [
  {
    name: "WordPress",
    category: "cms",
    htmlMatch: /\/wp-(content|includes|json)\//i,
    metaGenerator: /WordPress/i,
  },
  {
    name: "Shopify",
    category: "ecommerce",
    htmlMatch: /cdn\.shopify\.com|Shopify\.theme|shopify-features/i,
    headerMatch: { name: "x-shopid", pattern: /.+/ },
  },
  {
    name: "Wix",
    category: "cms",
    htmlMatch: /static\.wixstatic\.com|X-Wix-/i,
    headerMatch: { name: "x-wix-request-id", pattern: /.+/ },
  },
  {
    name: "Squarespace",
    category: "cms",
    htmlMatch: /static1\.squarespace\.com|Static\.SQUARESPACE_CONTEXT/i,
    metaGenerator: /Squarespace/i,
  },
  {
    name: "Webflow",
    category: "cms",
    htmlMatch: /data-wf-page|webflow\.com\/css/i,
    metaGenerator: /Webflow/i,
  },
  {
    name: "Ghost",
    category: "cms",
    metaGenerator: /Ghost/i,
    htmlMatch: /ghost-sdk|content\/images\/\d{4}\/\d{2}/i,
  },
  {
    name: "Drupal",
    category: "cms",
    metaGenerator: /Drupal/i,
    headerMatch: { name: "x-generator", pattern: /Drupal/i },
  },
  {
    name: "Joomla",
    category: "cms",
    metaGenerator: /Joomla/i,
  },
  {
    name: "Next.js",
    category: "framework",
    htmlMatch: /__NEXT_DATA__|\/_next\/static\//,
    headerMatch: { name: "x-powered-by", pattern: /Next\.js/i },
  },
  {
    name: "Nuxt.js",
    category: "framework",
    htmlMatch: /__NUXT__|window\.__NUXT__/,
  },
  {
    name: "Gatsby",
    category: "framework",
    htmlMatch: /\/page-data\/|gatsby-image/i,
    metaGenerator: /Gatsby/i,
  },
  {
    name: "Astro",
    category: "framework",
    metaGenerator: /Astro/i,
    htmlMatch: /astro-island|data-astro/i,
  },
  {
    name: "Hugo",
    category: "framework",
    metaGenerator: /Hugo/i,
  },
  {
    name: "Jekyll",
    category: "framework",
    metaGenerator: /Jekyll/i,
  },
  {
    name: "WooCommerce",
    category: "ecommerce",
    htmlMatch:
      /\/wp-content\/plugins\/woocommerce\/|class=["'][^"']*\bwoocommerce[\s-][^"']*["']|wc-block-/i,
  },
  {
    name: "Magento",
    category: "ecommerce",
    htmlMatch: /Magento_|mage\/cookies/i,
    headerMatch: { name: "x-magento-cache-id", pattern: /.+/ },
  },
  {
    name: "BigCommerce",
    category: "ecommerce",
    htmlMatch: /cdn\d*\.bigcommerce\.com/i,
  },
  {
    name: "Vercel",
    category: "hosting",
    headerMatch: { name: "x-vercel-id", pattern: /.+/ },
  },
  {
    name: "Netlify",
    category: "hosting",
    headerMatch: { name: "x-nf-request-id", pattern: /.+/ },
  },
  {
    name: "Cloudflare",
    category: "cdn",
    headerMatch: { name: "cf-ray", pattern: /.+/ },
  },
  {
    name: "Google Analytics",
    category: "analytics",
    htmlMatch: /googletagmanager\.com\/gtag|google-analytics\.com\/(ga|analytics)/i,
  },
  {
    name: "GTM",
    category: "analytics",
    htmlMatch: /googletagmanager\.com\/gtm/i,
  },
];

export type DetectedTech = { name: string; category: DetectionRule["category"] };

export type DetectionResult = {
  url: string;
  fetchedAt: Date;
  status: number;
  finalUrl: string;
  technologies: DetectedTech[];
};

export async function detectTechStack(rawUrl: string): Promise<DetectionResult> {
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; SeoToolBot/0.1; +https://localhost)",
        accept: "text/html,application/xhtml+xml",
      },
    });
  } finally {
    clearTimeout(timeout);
  }

  const html = await res.text();
  const head = html.slice(0, 400_000);

  const generator = head.match(
    /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i,
  )?.[1];

  const found = new Map<string, DetectedTech>();

  for (const rule of rules) {
    let hit = false;

    if (rule.htmlMatch && rule.htmlMatch.test(head)) hit = true;

    if (
      rule.headerMatch &&
      rule.headerMatch.pattern.test(res.headers.get(rule.headerMatch.name) ?? "")
    ) {
      hit = true;
    }

    if (rule.metaGenerator && generator && rule.metaGenerator.test(generator)) {
      hit = true;
    }

    if (hit) found.set(rule.name, { name: rule.name, category: rule.category });
  }

  return {
    url,
    fetchedAt: new Date(),
    status: res.status,
    finalUrl: res.url,
    technologies: Array.from(found.values()),
  };
}
