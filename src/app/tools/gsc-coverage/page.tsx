export const dynamic = "force-dynamic";

import { ListChecks } from "lucide-react";
import { SetupPrompt } from "@/components/setup-prompt";
import { PageHeader } from "@/components/shell/page-header";
import { listGscProperties } from "@/lib/google-oauth";
import { CoverageForm } from "./coverage-form";

export default async function GscCoveragePage() {
  let properties: { siteUrl: string }[] = [];
  try {
    properties = await listGscProperties();
  } catch {
    properties = [];
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="GSC index coverage (batch)"
        description="Paste up to 60 URLs from the same property. We hit Google's URL Inspection API for each, summarise indexing state, surface the ones that aren't indexed and why. Free — uses your GSC OAuth quota."
        icon={ListChecks}
        accent="emerald"
      />
      {properties.length === 0 ? (
        <SetupPrompt
          title="Connect Google Search Console to use this"
          detail="Index coverage is Search Console data by definition — it is Google telling you what it did and did not index."
          href="/settings/google"
          cta="Connect Search Console"
        />
      ) : (
        <CoverageForm properties={properties.map((p) => p.siteUrl)} />
      )}
    </div>
  );
}
