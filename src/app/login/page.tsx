import { accountsEnabled } from "@/lib/auth";
import {
  getAuthBrandCopy,
  getLoginPageCopy,
} from "@/lib/auth-page-copy.server";
import { getThemePreference } from "@/app/settings/theme-actions";
import { AuthBrandedLayout } from "@/components/auth/auth-branded-layout";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const [brand, copy, theme] = await Promise.all([
    getAuthBrandCopy(),
    getLoginPageCopy(),
    getThemePreference(),
  ]);

  return (
    <AuthBrandedLayout brand={brand} theme={theme}>
      <LoginForm
        mode={accountsEnabled() ? "accounts" : "password"}
        copy={copy}
      />
    </AuthBrandedLayout>
  );
}
