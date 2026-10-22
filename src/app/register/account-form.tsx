"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import type { RegisterFormCopy } from "@/lib/auth-brand-copy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AccountForm({
  token,
  heading,
  subheading,
  lockedEmail,
  cta,
  copy,
}: {
  token?: string;
  heading: string;
  subheading: string;
  lockedEmail?: string;
  cta: string;
  copy: RegisterFormCopy;
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
        setError(data?.error ?? copy.registerFailed);
        return;
      }
      router.push("/");
      router.refresh();
    });
  }

  return (
    <>
      <div className="mb-5 flex flex-col gap-1">
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.03em]">
          {heading}
        </h1>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {subheading}
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <div className="space-y-1.5">
          <Label htmlFor="name">{copy.yourName}</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder={copy.namePlaceholder}
            autoComplete="name"
            className="h-10"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">{copy.email}</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={Boolean(lockedEmail)}
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
            autoComplete="new-password"
            className="h-10"
          />
          {tooShort ? (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              {copy.passwordTooShort}
            </p>
          ) : null}
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
          disabled={pending || !email || password.length < 10}
          className="h-11 w-full"
        >
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {copy.creatingAccount}
            </>
          ) : (
            cta
          )}
        </Button>
      </form>

      <p className="mt-5 text-center text-[12.5px] text-muted-foreground">
        {copy.alreadyHaveAccount}{" "}
        <Link
          href="/login"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {copy.goToSignIn}
        </Link>
      </p>
    </>
  );
}
