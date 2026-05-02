import { count } from "drizzle-orm";
import { db } from "@/db/client";
import { seoResources } from "@/db/schema";
import seedData from "@/data/seo-resources.json";

type SeedRecord = {
  category: string;
  url: string;
  domain: string;
  da: number | null;
  alexa: number | null;
};

let imported = false;

/**
 * On first call, seeds the seoResources table from the bundled JSON.
 * Idempotent — only runs the bulk insert if the table is empty.
 */
export async function ensureSeoResourcesSeeded(): Promise<number> {
  const [{ value }] = await db
    .select({ value: count() })
    .from(seoResources);

  if (value > 0) {
    imported = true;
    return value;
  }

  if (imported) return value;

  const records = seedData as SeedRecord[];
  // Insert in batches — SQLite has a default 999-parameter limit
  const batchSize = 200;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    await db.insert(seoResources).values(
      batch.map((r) => ({
        category: r.category,
        url: r.url,
        domain: r.domain,
        da: r.da,
        alexa: r.alexa,
      })),
    );
  }
  imported = true;
  return records.length;
}

export const CATEGORY_LABELS: Record<string, string> = {
  "profile-creation": "Profile creation",
  "social-bookmarking": "Social bookmarking",
  "directory-submission": "Directory submission",
  "image-submission": "Image submission",
  "pdf-submission": "PDF submission",
  "business-networking": "Business networking",
  "infographics-submission": "Infographics",
  "seo-audit-tools": "SEO audit tools",
  "wiki-submission": "Wiki submission",
  "ping-submission": "Ping submission",
  portfolio: "Portfolio sites",
  "blog-submission": "Blog submission",
  "rss-feed": "RSS feeds",
  showcase: "Showcase sites",
  "web-2.0": "Web 2.0",
  "video-sharing": "Video sharing",
  "story-sharing": "Story sharing",
  "search-engine-submission": "Search engine submission",
  "forum-posting": "Forum posting",
  "press-release": "Press release",
  "social-networking": "Social networking",
  "classified-submission": "Classified submission",
  "article-submission": "Article submission",
  gov: ".gov sites",
  edu: ".edu sites",
  "local-citation": "Local citation",
};
