import { redirect } from "next/navigation";
import { accountsEnabled, currentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

/**
 * Server shell, so the form knows which credentials to ask for before it
 * renders. Deciding this on the client would mean a fetch, a spinner,
 * and a form that changes shape underneath someone who has already
 * started typing — on the one screen where that is least forgivable.
 */
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Already signed in (the landing's "Se connecter" button, a bookmark):
  // straight to the dashboard rather than a form for an account in use.
  if (accountsEnabled() && (await currentUser().catch(() => null))) {
    redirect("/");
  }
  // No account and no shared password: there is nobody to sign in as.
  // The first account is created on /register and becomes the owner.
  if (!accountsEnabled() && !process.env.APP_PASSWORD && process.env.SEO_ALLOW_OPEN_MODE !== "1") {
    redirect("/register");
  }
  return <LoginForm mode={accountsEnabled() ? "accounts" : "password"} devLogin={devLogin()} />;
}

/**
 * Test account shown on the login page, in development only. The values
 * live in `.env.local` (ignored by git), never in the code: a production
 * build never reads them, whatever the environment holds.
 */
function devLogin(): { email: string; password: string } | null {
  if (process.env.NODE_ENV !== "development") return null;
  const email = process.env.DEV_LOGIN_EMAIL?.trim();
  const password = process.env.DEV_LOGIN_PASSWORD;
  return email && password ? { email, password } : null;
}
