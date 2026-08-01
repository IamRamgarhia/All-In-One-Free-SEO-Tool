"use client";

import { Suspense, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ mode }: { mode: "accounts" | "password" }) {
  return (
    <Suspense fallback={null}>
      <LoginInner mode={mode} />
    </Suspense>
  );
}

function LoginInner({ mode }: { mode: "accounts" | "password" }) {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") ?? "/";
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
        setError(data?.error ?? "Login failed");
        return;
      }
      router.push(next);
      router.refresh();
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="glass-apple-strong w-full max-w-sm rounded-2xl p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-violet-500/15 ring-1 ring-violet-400/30">
            <Lock className="size-5 text-violet-300" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">SEO Tool</h1>
            <p className="text-xs text-muted-foreground">
              {accounts
                ? "Sign in to your account."
                : "Self-hosted instance — sign in with the password your admin set."}
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {accounts && (
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
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
            <Label htmlFor="pwd">Password</Label>
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
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>
          {accounts ? (
            <p className="text-[11px] text-muted-foreground">
              No account yet? Ask the owner of this instance to send you an
              invite link.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Working with a team?{" "}
              <Link href="/register" className="underline underline-offset-2">
                Set up accounts
              </Link>{" "}
              so everyone signs in as themselves.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
