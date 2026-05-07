export const dynamic = "force-dynamic";

import { Layers } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { ClusterForm } from "./form";

export default function ClusterPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Topic cluster builder"
        description="Type a head topic → we mine PAA + related searches + autocomplete + Reddit. AI assembles a hub-and-spoke architecture: 1 pillar + 15-20 spokes with slugs, intent, format, and an internal-linking map. The 1-day strategy plan, in 60 seconds."
        icon={Layers}
        accent="cyan"
      />
      <ClusterForm />
    </div>
  );
}
