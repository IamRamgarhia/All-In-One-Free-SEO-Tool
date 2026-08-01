export const dynamic = "force-dynamic";


import { Crown } from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { BrandSerpView } from "./view";

export default async function BrandSerpPage() {
  const all = await db.select().from(clients).orderBy(clients.name);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Brand SERP monitor"
        description="Capture the full first-page Google SERP for every brand name. We score 'brand-SERP control' — what % of the top 10 are properties you actually own (your domain, your social profiles, your knowledge panel). Goal: control 5+ of the top 10."
        icon={Crown}
        accent="amber"
      />
      <BrandSerpView
        clients={all.map((c) => ({
          id: c.id,
          name: c.name,
          url: c.url,
          socialLinks: c.socialLinks,
        }))}
      />
    </div>
  );
}
