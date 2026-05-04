export const dynamic = "force-dynamic";

import { Link2 } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { DiscoveryForm } from "./discovery-form";

export default function BacklinkDiscoveryPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Backlink discovery"
        description="Free backlink finder. Combines DuckDuckGo, Common Crawl, and a crawl-to-confirm pass that extracts real anchor text + rel. Won't match Ahrefs's index, but for any specific domain it surfaces dozens of real verified links — no key, no quota."
        icon={Link2}
        accent="violet"
      />
      <DiscoveryForm />
    </div>
  );
}
