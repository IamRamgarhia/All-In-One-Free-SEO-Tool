export const dynamic = "force-dynamic";

import { TrendingDown } from "lucide-react";
import { SetupPrompt } from "@/components/setup-prompt";
import { PageHeader } from "@/components/shell/page-header";
import { listGscProperties } from "@/lib/google-oauth";
import { TrafficDropForm } from "./traffic-drop-form";

export default async function TrafficDropPage() {
  let properties: { siteUrl: string }[] = [];
  try {
    properties = await listGscProperties();
  } catch {
    properties = [];
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Why did my traffic drop?"
        description="Pulls last 28 days vs the 28 days before that from GSC. Diffs queries, pages, impressions. Cross-references curated Google algorithm-update timeline. AI ranks the most likely cause and writes 3-4 verification steps."
        icon={TrendingDown}
        accent="rose"
      />
      {properties.length === 0 ? (
        <SetupPrompt
          title="Connect Google Search Console to use this"
          detail="Diagnosing a drop means comparing the last 28 days of queries and pages against the 28 before, which comes from Search Console."
          href="/settings/google"
          cta="Connect Search Console"
        />
      ) : (
        <TrafficDropForm properties={properties.map((p) => p.siteUrl)} />
      )}
    </div>
  );
}
