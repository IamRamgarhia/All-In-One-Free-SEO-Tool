import { getTranslations } from "next-intl/server";
import { getThemePreference } from "@/app/settings/theme-actions";
import {
  SiteLanding,
  type SiteLandingCopy,
} from "@/components/marketing/site-landing";

export const dynamic = "force-dynamic";

export async function PublicLandingPage() {
  const [theme, t] = await Promise.all([
    getThemePreference(),
    getTranslations("landing"),
  ]);

  const copy: SiteLandingCopy = {
    navFeatures: t("navFeatures"),
    navSignIn: t("navSignIn"),
    heroKicker: t("heroKicker"),
    heroLine1: t("heroLine1"),
    heroLine2: t("heroLine2"),
    heroBody: t("heroBody"),
    heroPrimary: t("heroPrimary"),
    heroSecondary: t("heroSecondary"),
    heroConsoleCaption: t("heroConsoleCaption"),
    trustLabel: t("trustLabel"),
    pillarAuditsTitle: t("pillarAuditsTitle"),
    pillarAuditsBody: t("pillarAuditsBody"),
    pillarRankTitle: t("pillarRankTitle"),
    pillarRankBody: t("pillarRankBody"),
    pillarDeliverTitle: t("pillarDeliverTitle"),
    pillarDeliverBody: t("pillarDeliverBody"),
    ctaTitle: t("ctaTitle"),
    ctaBody: t("ctaBody"),
    ctaButton: t("ctaButton"),
    footerOrg: t("footerOrg"),
    footerPrivate: t("footerPrivate"),
  };

  return <SiteLanding copy={copy} theme={theme} />;
}
