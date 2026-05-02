/**
 * Tech-stack-aware SEO checklist templates (CLAUDE.md Part 3.2 + Part 10).
 *
 * When a client is created, we detect the tech stack and apply the matching
 * checklist — actionable, platform-specific tasks ("Install WP Rocket" rather
 * than "improve speed").
 *
 * Coverage: top 10 platforms by global market share.
 */

type Priority = "high" | "medium" | "low";

export type StackTaskTemplate = {
  title: string;
  description: string;
  whyItMatters: string;
  priority: Priority;
};

const wordpress: StackTaskTemplate[] = [
  {
    title: "Install Rank Math or Yoast SEO",
    description:
      "Pick one (don't run both). Yoast is more popular, Rank Math has more features in the free tier.",
    whyItMatters:
      "Gives you a single place to control titles, meta descriptions, schema, sitemaps, redirects, and breadcrumbs without editing theme files.",
    priority: "high",
  },
  {
    title: "Enable caching — install LiteSpeed Cache or WP Rocket",
    description:
      "LiteSpeed Cache is free if your host supports LiteSpeed (most do). WP Rocket is paid but works on any host.",
    whyItMatters:
      "WordPress is slow out of the box. Caching is the single biggest speed win — usually 2–4× faster page loads, directly improving Core Web Vitals.",
    priority: "high",
  },
  {
    title: "Install ShortPixel or Smush — convert images to WebP",
    description:
      "Bulk-convert and lazy-load all your images. Set quality to 80–85 for the best size/quality ratio.",
    whyItMatters:
      "Images are typically 60–80% of page weight on WordPress sites. WebP is 25–35% smaller than JPEG with no visible quality loss.",
    priority: "high",
  },
  {
    title: "Audit and remove unused plugins",
    description:
      "Each active plugin adds load time. Anything you haven't touched in 3+ months — review, deactivate, delete.",
    whyItMatters:
      "Plugin bloat is the #1 reason WP sites are slow. 5 quality plugins beats 25 mediocre ones every time.",
    priority: "medium",
  },
  {
    title: "Set up Cloudflare (free tier) as a CDN",
    description:
      "Sign up at cloudflare.com → Add site → Update nameservers at your registrar. Auto-minify CSS/JS/HTML in Cloudflare.",
    whyItMatters:
      "Free CDN serves static assets from servers near your visitors, plus DDoS protection. ~30% speed improvement on most sites.",
    priority: "medium",
  },
  {
    title: "Configure permalinks: Settings → Permalinks → Post name",
    description:
      "Default WordPress permalinks are ?p=123. Change to /post-name/ format.",
    whyItMatters:
      "Clean URLs with the post slug help users and search engines understand what's on the page.",
    priority: "medium",
  },
  {
    title: "Disable directory indexing in .htaccess",
    description:
      "Add: Options -Indexes",
    whyItMatters:
      "Without this, anyone can browse your /wp-content/uploads/ folder. Security + cleaner crawl signals.",
    priority: "low",
  },
];

const woocommerce: StackTaskTemplate[] = [
  {
    title: "Add Product schema to all product pages",
    description:
      "Yoast/Rank Math do this automatically — verify it's enabled. Test with Google's Rich Results Test on a product URL.",
    whyItMatters:
      "Product schema unlocks price, stock, ratings in Google search results — directly improving CTR for commercial intent.",
    priority: "high",
  },
  {
    title: "Audit faceted-nav indexing — apply noindex to filter URLs",
    description:
      "Filtered shop URLs like /shop/?color=red shouldn't all be indexed. In Yoast/Rank Math, noindex query-param URLs.",
    whyItMatters:
      "Faceted nav can generate millions of low-value pages, eating crawl budget and creating duplicate content.",
    priority: "high",
  },
  {
    title: "Set canonical for variation product URLs",
    description:
      "Variations like /shirt/?attribute=red should canonical to /shirt/.",
    whyItMatters:
      "Variations confuse Google about which URL to rank. Canonicalizing to the parent product consolidates ranking signals.",
    priority: "medium",
  },
];

const shopify: StackTaskTemplate[] = [
  {
    title: "Pick an SEO app — install Smart SEO or Plug in SEO",
    description:
      "Smart SEO auto-generates JSON-LD and alt text. Plug in SEO is free and audits your store on a schedule.",
    whyItMatters:
      "Shopify hides theme files behind a Liquid templating layer — these apps give you SEO control without theme editing.",
    priority: "high",
  },
  {
    title: "Audit installed apps in Settings → Apps",
    description:
      "Each app loads scripts on every page. Remove any abandoned apps you no longer use, even if they're free.",
    whyItMatters:
      "Shopify hosts your store fast — apps are the main speed killer. Removing 2-3 unused apps often shaves 500–1000ms from LCP.",
    priority: "high",
  },
  {
    title: "Compress all product images — keep under 100 KB each",
    description:
      "Use Crush.pics or TinyPNG (Shopify integration available). Aim for WebP format where supported.",
    whyItMatters:
      "Shopify recommends max 100KB per image. Larger images hurt mobile LCP and bandwidth-limited users (huge slice of e-commerce buyers).",
    priority: "high",
  },
  {
    title: "Disable currency converter / pop-up apps if not strictly needed",
    description:
      "Currency converters typically add 600–800ms. Pop-up apps add even more.",
    whyItMatters:
      "Speed beats fancy. A fast checkout converts better than a slow one with a currency selector.",
    priority: "medium",
  },
  {
    title: "Set canonical to .com on collection paginated URLs",
    description:
      "/collections/all?page=2 should canonical to /collections/all to avoid duplicate-content issues.",
    whyItMatters:
      "Pagination is one of the most common Shopify SEO mistakes — Google sees 50 near-identical pages.",
    priority: "medium",
  },
  {
    title: "Write a unique 100–300 word intro on every collection page",
    description:
      "Shopify's default collection page is just a product grid. Add an SEO description above the grid in the collection's Description field.",
    whyItMatters:
      "Collection pages often rank for the highest-volume commercial queries — but only if there's content above the grid.",
    priority: "medium",
  },
  {
    title: "Submit sitemap.xml to Google Search Console",
    description:
      "Shopify auto-generates /sitemap.xml. Submit it once at search.google.com/search-console.",
    whyItMatters:
      "Helps Google discover new products and collections faster, especially for stores adding inventory regularly.",
    priority: "low",
  },
];

const wix: StackTaskTemplate[] = [
  {
    title: "Switch from Wix Editor to Wix Studio if possible",
    description:
      "Wix Studio gives more control over technical SEO. Migration is involved but worth it for serious projects.",
    whyItMatters:
      "Wix's classic Editor has known speed limitations. Studio addresses many of them.",
    priority: "medium",
  },
  {
    title: "Use Wix SEO tools panel — set page-level title + meta description",
    description:
      "Pages → SEO tools panel for each page. Don't leave any pages with default Wix-generated titles.",
    whyItMatters:
      "Wix's auto-generated titles are usually generic and miss the keyword. Manual override is the single biggest Wix SEO win.",
    priority: "high",
  },
  {
    title: "Compress every image before uploading — target under 200KB",
    description:
      "Wix doesn't compress images well. Pre-compress with TinyPNG or Squoosh before upload.",
    whyItMatters:
      "Wix sites tend to ship oversized images. This is the #1 lever for Wix Core Web Vitals.",
    priority: "high",
  },
  {
    title: "Set up redirects: Settings → SEO → Redirect URLs",
    description:
      "Any old URL needs a 301 to its new location. Wix handles this through the SEO settings panel.",
    whyItMatters:
      "Without 301s, you lose ranking authority on every URL change. Free Wix-native fix.",
    priority: "medium",
  },
  {
    title: "Honest note: accept Wix's limits",
    description:
      "Wix has speed limitations you can't fully fix without leaving the platform. Focus on what's controllable: titles, content, images, internal linking.",
    whyItMatters:
      "Setting realistic expectations beats chasing impossible 95+ Lighthouse scores on Wix. Compete on content quality instead.",
    priority: "low",
  },
];

const squarespace: StackTaskTemplate[] = [
  {
    title: "Use SEO panel on every page: Page Settings → SEO",
    description:
      "Set unique title + meta description on each page. Don't accept Squarespace's auto-generated defaults.",
    whyItMatters:
      "Default Squarespace titles are usually 'Page Title — Site Title' — generic and underperforming for clicks.",
    priority: "high",
  },
  {
    title: "Enable AMP for blog posts: Marketing → AMP",
    description:
      "AMP makes mobile blog posts load instantly. Free toggle.",
    whyItMatters:
      "AMP improves mobile pageviews-per-session on content-heavy sites — though Google's reliance on AMP has waned.",
    priority: "low",
  },
  {
    title: "Add image alt text via the image editor on every block",
    description:
      "Click image → Edit → Caption / Alt text field.",
    whyItMatters:
      "Squarespace's image-heavy templates make alt text crucial for both accessibility and Google Image Search.",
    priority: "high",
  },
  {
    title: "Use Custom Code Injection to add Google Analytics 4 + Tag Manager",
    description:
      "Settings → Advanced → Code Injection → paste GA4/GTM scripts in Header.",
    whyItMatters:
      "Squarespace's built-in analytics is limited. GA4 + GTM unlock proper conversion tracking.",
    priority: "medium",
  },
  {
    title: "Enable HTTPS in Settings → Advanced → SSL",
    description: "If not already enabled — set to 'Secure' (HTTPS only).",
    whyItMatters:
      "Required for ranking and to prevent the 'Not secure' browser warning.",
    priority: "high",
  },
];

const webflow: StackTaskTemplate[] = [
  {
    title: "Add page-level title + meta description in Page Settings",
    description: "Open each page → Settings → SEO → fill in.",
    whyItMatters:
      "Webflow gives you full SEO control but doesn't auto-fill anything. Empty SEO panels = generic site-name fallback.",
    priority: "high",
  },
  {
    title: "Set up Open Graph and Twitter Card images on every page",
    description: "Page Settings → SEO → Open Graph image. Use 1200×630.",
    whyItMatters:
      "Critical for social shares. Webflow makes this trivially configurable.",
    priority: "medium",
  },
  {
    title: "Enable site-wide HTTPS in Project Settings → Hosting",
    description: "Toggle SSL on. Free with all Webflow paid plans.",
    whyItMatters: "Required for ranking + browser trust.",
    priority: "high",
  },
  {
    title: "Use Webflow CMS for blog/listings, not static pages",
    description:
      "Repeating content (blog posts, case studies) belongs in CMS Collections, not duplicated static pages.",
    whyItMatters:
      "Static duplication creates accidental near-duplicates. CMS Collections give you templated, schema-friendly listings.",
    priority: "medium",
  },
  {
    title: "Add JSON-LD via Page Settings → Custom Code → Inside <head>",
    description:
      "Webflow doesn't auto-generate schema. Paste JSON-LD per page or use a CMS-driven script.",
    whyItMatters:
      "Schema unlocks rich results — critical for any commercial-intent page.",
    priority: "medium",
  },
];

const nextjs: StackTaskTemplate[] = [
  {
    title: "Replace <img> with next/image throughout",
    description:
      "Auto-handles responsive sizing, WebP/AVIF conversion, and lazy loading. Set priority on the LCP image.",
    whyItMatters:
      "Single biggest Core Web Vitals win on Next.js sites. Often shaves 30–50% off LCP.",
    priority: "high",
  },
  {
    title: "Use generateMetadata in App Router for dynamic SEO",
    description:
      "Each page exports an async generateMetadata that returns title, description, openGraph, etc.",
    whyItMatters:
      "Default Next.js doesn't auto-generate per-page meta. Without generateMetadata you get the same site-wide title on every URL.",
    priority: "high",
  },
  {
    title: "Add app/sitemap.ts and app/robots.ts",
    description:
      "Next.js will auto-generate /sitemap.xml and /robots.txt at build time. Both required for serious SEO.",
    whyItMatters:
      "Without these you have no sitemap and no crawl directives — Google crawls inefficiently.",
    priority: "high",
  },
  {
    title: "Move analytics to next/script with strategy='afterInteractive'",
    description:
      "import Script from 'next/script'. Don't use plain <script> tags — they block render.",
    whyItMatters:
      "Render-blocking analytics is the most common reason Next.js sites have a slow INP.",
    priority: "medium",
  },
  {
    title: "Enable ISR (Incremental Static Regeneration) on content pages",
    description:
      "Add export const revalidate = 3600 to content pages. Serves static HTML, refreshes hourly.",
    whyItMatters:
      "Static HTML is the fastest possible delivery. ISR gives you static speed with dynamic-ish freshness.",
    priority: "medium",
  },
  {
    title: "Preload critical fonts with next/font",
    description: "Use next/font/google or next/font/local. Set display: swap.",
    whyItMatters:
      "Font loading is a major CLS contributor. next/font handles preload + swap automatically.",
    priority: "medium",
  },
];

const drupal: StackTaskTemplate[] = [
  {
    title: "Install the Metatag module + Schema.org Metatag",
    description:
      "Adds proper meta tags + JSON-LD support across content types.",
    whyItMatters: "Drupal core has minimal SEO support — these modules are non-negotiable.",
    priority: "high",
  },
  {
    title: "Install Pathauto — auto-generate SEO-friendly URL aliases",
    description:
      "Replaces /node/123 with /your-page-title. Configure URL patterns per content type.",
    whyItMatters:
      "Default Drupal URLs are unreadable. Pathauto fixes this site-wide.",
    priority: "high",
  },
  {
    title: "Install Redirect module to manage 301s",
    description:
      "Captures URL changes and ensures old paths redirect to new ones.",
    whyItMatters: "Drupal CMS edits often change URLs. Without redirects you lose all earned rankings.",
    priority: "high",
  },
  {
    title: "Enable XML Sitemap module + submit to Google Search Console",
    description:
      "Generate /sitemap.xml automatically based on content type rules.",
    whyItMatters: "Speeds up indexing of new content, especially on large Drupal sites.",
    priority: "medium",
  },
];

const magento: StackTaskTemplate[] = [
  {
    title: "Enable canonical URLs for products and categories",
    description:
      "Stores → Configuration → Catalog → Catalog → Search Engine Optimization → Use Canonical Link Meta Tag = Yes (both products and categories).",
    whyItMatters:
      "Magento generates many URL variations per product. Without canonicals, ranking signals split across them.",
    priority: "high",
  },
  {
    title: "Configure URL Suffix and remove .html if present",
    description:
      "Stores → Configuration → Catalog → Catalog → Search Engine Optimization → set Product URL Suffix to empty.",
    whyItMatters: "Cleaner URLs without .html are easier to read and slightly better for CTR.",
    priority: "medium",
  },
  {
    title: "Install a caching extension (Varnish + Redis)",
    description:
      "Magento is slow without proper caching. Varnish for full-page, Redis for session/object cache.",
    whyItMatters:
      "Magento has the worst out-of-box speed of any major e-commerce platform. Caching brings it from unusable to fast.",
    priority: "high",
  },
  {
    title: "Audit installed extensions — disable any you don't actively use",
    description:
      "Each Magento extension can add multiple JS bundles per page.",
    whyItMatters:
      "Magento sites bloat fast with extensions. Quarterly audit + removal keeps speed reasonable.",
    priority: "medium",
  },
];

const custom: StackTaskTemplate[] = [
  {
    title: "Add canonical link tags to every page",
    description: "<link rel='canonical' href='https://yoursite.com/page'>",
    whyItMatters:
      "Without canonicals, Google has to guess which URL is the 'real' one. Custom builds often forget this.",
    priority: "high",
  },
  {
    title: "Generate and submit a sitemap.xml",
    description:
      "Either build it programmatically from your routes, or use a generator. Submit to Google Search Console.",
    whyItMatters: "Helps Google find pages it wouldn't otherwise crawl.",
    priority: "high",
  },
  {
    title: "Add JSON-LD schema for your business type",
    description:
      "At minimum: Organization or LocalBusiness on the homepage. Extend with Product / Article / FAQ on relevant pages.",
    whyItMatters:
      "Schema is hand-coded on custom sites — easy to skip, but unlocks rich results in search.",
    priority: "high",
  },
  {
    title: "Enable HTTP/2 or HTTP/3 + gzip/brotli compression",
    description:
      "Configure at your CDN or web server level. Should be on by default on modern hosts.",
    whyItMatters:
      "Free 20–40% load-time improvement. Custom builds sometimes ship with HTTP/1.1 by mistake.",
    priority: "medium",
  },
  {
    title: "Configure proper cache-control headers for static assets",
    description:
      "JS/CSS/images: cache-control: public, max-age=31536000, immutable. HTML: no-cache or short max-age.",
    whyItMatters:
      "Long cache TTLs on assets dramatically improve repeat visits — common omission on custom builds.",
    priority: "medium",
  },
  {
    title: "Add structured logging for crawler hits",
    description:
      "Log Googlebot/Bingbot user agents to a separate stream. Review monthly for crawl errors.",
    whyItMatters:
      "Custom builds can break crawl access without anyone noticing for weeks.",
    priority: "low",
  },
];

// Map detected tech-stack labels (from tech-detect.ts) to template keys
type StackKey =
  | "wordpress"
  | "shopify"
  | "wix"
  | "squarespace"
  | "webflow"
  | "nextjs"
  | "drupal"
  | "magento"
  | "woocommerce"
  | "custom";

const templates: Record<StackKey, StackTaskTemplate[]> = {
  wordpress,
  shopify,
  wix,
  squarespace,
  webflow,
  nextjs,
  drupal,
  magento,
  woocommerce,
  custom,
};

const detectionLabelToKey: Record<string, StackKey> = {
  WordPress: "wordpress",
  Shopify: "shopify",
  Wix: "wix",
  Squarespace: "squarespace",
  Webflow: "webflow",
  "Next.js": "nextjs",
  Drupal: "drupal",
  Magento: "magento",
  WooCommerce: "woocommerce",
};

export const STACK_LABELS: Record<StackKey, string> = {
  wordpress: "WordPress",
  shopify: "Shopify",
  wix: "Wix",
  squarespace: "Squarespace",
  webflow: "Webflow",
  nextjs: "Next.js",
  drupal: "Drupal",
  magento: "Magento",
  woocommerce: "WooCommerce",
  custom: "Custom / unrecognised",
};

/**
 * Pick the best matching templates for a detected tech stack.
 *
 * Returns:
 * - All templates from primary platforms detected (WordPress / Shopify / etc.)
 * - WooCommerce templates ARE additive on top of WordPress
 * - Falls back to "custom" if nothing major was detected
 */
export function pickStackTemplates(
  detectedStack: string[] | null | undefined,
): { matched: StackKey[]; tasks: StackTaskTemplate[] } {
  const matched: StackKey[] = [];
  const seen = new Set<string>();

  if (detectedStack && detectedStack.length > 0) {
    for (const label of detectedStack) {
      const key = detectionLabelToKey[label];
      if (key && !seen.has(key)) {
        seen.add(key);
        matched.push(key);
      }
    }
  }

  if (matched.length === 0) matched.push("custom");

  const tasks: StackTaskTemplate[] = [];
  for (const key of matched) {
    tasks.push(...templates[key]);
  }
  return { matched, tasks };
}

export function getTemplatesByKey(key: StackKey): StackTaskTemplate[] {
  return templates[key] ?? [];
}
