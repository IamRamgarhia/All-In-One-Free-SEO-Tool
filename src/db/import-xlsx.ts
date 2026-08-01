/**
 * Regenerates the backlink-prospect seed file (src/data/seo-resources.json)
 * from a spreadsheet of SEO resource sites.
 *
 * Maintainer-only, run rarely:
 *
 *   pnpm exec tsx src/db/import-xlsx.ts "path/to/SEO DATA.xlsx"
 *   SEO_XLSX=path/to/data.xlsx pnpm exec tsx src/db/import-xlsx.ts
 *
 * The committed JSON is the thing the app actually reads, so you only
 * need this when the source spreadsheet changes.
 *
 * SECURITY NOTE: uses the `xlsx` (SheetJS community) package, which has
 * had prototype-pollution advisories. That risk doesn't apply here —
 * this is a dev-only script reading a file the maintainer chose, and
 * the app never accepts user-uploaded xlsx. If that changes, move to
 * `exceljs` first. The package is a devDependency for the same reason.
 */
import * as XLSX from "xlsx";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Path comes from argv or env — it used to be hardcoded to one
// maintainer's Downloads folder, which meant the script was unrunnable
// by anyone else and put a personal filesystem path in a public repo.
const FILE = process.argv[2] ?? process.env.SEO_XLSX ?? "";

if (!FILE) {
  console.error(
    "Usage: pnpm exec tsx src/db/import-xlsx.ts <path-to-xlsx>\n" +
      "   or: SEO_XLSX=<path> pnpm exec tsx src/db/import-xlsx.ts",
  );
  process.exit(1);
}

if (!existsSync(FILE)) {
  console.error(`Spreadsheet not found: ${FILE}`);
  process.exit(1);
}
const OUT = resolve(process.cwd(), "src", "data", "seo-resources.json");

// Map sheet name → category (canonical, lowercase, hyphenated)
const sheetCategoryMap: Record<string, string> = {
  "Local Citation": "local-citation",
  "Profile Creation": "profile-creation",
  "Social Bookmarking": "social-bookmarking",
  " Image Submission": "image-submission",
  " Directory Submission ": "directory-submission",
  " PDF Submission ": "pdf-submission",
  "Business Networking Websites": "business-networking",
  "Infographics Submission": "infographics-submission",
  "SEO Audit Tools": "seo-audit-tools",
  "Wiki Submission": "wiki-submission",
  "ping Submission ": "ping-submission",
  "Portfolio Website": "portfolio",
  "Blog Submission": "blog-submission",
  "RSS Feed ": "rss-feed",
  "Showcase Sites": "showcase",
  "Web 2.0 ": "web-2.0",
  "Video Sharing ": "video-sharing",
  "Story Sharing": "story-sharing",
  "Search Engine Submission": "search-engine-submission",
  "Forum Posting ": "forum-posting",
  "Press Release ": "press-release",
  "Social Networking": "social-networking",
  "Classified Submission": "classified-submission",
  "Article Submission ": "article-submission",
  ".Gov": "gov",
  edu: "edu",
};

function normaliseUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  // bare domain like "facebook.com" — assume https
  if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(v)) return `https://${v}`;
  return null;
}

function tryNumber(value: string | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  const n = Number(String(value).replace(/[, ]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

type Resource = {
  category: string;
  url: string;
  domain: string;
  da: number | null;
  alexa: number | null;
};

const wb = XLSX.readFile(FILE);
const seen = new Set<string>(); // dedup by `${category}::${domain}`
const resources: Resource[] = [];

for (const sheetName of wb.SheetNames) {
  const category = sheetCategoryMap[sheetName];
  if (!category) {
    console.log(`Skipping unmapped sheet: "${sheetName}"`);
    continue;
  }
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  for (const row of rows) {
    // Find URL column — it's the column whose value parses as a URL or domain
    let url: string | null = null;
    let da: number | null = null;
    let alexa: number | null = null;

    for (const [key, val] of Object.entries(row)) {
      const s = String(val ?? "").trim();
      if (!s) continue;
      // URL detection
      if (!url) {
        const norm = normaliseUrl(s);
        if (norm) {
          url = norm;
          continue;
        }
      }
      // DA / Alexa columns
      const keyLower = key.toLowerCase();
      if (keyLower.includes("da")) {
        da = tryNumber(s);
      } else if (keyLower.includes("alexa")) {
        alexa = tryNumber(s);
      }
    }

    if (!url) continue;

    let domain: string;
    try {
      domain = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      continue;
    }

    const dedupeKey = `${category}::${domain}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    resources.push({ category, url, domain, da, alexa });
  }
}

// Sort: highest DA first, then highest Alexa (lower = better, so invert)
resources.sort((a, b) => {
  const aRank = a.da ?? (a.alexa ? 100 - Math.min(99, Math.log10(a.alexa) * 10) : 0);
  const bRank = b.da ?? (b.alexa ? 100 - Math.min(99, Math.log10(b.alexa) * 10) : 0);
  return bRank - aRank;
});

console.log(`Total unique resources: ${resources.length}`);
console.log("By category:");
const byCategory = new Map<string, number>();
for (const r of resources) {
  byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + 1);
}
for (const [cat, count] of [...byCategory.entries()].sort()) {
  console.log(`  ${cat}: ${count}`);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(resources, null, 0));
console.log(`\nWrote ${OUT} (${(JSON.stringify(resources).length / 1024).toFixed(0)} KB)`);
