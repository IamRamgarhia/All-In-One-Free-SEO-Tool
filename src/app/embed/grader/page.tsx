export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { accentColor, displayName, loadBrand } from "@/lib/brand";
import { EmbedGrader } from "./widget";

export async function generateMetadata(): Promise<Metadata> {
  const brand = await loadBrand();
  return {
    title: `Free SEO audit — ${displayName(brand)}`,
    // This page lives inside an iframe on the agency's site. Their page
    // is what should rank; an indexed copy of the widget would compete
    // with it for the agency's own brand terms.
    robots: { index: false, follow: false },
  };
}

/**
 * The embeddable grader.
 *
 * CLAUDE.md names a free public site grader as the primary acquisition
 * channel — the pattern Ahrefs and Semrush both use. The grader already
 * existed, but only inside the app behind the login, where the only
 * person who could reach it was the agency itself. As a marketing
 * channel that is worth nothing.
 *
 * This is the version that earns its keep: an agency drops one iframe on
 * their site, a prospect grades their own domain, and the agency gets a
 * lead who has already seen evidence their site has problems.
 *
 * No app chrome, no auth, no navigation back into the tool — a prospect
 * should never be able to click from an agency's marketing page into the
 * agency's client list.
 */
export default async function EmbedGraderPage() {
  const brand = await loadBrand();

  return (
    <EmbedGrader
      agency={displayName(brand)}
      accent={accentColor(brand)}
      logo={brand.logoDataUrl}
      tagline={brand.tagline}
    />
  );
}
