"use client";

import { Suspense, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import type { LoginPageCopy } from "@/lib/auth-brand-copy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeInternalPath } from "@/lib/safe-internal-path";

const API_ERROR_KEYS: Record<string, keyof LoginPageCopy> = {
  wrong_password: "wrongPassword",
};

export function LoginForm({
  mode,
  copy,
}: {
  mode: "accounts" | "password";
  copy: LoginPageCopy;
}) {
  return (
    <Suspense fallback={null}>
      <LoginInner mode={mode} copy={copy} />
    </Suspense>
  );
}

function LoginInner({
  mode,
  copy,
}: {
  mode: "accounts" | "password";
  copy: LoginPageCopy;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const next = safeInternalPath(search.get("next"));
  const accounts = mode === "accounts";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function resolveError(raw: string | undefined) {
    if (!raw) return copy.loginFailed;
    const key = API_ERROR_KEYS[raw];
    if (key) return copy[key];
    return raw;
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          accounts
            ? { email: username, password }
            : { password },
        ),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(resolveError(data?.error));
        return;
      }
      router.push(next);
      router.refresh();
    });
  }

  return (
    <>
      <div className="mb-5 flex flex-col gap-1">
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.03em]">
          {copy.signInTitle}
        </h1>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {accounts ? copy.signInAccount : copy.signInPassword}
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="user">{copy.username}</Label>
          <Input
            id="user"
            type={accounts ? "email" : "text"}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required={accounts}
            autoComplete="username"
            className="h-10"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pwd">{copy.password}</Label>
          <Input
            id="pwd"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="h-10"
          />
        </div>
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-[10px] border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-[13px] text-rose-600 dark:text-rose-300"
          >
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <Button
          type="submit"
          disabled={pending || !password || (accounts && !username)}
          className="h-11 w-full"
        >
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {copy.signingIn}
            </>
          ) : (
            copy.signIn
          )}
        </Button>
      </form>

      <p className="mt-5 text-center text-[12.5px] leading-relaxed text-muted-foreground">
        {accounts ? (
          copy.inviteAccountHint
        ) : (
          <>
            {copy.teamSetupBefore}{" "}
            <Link
              href="/register"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {copy.teamSetupLink}
            </Link>{" "}
            {copy.teamSetupAfter}
          </>
        )}
      </p>
    </>
  );
}
