export const dynamic = "force-dynamic";

import { TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { VolumeForm } from "./volume-form";

export default function SearchVolumePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Search-volume estimator"
        description="Free directional volume estimate. Combines Google Trends interest, Google + Bing autocomplete signals, and SERP characteristics. Doesn't give exact monthly numbers (no paid API can without buying clickstream data) but gives a 5-bucket relative volume per keyword — accurate enough to prioritise."
        icon={TrendingUp}
        accent="cyan"
      />
      <VolumeForm />
    </div>
  );
}
