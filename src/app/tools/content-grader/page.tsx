export const dynamic = "force-dynamic";

import { Gauge } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { GraderForm } from "./grader-form";

export default function ContentGraderPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Content grader"
        description="Surfer / Clearscope replacement. Pulls the top-10 SERP results for your keyword, builds a TF-IDF corpus, then scores your draft on length, term coverage, and keyword density. Free — uses our existing browser-mode SERP scanner, no paid API."
        icon={Gauge}
        accent="emerald"
      />
      <GraderForm />
    </div>
  );
}
