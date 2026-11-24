import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { ArrowLeft, Library, Globe } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import {
  PROSPECTS,
  CATEGORY_LABELS,
  COUNTRY_LABELS,
  NICHE_LABELS,
} from "@/lib/backlink-prospects-data";
import {
  CATEGORY_LABELS_FR,
  COUNTRY_LABELS_FR,
  NICHE_LABELS_FR,
  PROSPECTS_FR,
  prospectKey,
} from "@/lib/backlink-prospects-data.fr";
import { ProspectsLibrary } from "./prospects-library";

export const dynamic = "force-dynamic";

export default function ProspectsLibraryPage() {
  const tx = useTranslations("ui.app_link-building_library_page");
  // The library is written in English; French text comes from the table
  // next to it, with the English entry as fallback.
  const fr = useLocale() === "fr";
  const prospects = fr
    ? PROSPECTS.map((p) => ({ ...p, ...(PROSPECTS_FR[prospectKey(p)] ?? {}) }))
    : PROSPECTS;
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Link
        href="/link-building"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" /> {tx("backToLinkBuilding")}
      </Link>

      <PageHeader
        title={tx("backlinkProspectsLibrary")}
        description={tx("aCuratedCatalogOfReal")}
        icon={Library}
        accent="emerald"
        meta={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs text-muted-foreground ring-1 ring-inset ring-white/10">
            <Globe className="size-3" />
            {tx("prospects30Countries", { length: PROSPECTS.length })}
          </span>
        }
      />

      <ProspectsLibrary
        prospects={prospects}
        categoryLabels={fr ? CATEGORY_LABELS_FR : CATEGORY_LABELS}
        countryLabels={fr ? COUNTRY_LABELS_FR : COUNTRY_LABELS}
        nicheLabels={fr ? NICHE_LABELS_FR : NICHE_LABELS}
      />
    </div>
  );
}
