"use client";

import { Suspense, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") ?? "/";

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
        body: JSON.stringify({ password }),
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
              Self-hosted instance — sign in with the password your admin set.
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pwd">Password</Label>
            <Input
              id="pwd"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
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
            disabled={pending || !password}
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
          <p className="text-[11px] text-muted-foreground">
            Set <code className="rounded bg-white/5 px-1 py-0.5">APP_PASSWORD</code>{" "}
            in your env vars to enable this gate. Empty / unset = no auth (local mode).
          </p>
        </form>
      </div>
    </div>
  );
}
