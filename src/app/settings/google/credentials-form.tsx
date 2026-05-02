"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveGoogleCredentials,
  type SaveCredentialsResult,
} from "./actions";

export function GoogleCredentialsForm({
  initialClientId,
  hasSecret,
}: {
  initialClientId: string | null;
  hasSecret: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    SaveCredentialsResult | null,
    FormData
  >(saveGoogleCredentials, null);
  const errors = state && !state.ok ? state.errors : {};

  return (
    <form action={formAction} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="clientId">Client ID</Label>
        <Input
          id="clientId"
          name="clientId"
          placeholder="123-abc.apps.googleusercontent.com"
          defaultValue={initialClientId ?? ""}
          aria-invalid={Boolean(errors.clientId)}
        />
        {errors.clientId && (
          <p className="text-xs text-destructive">{errors.clientId}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="clientSecret">Client Secret</Label>
        <Input
          id="clientSecret"
          name="clientSecret"
          type="password"
          placeholder={hasSecret ? "•••••••••••••••• (saved)" : "GOCSPX-…"}
          aria-invalid={Boolean(errors.clientSecret)}
        />
        {errors.clientSecret && (
          <p className="text-xs text-destructive">{errors.clientSecret}</p>
        )}
        <p className="text-[11px] text-muted-foreground">
          Stored locally on this machine. Never sent anywhere except Google&apos;s
          OAuth endpoints.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save credentials"}
        </Button>
        {state?.ok && (
          <span className="text-xs text-emerald-300">Saved.</span>
        )}
      </div>
    </form>
  );
}
