export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, Sparkles } from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { OnboardingWizard } from "./wizard";

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const [client] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!client) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href={`/clients/${client.id}`}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" /> Back to client
      </Link>

      <PageHeader
        title={`Smart onboarding · ${client.name}`}
        description="Tell us about the business once, and the tool builds a 30-day SEO plan tailored to the niche, locale, and tech stack — auto-generates daily tasks so you don't have to figure out what to do each morning."
        icon={Sparkles}
        accent="violet"
      />

      <OnboardingWizard
        client={{
          id: client.id,
          name: client.name,
          url: client.url,
          niche: client.niche,
          surfacesJson: client.surfacesJson,
          description: client.description,
          businessType: client.businessType,
          country: client.country ?? "US",
          language: client.language ?? "en",
          city: client.city,
          geoTarget: (client.geoTarget as "country" | "city" | "multi" | null) ?? "country",
          serviceRadiusKm: client.serviceRadiusKm,
          gscProperty: client.gscProperty,
          gbpUrl: client.gbpUrl,
          onboardingStep:
            (client.onboardingStep as
              | "pending"
              | "brand"
              | "keywords"
              | "targeting"
              | "completed") ?? "pending",
          planGeneratedAt: client.planGeneratedAt,
        }}
      />
    </div>
  );
}
