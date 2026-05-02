type Priority = "high" | "medium" | "low";
type Niche = "local" | "ecommerce" | "saas" | "blog" | "services";

export type NicheTaskTemplate = {
  title: string;
  description: string;
  whyItMatters: string;
  priority: Priority;
};

const local: NicheTaskTemplate[] = [
  {
    title: "Claim and verify your Google Business Profile",
    description:
      "Search your business name on Google. If the GBP card on the right shows 'Own this business?', click it and verify.",
    whyItMatters:
      "Google Business Profile is the single biggest local-SEO ranking factor. Until it's verified, you can't appear in the local 3-pack at all.",
    priority: "high",
  },
  {
    title: "Confirm NAP consistency across the web",
    description:
      "Make sure Name, Address, and Phone match exactly across your site, GBP, Yelp, Facebook, and major directories.",
    whyItMatters:
      "Google uses NAP consistency as a trust signal for local businesses. Even small mismatches (St. vs Street) can dilute local rankings.",
    priority: "high",
  },
  {
    title: "Set up a system to request Google reviews",
    description:
      "Generate a short review link from your GBP and add it to email signatures, receipts, and follow-up messages.",
    whyItMatters:
      "Review count and recency are direct ranking factors for the local pack. Aim for at least 1–2 new reviews per month.",
    priority: "high",
  },
  {
    title: "Add LocalBusiness schema to your homepage",
    description:
      "Add JSON-LD structured data with name, address, telephone, openingHours, and geo coordinates.",
    whyItMatters:
      "LocalBusiness schema helps Google understand you're a physical-location business and powers rich features in search.",
    priority: "medium",
  },
  {
    title: "Build dedicated landing pages for each service area",
    description:
      "If you serve multiple cities, create one page per city with unique content (not just a swap of city name).",
    whyItMatters:
      "Generic 'we serve all of California' pages don't rank for city-level searches. Dedicated city pages do.",
    priority: "medium",
  },
  {
    title: "Audit local citations for accuracy",
    description:
      "Check listings on Yelp, Facebook, BBB, Apple Maps, Bing Places, plus 5–10 niche directories for your industry.",
    whyItMatters:
      "Outdated citations confuse Google about your real address and phone — clean them up to consolidate signals.",
    priority: "medium",
  },
];

const ecommerce: NicheTaskTemplate[] = [
  {
    title: "Add Product schema to every product page",
    description:
      "Use JSON-LD with name, image, description, sku, brand, offers (price, availability), and aggregateRating.",
    whyItMatters:
      "Product schema unlocks rich results in Google: price, stock status, ratings — directly improving CTR and qualified clicks.",
    priority: "high",
  },
  {
    title: "Optimize product image file sizes and alt text",
    description:
      "Run a bulk image audit. Convert to WebP, target under 100KB each, and write descriptive alt text using product name + key attributes.",
    whyItMatters:
      "Images drive product-page LCP and unlock Google Images traffic, which converts well for ecommerce.",
    priority: "high",
  },
  {
    title: "Audit faceted navigation for indexable junk URLs",
    description:
      "Check filters and sort parameters. Anything that creates near-duplicate URLs (color=red&size=L vs size=L&color=red) needs canonicals or noindex.",
    whyItMatters:
      "Uncontrolled facets can generate millions of low-value pages, wasting crawl budget and creating duplicate-content problems.",
    priority: "high",
  },
  {
    title: "Write unique copy for category and collection pages",
    description:
      "Add a 100–300 word intro to each major category page above the product grid, covering buyer intent and key attributes.",
    whyItMatters:
      "Category pages often rank for the highest-volume commercial queries — but only if they have content beyond a product grid.",
    priority: "medium",
  },
  {
    title: "Set up clean breadcrumb navigation with schema",
    description:
      "Visible breadcrumbs (Home › Category › Subcategory › Product) plus BreadcrumbList JSON-LD.",
    whyItMatters:
      "Breadcrumbs improve internal linking, navigation depth, and unlock breadcrumb display in Google search results.",
    priority: "medium",
  },
  {
    title: "Plan how to handle out-of-stock products",
    description:
      "Decide: keep page live with 'out of stock' (good for SEO), redirect to category, or 410. Document the rule.",
    whyItMatters:
      "Killing pages too aggressively destroys earned rankings and backlinks. Keeping them live with proper schema is usually best.",
    priority: "low",
  },
];

const saas: NicheTaskTemplate[] = [
  {
    title: "Build comparison pages for each major competitor",
    description:
      "Create '[Your product] vs [Competitor]' pages — fair, detailed, with feature tables. Aim for 5–10 of these.",
    whyItMatters:
      "Comparison queries are bottom-of-funnel and high-intent. Owning these pages captures buyers actively evaluating you.",
    priority: "high",
  },
  {
    title: "Build integration pages for every tool you connect to",
    description:
      "One page per integration (e.g. '/integrations/slack') describing the use case, setup, and benefit.",
    whyItMatters:
      "Buyers search for 'X integration Y' before purchase. Integration pages capture that intent and double as sales collateral.",
    priority: "high",
  },
  {
    title: "Set up programmatic SEO for use-case landing pages",
    description:
      "Identify a templatable pattern (e.g. 'Time tracking for [industry]') and ship 20–100 variants powered from a single template + dataset.",
    whyItMatters:
      "Programmatic SEO is one of the highest-leverage tactics for SaaS — it scales coverage of long-tail use cases dramatically.",
    priority: "medium",
  },
  {
    title: "Write SoftwareApplication schema for your homepage",
    description:
      "Add JSON-LD with applicationCategory, offers (pricing tiers), aggregateRating from real reviews.",
    whyItMatters:
      "Helps Google place you in software-specific search features and review-rich snippets when applicable.",
    priority: "medium",
  },
  {
    title: "Build a deep, hub-and-spoke help center",
    description:
      "Central /docs hub linking to every feature article. Articles target informational queries from users — and rank.",
    whyItMatters:
      "Documentation is high-quality, naturally linked content. SaaS sites often rank for product-related questions through docs alone.",
    priority: "medium",
  },
  {
    title: "Add FAQ schema to pricing and feature pages",
    description:
      "Wrap real questions and answers in FAQPage JSON-LD on pages where users have purchase questions.",
    whyItMatters:
      "FAQ rich results take up extra real estate in search and improve CTR on commercial-intent pages.",
    priority: "low",
  },
];

const blog: NicheTaskTemplate[] = [
  {
    title: "Build a content calendar for the next 90 days",
    description:
      "Plan 1–2 posts per week mapped to topic clusters, with target keywords and pillar links.",
    whyItMatters:
      "Consistent publishing on a clear topic plan beats sporadic posts. Topic depth signals authority to Google.",
    priority: "high",
  },
  {
    title: "Identify your top 3 topic clusters and pillar pages",
    description:
      "Pick the 3 broadest topics you want to own. For each, plan a 3000+ word pillar page and 5–10 supporting articles.",
    whyItMatters:
      "Topical authority — covering a subject deeply — is one of Google's strongest content-quality signals after the helpful-content updates.",
    priority: "high",
  },
  {
    title: "Audit content decay — flag posts losing traffic",
    description:
      "Pull GSC data, identify posts that lost >30% of clicks YoY. For each, decide: refresh, merge, or retire.",
    whyItMatters:
      "Refreshing decaying content recovers traffic at a fraction of the cost of new posts. It's the highest-ROI content task.",
    priority: "high",
  },
  {
    title: "Add Article schema with author + datePublished + dateModified",
    description:
      "Especially for YMYL or expertise-heavy content — make author bylines, credentials, and update dates explicit.",
    whyItMatters:
      "E-E-A-T (Experience, Expertise, Authoritativeness, Trust) is now a major Google signal, especially after the helpful-content updates.",
    priority: "medium",
  },
  {
    title: "Improve internal linking on top-performing posts",
    description:
      "On each top-traffic article, add 5–10 contextual links to related pillar/cluster pages.",
    whyItMatters:
      "Internal links pass authority from your strongest pages to weaker ones, lifting cluster-wide rankings.",
    priority: "medium",
  },
  {
    title: "Set up author pages with E-E-A-T signals",
    description:
      "Real photo, bio with credentials, links to past work, social profiles, schema with sameAs links.",
    whyItMatters:
      "Strong author signals separate trustworthy content from AI-generated noise — increasingly important post-helpful-content updates.",
    priority: "low",
  },
];

const services: NicheTaskTemplate[] = [
  {
    title: "Build dedicated pages for each service you offer",
    description:
      "Don't bundle services on one page. One page per service, each ~800–1500 words, addressing the specific buyer's questions.",
    whyItMatters:
      "Buyers search for specific services, not bundles. Dedicated pages rank for those specific queries.",
    priority: "high",
  },
  {
    title: "Add Service schema to each service page",
    description:
      "Use Service or ProfessionalService JSON-LD with serviceType, areaServed, provider, and offers if you have pricing.",
    whyItMatters:
      "Schema helps Google place you in service-related searches and unlock rich features for service businesses.",
    priority: "medium",
  },
  {
    title: "Publish 3–5 detailed case studies",
    description:
      "Real client, real outcome with numbers (or anonymized if needed), the process you used, and lessons learned.",
    whyItMatters:
      "Case studies are the strongest trust signal on a services site — both for ranking E-E-A-T and converting buyers who land.",
    priority: "high",
  },
  {
    title: "Build prominent trust signals on every page",
    description:
      "Awards, certifications, client logos, real testimonials with names and photos, real team photos.",
    whyItMatters:
      "Service buyers are evaluating risk. Trust signals reduce perceived risk and improve both rankings (E-E-A-T) and conversion.",
    priority: "medium",
  },
  {
    title: "Create a clear About page with team and credentials",
    description:
      "Real names, photos, credentials, years of experience. Link to LinkedIn profiles via sameAs schema.",
    whyItMatters:
      "Anonymous service businesses underperform. Real people with credentials are a major trust + E-E-A-T win.",
    priority: "medium",
  },
  {
    title: "Set up a FAQ section addressing buyer objections",
    description:
      "Mine sales calls for the 10 most common questions. Answer them on a page with FAQPage schema.",
    whyItMatters:
      "Answering buyer objections directly improves conversion rate and unlocks FAQ rich results in search.",
    priority: "low",
  },
];

export const nicheTemplates: Record<Niche, NicheTaskTemplate[]> = {
  local,
  ecommerce,
  saas,
  blog,
  services,
};

export function getNicheTemplates(
  niche: string | null | undefined,
): NicheTaskTemplate[] {
  if (!niche) return [];
  return nicheTemplates[niche as Niche] ?? [];
}
