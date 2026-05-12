export const dynamic = "force-dynamic";

import { Split } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { listGscProperties } from "@/lib/google-oauth";
import { CannibalForm } from "./form";

export default async function CannibalizationPage() {
  let properties: { siteUrl: string }[] = [];
  try {
    properties = await listGscProperties();
  } catch {
    properties = [];
  }
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Keyword cannibalization"
        description="Find queries where 2+ pages on your site compete for the same ranking — Google can't decide which to surface, both suffer. Pulls 28 days of GSC query+page data and groups by query."
        icon={Split}
        accent="rose"
      />
      {properties.length === 0 ? (
        <div className="glass-apple rounded-2xl p-5 text-sm text-muted-foreground">
          Connect Google Search Console first — Settings → Google.
        </div>
      ) : (
        <CannibalForm properties={properties.map((p) => p.siteUrl)} />
      )}
    </div>
  );
}
