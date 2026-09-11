"use client";

import { useActionState, useState, useTransition } from "react";
import { CheckCircle2, Copy, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  removeServiceAccount,
  saveServiceAccount,
  testServiceAccount,
} from "./actions";

type SaveState = { ok: boolean; error?: string; email?: string };

/**
 * The simpler way to connect Google, offered beside the OAuth flow.
 *
 * The whole reason this exists is that the OAuth setup has two steps
 * that fail silently: an unpublished consent screen hands out a refresh
 * token that dies after seven days, and a redirect URI that differs by a
 * character fails with a 400 naming nothing. So this screen leans hard
 * on proving the connection works now, rather than saying "saved" and
 * letting the user find out later.
 */
export function ServiceAccountForm({
  connectedEmail,
}: {
  connectedEmail: string | null;
}) {
  const [state, formAction, pending] = useActionState<SaveState | null, FormData>(
    saveServiceAccount,
    null,
  );
  const [test, setTest] = useState<{ ok: boolean; detail: string } | null>(null);
  const [testing, startTest] = useTransition();
  const [copied, setCopied] = useState(false);

  const email = state?.ok ? state.email : connectedEmail;

  return (
    <div className="space-y-3">
      {email ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm">
            <p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="size-4 shrink-0" />
              Service account key saved
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Now give it access. In Search Console open{" "}
              <strong>Settings, Users and permissions, Add user</strong> and
              paste this address. Do the same in Analytics under{" "}
              <strong>Admin, Property access management</strong> if you want
              traffic data.
            </p>
            <span className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-background/60 px-2 py-1 font-mono text-[11px]">
                {email}
              </code>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(email).then(
                    () => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    },
                    () => undefined,
                  );
                }}
              >
                <Copy className="size-3.5" />
                {copied ? "Copied" : "Copy"}
              </Button>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={testing}
              onClick={() => startTest(async () => setTest(await testServiceAccount()))}
            >
              {testing && <Loader2 className="size-3.5 animate-spin" />}
              Test the connection
            </Button>
            <form action={removeServiceAccount}>
              <Button type="submit" variant="ghost" size="sm">
                Remove key
              </Button>
            </form>
          </div>

          {test && (
            <p
              className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
                test.ok
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
              }`}
            >
              {test.ok ? (
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
              ) : (
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              )}
              {test.detail}
            </p>
          )}
        </div>
      ) : (
        <form action={formAction} className="space-y-2">
          <Label htmlFor="sa-json">Service account JSON key</Label>
          <textarea
            id="sa-json"
            name="json"
            rows={5}
            spellCheck={false}
            placeholder='{"type":"service_account","project_id":"…","private_key":"-----BEGIN PRIVATE KEY-----…","client_email":"…@….iam.gserviceaccount.com", …}'
            className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-[11px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-[11px] text-muted-foreground">
            Paste the whole file Google downloaded. It is stored encrypted and
            never leaves this machine except to ask Google for a token.
          </p>
          {state && !state.ok && state.error && (
            <p className="text-xs text-destructive">{state.error}</p>
          )}
          <Button type="submit" size="sm" disabled={pending}>
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            Save key
          </Button>
        </form>
      )}
    </div>
  );
}
