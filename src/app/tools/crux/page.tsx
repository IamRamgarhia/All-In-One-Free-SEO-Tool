export const dynamic = "force-dynamic";

import { Activity } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { CruxForm } from "./crux-form";

export default function CruxPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Real-user CWV (CrUX)"
        // "the same data Google uses to rank your page experience" was
        // wrong and contradicted this tool's own origin-level sibling.
        // Google evaluates Core Web Vitals at origin level; URL-level
        // CrUX tells you which page is slow, not whether you pass.
        description="Real Chrome user data for this URL over the last 28 days. Unlike Lighthouse / PageSpeed (lab numbers), this is what actual users experienced. Note Google assesses Core Web Vitals at origin level — use the CrUX Origin Summary to see where you actually stand."
        icon={Activity}
        accent="emerald"
      />
      <CruxForm />
    </div>
  );
}
