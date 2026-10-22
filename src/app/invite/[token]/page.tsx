import { getTranslations } from "next-intl/server";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/auth";
import { findInvite } from "@/lib/invites";
import { AccountForm } from "@/app/register/account-form";
import {
  getAuthBrandCopy,
  getRegisterFormCopy,
} from "@/lib/auth-page-copy.server";
import { getThemePreference } from "@/app/settings/theme-actions";
import { AuthBrandedLayout } from "@/components/auth/auth-branded-layout";
import { InviteExpired } from "./invite-expired";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = findInvite(token);

  const [brand, copy, t, theme] = await Promise.all([
    getAuthBrandCopy(),
    getRegisterFormCopy(),
    getTranslations("auth"),
    getThemePreference(),
  ]);

  return (
    <AuthBrandedLayout brand={brand} theme={theme}>
      {!invite ? (
        <InviteExpired
          title={t("inviteExpiredTitle")}
          body={t("inviteExpiredBody")}
          signInLabel={t("goToSignIn")}
        />
      ) : (
        <AccountForm
          token={token}
          copy={copy}
          lockedEmail={invite.email}
          heading={`Join as ${ROLE_LABELS[invite.role].toLowerCase()}`}
          subheading={ROLE_DESCRIPTIONS[invite.role]}
          cta="Create my account"
        />
      )}
    </AuthBrandedLayout>
  );
}
