/**
 * Generates docs/social-preview.png — the 1200×630 OG image GitHub uses
 * when the repo is shared on Twitter, LinkedIn, Slack, WhatsApp, etc.
 * Default GitHub previews are bland and don't communicate the product.
 *
 * Re-runs idempotently: tweak the title / subtitle / brand color below,
 * then `pnpm exec tsx scripts/gen-social-preview.ts`.
 *
 * Output is checked into the repo so GitHub can serve it directly from
 * the raw URL (no separate hosting needed).
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateOgImage } from "../src/lib/og-image";

const OUT_PATH = join(process.cwd(), "docs", "social-preview.png");

async function main() {
  const result = await generateOgImage({
    // Title and subtitle are tuned for readability in Twitter's 320×168
    // preview crop — the headline must read at thumbnail size.
    title: "Free SEO Tool",
    subtitle:
      "Self-hosted alternative to Ahrefs & Semrush · 150+ tools · ₹0/month",
    brand: "DICECODES",
    // Violet (#7c3aed) is the primary brand accent across the app. Card
    // template renders this as a bright outer gradient with a dark inner
    // panel — readable at Twitter's 320×168 preview crop.
    brandColor: "#7c3aed",
    template: "card",
  });

  if (!result.ok || !result.dataUrl) {
    console.error("[social-preview] generation failed:", result.error);
    process.exit(1);
  }

  const base64 = result.dataUrl.replace(/^data:image\/png;base64,/, "");
  const buf = Buffer.from(base64, "base64");
  await writeFile(OUT_PATH, buf);
  console.log(
    `[social-preview] wrote ${OUT_PATH} (${(buf.length / 1024).toFixed(1)} KB)`,
  );
}

main().catch((err) => {
  console.error("[social-preview] error:", err);
  process.exit(1);
});
