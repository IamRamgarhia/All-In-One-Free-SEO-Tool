"use client";

import { useTranslations, useLocale } from "next-intl";
import { useActionState, useState, useTransition } from "react";
import { Check, Copy, Key, Loader2, Plus, Trash2 } from "lucide-react";
import {
  createApiKey,
  revokeApiKey,
  type CreateApiKeyState,
} from "./actions";

export type ApiKeyRow = {
  id: number;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
};

export function ApiKeyManager({ initial }: { initial: ApiKeyRow[] }) {
  const tx = useTranslations("ui.app_settings_api-keys_manager");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState<
    CreateApiKeyState | null,
    FormData
  >(createApiKey, null);
  const [copied, setCopied] = useState(false);
  const [, startRevoke] = useTransition();

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="space-y-4">
      <form action={formAction} className="grid gap-3 md:grid-cols-[1fr_140px_120px]">
        <input
          name="name"
          required
          placeholder={tx("eGN8nIntegration")}
          className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
        <select
          name="scope"
          defaultValue="read"
          className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
        >
          <option value="read">{tx("read")}</option>
          <option value="write">{tx("write")}</option>
          <option value="admin">{tx("admin")}</option>
        </select>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center justify-center rounded-md bg-violet-500/15 px-4 text-xs font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-3 animate-spin" />
              {tx("creating")}
            </>
          ) : (
            <>
              <Plus className="mr-2 size-3" />
              {tx("create")}
            </>
          )}
        </button>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && (
        <div className="rounded-md bg-emerald-500/10 px-3 py-3 ring-1 ring-inset ring-emerald-500/30 space-y-2">
          <p className="text-xs font-medium text-emerald-300">
            {tx("keyCreatedCopyItNow")}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-black/40 px-2 py-1.5 font-mono text-xs">
              {state.rawKey}
            </code>
            <button
              type="button"
              onClick={() => copy(state.rawKey)}
              className="inline-flex h-8 items-center rounded-md bg-white/5 px-2 text-[11px] text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10"
            >
              {copied ? (
                <>
                  <Check className="mr-1 size-3 text-emerald-300" />
                  {tx("copied")}
                </>
              ) : (
                <>
                  <Copy className="mr-1 size-3" />
                  {tx("copy")}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {initial.length > 0 && (
        <ul className="space-y-2">
          {initial.map((k) => (
            <li
              key={k.id}
              className={`flex items-center justify-between rounded-md px-3 py-2 ring-1 ring-inset text-xs ${
                k.revokedAt
                  ? "bg-white/[0.02] ring-white/5 opacity-60"
                  : "bg-white/[0.04] ring-white/10"
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <Key className="size-3 shrink-0 text-violet-300" />
                <div className="min-w-0">
                  <div className="truncate font-medium">{k.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {tx.rich("scopes", { keyPrefix: k.keyPrefix, v: k.scopes.join(", "), b0: (chunks) => <code>{chunks}</code> })}
                    {k.lastUsedAt
                      ? `used ${k.lastUsedAt.toLocaleString(locale)}`
                      : "never used"}
                  </div>
                </div>
              </div>
              {!k.revokedAt && (
                <button
                  type="button"
                  onClick={() =>
                    startRevoke(async () => {
                      await revokeApiKey(k.id);
                    })
                  }
                  className="inline-flex h-7 items-center rounded-md bg-rose-500/10 px-2 text-rose-300 ring-1 ring-inset ring-rose-500/30 hover:bg-rose-500/20"
                >
                  <Trash2 className="mr-1 size-3" />
                  {tx("revoke")}
                </button>
              )}
              {k.revokedAt && (
                <span className="text-[10px] text-muted-foreground">
                  {tx("revoked", { v: k.revokedAt.toLocaleDateString(locale) })}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-[10px] text-muted-foreground">
        {tx.rich("useAuthorizationBearerYourKey", { b0: (chunks) => <code className="rounded bg-white/5 px-1 py-0.5">{chunks}</code>, b1: (chunks) => <code>{chunks}</code>, b2: (chunks) => <code>{chunks}</code>, b3: (chunks) => <code>{chunks}</code>, b4: (chunks) => <code>{chunks}</code> })}
      </p>
    </div>
  );
}
