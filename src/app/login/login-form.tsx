"use client";

import { Suspense, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthCard } from "@/components/auth/auth-card";
import { safeInternalPath } from "@/lib/safe-internal-path";

type DevLogin = { email: string; password: string } | null;

export function LoginForm({
  mode,
  devLogin = null,
}: {
  mode: "accounts" | "password";
  devLogin?: DevLogin;
}) {
  return (
    <Suspense fallback={null}>
      <LoginInner mode={mode} devLogin={devLogin} />
    </Suspense>
  );
}

function LoginInner({
  mode,
  devLogin,
}: {
  mode: "accounts" | "password";
  devLogin: DevLogin;
}) {
  const search = useSearchParams();
  const t = useTranslations("auth");
  const next = safeInternalPath(search.get("next"));
  const accounts = mode === "accounts";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(accounts ? { email, password } : { password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data?.error ?? t("loginFailed");
        setError(
          msg === "Email or password is incorrect."
            ? t("badCredentials")
            : msg,
        );
        return;
      }
      // A full load, not router.push: the root layout swaps the auth
      // frame for the app shell, and layouts survive client navigation.
      window.location.assign(next);
    });
  }

  return (
    <AuthCard
      title={t("welcomeBack")}
      subtitle={accounts ? t("signInAccount") : t("signInPassword")}
    >
        <form onSubmit={submit} className="space-y-4">
          {devLogin && (
            <div className="space-y-2 rounded-md bg-amber-500/10 px-3 py-2.5 text-xs ring-1 ring-amber-500/30">
              <p className="font-medium">{t("devAccountTitle")}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {accounts && (
                  <>
                    <dt className="text-muted-foreground">{t("email")}</dt>
                    <dd className="break-all font-mono">{devLogin.email}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">{t("password")}</dt>
                <dd className="break-all font-mono">{devLogin.password}</dd>
              </dl>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  setEmail(devLogin.email);
                  setPassword(devLogin.password);
                }}
              >
                {t("devAccountFill")}
              </Button>
            </div>
          )}
          {accounts && (
            <div className="space-y-1.5">
              <Label htmlFor="email">{t("email")}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
                autoComplete="username"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="pwd">{t("password")}</Label>
            <Input
              id="pwd"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus={!accounts}
              required
              autoComplete="current-password"
            />
          </div>
          {error && (
            <div className="flex items-start gap-2 rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-rose-500/30">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <Button
            type="submit"
            disabled={pending || !password || (accounts && !email)}
            className="w-full"
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t("signingIn")}
              </>
            ) : (
              t("signIn")
            )}
          </Button>
          {accounts ? (
            <p className="text-xs text-muted-foreground">{t("noAccountHint")}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("teamHint")}{" "}
              <a href="/register" className="underline underline-offset-2">
                {t("setUpAccounts")}
              </a>
            </p>
          )}
        </form>
    </AuthCard>
  );
}
