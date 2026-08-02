"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Shared by /register (first user, becomes owner) and /invite/[token]
 * (invited user, role already decided). Same fields, same validation,
 * different framing — worth one component rather than two that drift.
 */
export function AccountForm({
  token,
  heading,
  subheading,
  lockedEmail,
  cta,
}: {
  token?: string;
  heading: string;
  subheading: string;
  /** Set for invites: the address is fixed by whoever sent the link. */
  lockedEmail?: string;
  cta: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState(lockedEmail ?? "");
  const [password, setPassword] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const tooShort = password.length > 0 && password.length < 10;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, password, token }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? "Could not create the account.");
        return;
      }
      router.push("/");
      router.refresh();
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="glass-apple-strong w-full max-w-sm rounded-2xl p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-violet-500/15 ring-1 ring-violet-400/30">
            <UserPlus className="size-5 text-violet-300" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">{heading}</h1>
            <p className="text-xs text-muted-foreground">{subheading}</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Your name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="Priya Sharma"
              autoComplete="name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={Boolean(lockedEmail)}
              autoComplete="username"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pwd">Password</Label>
            <Input
              id="pwd"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            <p
              className={
                tooShort
                  ? "text-[11px] text-amber-400"
                  : "text-[11px] text-muted-foreground"
              }
            >
              At least 10 characters. A short phrase you&apos;ll remember beats a
              short jumble you won&apos;t.
            </p>
          </div>
          {error && (
            <div className="flex items-start gap-2 rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-rose-500/30">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <Button
            type="submit"
            disabled={pending || !email || password.length < 10}
            className="w-full"
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Creating your account…
              </>
            ) : (
              cta
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
