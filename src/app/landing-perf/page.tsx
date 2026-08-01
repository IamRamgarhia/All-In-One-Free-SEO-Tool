export const dynamic = "force-dynamic";

import { Target } from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import { clientScope } from "@/lib/client-scope";
import {
  ClientToolGrid,
  type ClientToolCard,
} from "@/components/shell/client-tool-grid";

export default async function LandingPerfIndexPage() {
  const all = await db.select().from(clients).where(await clientScope()).orderBy(desc(clients.createdAt));

  const cards: ClientToolCard[] = all.map((c) => {
    const hasGsc = Boolean(c.gscProperty);
    const hasGa4 = Boolean(c.ga4PropertyId);
    return {
      id: c.id,
      name: c.name,
      url: c.url,
      logoUrl: c.logoUrl,
      niche: c.niche,
      primary:
        hasGsc && hasGa4
          ? "GSC + GA4 ready"
          : hasGsc
            ? "GSC only"
            : "Google not connected",
      primaryTone: (
        hasGsc && hasGa4 ? "emerald" : hasGsc ? "amber" : "neutral"
      ) as "emerald" | "amber" | "neutral",
      secondary: hasGsc
        ? "Click to see clicks vs conversions"
        : "Connect Google first",
    };
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Landing-page performance"
        description="Joins GSC clicks with GA4 conversions per URL. Surfaces the pages that get traffic but don't convert — usually the highest-ROI fixes you can make."
        icon={Target}
        accent="emerald"
      />
      <ClientToolGrid cards={cards} basePath="/landing-perf/c" />
    </div>
  );
}
