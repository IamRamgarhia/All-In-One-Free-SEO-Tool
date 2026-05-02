export const dynamic = "force-dynamic";

import { Layers } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { CompareForm } from "./compare-form";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { a, b } = await searchParams;
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Website comparison"
        description="Side-by-side analysis: audit score, Core Web Vitals, tech stack, brand metadata, social presence, top issues. Free for any two URLs — no login required."
        icon={Layers}
        accent="violet"
      />
      <CompareForm initialA={a} initialB={b} />
    </div>
  );
}
