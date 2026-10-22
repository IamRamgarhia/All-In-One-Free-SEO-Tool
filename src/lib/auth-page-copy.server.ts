import { getTranslations } from "next-intl/server";
import type { AuthBrandCopy, LoginPageCopy, RegisterFormCopy } from "@/lib/auth-brand-copy";

export type { AuthBrandCopy, LoginPageCopy, RegisterFormCopy };

export async function getAuthBrandCopy(): Promise<AuthBrandCopy> {
  const t = await getTranslations("authBrand");
  return {
    appName: t("appName"),
    tagline: t("tagline"),
    kicker: t("kicker"),
    groupCredit: t("groupCredit"),
    headlineAccent: t("headlineAccent"),
    headlineRest: t("headlineRest"),
    pitch: t("pitch"),
    features: [
      { title: t("feature1Title"), desc: t("feature1Desc") },
      { title: t("feature2Title"), desc: t("feature2Desc") },
      { title: t("feature3Title"), desc: t("feature3Desc") },
    ],
  };
}

export async function getLoginPageCopy(): Promise<LoginPageCopy> {
  const t = await getTranslations("auth");
  return {
    signInTitle: t("signInTitle"),
    signInAccount: t("signInAccount"),
    signInPassword: t("signInPassword"),
    username: t("username"),
    email: t("email"),
    password: t("password"),
    signIn: t("signIn"),
    signingIn: t("signingIn"),
    loginFailed: t("loginFailed"),
    wrongPassword: t("wrongPassword"),
    teamSetupBefore: t("teamSetupBefore"),
    teamSetupLink: t("teamSetupLink"),
    teamSetupAfter: t("teamSetupAfter"),
    inviteAccountHint: t("inviteAccountHint"),
  };
}

export async function getRegisterFormCopy(): Promise<RegisterFormCopy> {
  const t = await getTranslations("auth");
  return {
    email: t("email"),
    password: t("password"),
    yourName: t("yourName"),
    namePlaceholder: t("namePlaceholder"),
    passwordHint: t("passwordHint"),
    passwordTooShort: t("passwordTooShort"),
    registerFailed: t("registerFailed"),
    creatingAccount: t("creatingAccount"),
    alreadyHaveAccount: t("alreadyHaveAccount"),
    goToSignIn: t("goToSignIn"),
  };
}
