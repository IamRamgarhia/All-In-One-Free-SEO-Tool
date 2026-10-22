import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { accountsEnabled } from "@/lib/auth";
import {
  getAuthBrandCopy,
  getRegisterFormCopy,
} from "@/lib/auth-page-copy.server";
import { getThemePreference } from "@/app/settings/theme-actions";
import { AuthBrandedLayout } from "@/components/auth/auth-branded-layout";
import { AccountForm } from "./account-form";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  if (accountsEnabled()) redirect("/login");

  const [brand, copy, t, theme] = await Promise.all([
    getAuthBrandCopy(),
    getRegisterFormCopy(),
    getTranslations("auth"),
    getThemePreference(),
  ]);

  return (
    <AuthBrandedLayout brand={brand} theme={theme}>
      <AccountForm
        copy={copy}
        heading={t("registerOwnerTitle")}
        subheading={t("registerOwnerSubtitle")}
        cta={t("registerOwnerCta")}
      />
    </AuthBrandedLayout>
  );
}
