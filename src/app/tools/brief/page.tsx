export const dynamic = "force-dynamic";

import { FileText } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { BriefForm } from "./form";

export default function BriefPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Content brief — one-click composite"
        description="Type a query → we pull top-10 SERP corpus, PAA, related searches → AI writes a writer-ready brief: intent, target length, full H2 outline, semantic terms, FAQ block, internal-link anchors, featured-snippet shape, CTA."
        icon={FileText}
        accent="emerald"
      />
      <BriefForm />
    </div>
  );
}
