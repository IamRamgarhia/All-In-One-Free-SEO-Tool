"use client";

import { useTranslations, useLocale } from "next-intl";
import { useActionState, useState, useTransition } from "react";
import {
  Check,
  Copy,
  Loader2,
  Plus,
  Power,
  PowerOff,
  Trash2,
  Webhook,
} from "lucide-react";
import {
  createInboundWebhook,
  deleteInboundWebhook,
  toggleInboundWebhook,
  type CreateInboundState,
} from "./actions";

export type InboundWebhookRow = {
  id: number;
  name: string;
  token: string;
  eventType: string;
  enabled: boolean;
  receiveCount: number;
  lastReceivedAt: Date | null;
  createdAt: Date;
};

export function InboundWebhooksManager({
  initial,
}: {
  initial: InboundWebhookRow[];
}) {
  const tx = useTranslations("ui.app_settings_inbound-webhooks_manager");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState<
    CreateInboundState | null,
    FormData
  >(createInboundWebhook, null);
  const [, startMut] = useTransition();
  const [copiedId, setCopiedId] = useState<number | null>(null);

  function copy(text: string, id: number) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  }

  function urlFor(token: string) {
    if (typeof window === "undefined") return `/api/webhooks/${token}`;
    return `${window.location.origin}/api/webhooks/${token}`;
  }

  return (
    <div className="space-y-4">
      <form action={formAction} className="grid gap-3 md:grid-cols-[1fr_140px_120px]">
        <input
          name="name"
          required
          placeholder={tx("eGGithubRepoActivity")}
          className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
        <select
          name="eventType"
          defaultValue="generic"
          className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
        >
          <option value="generic">generic</option>
          <option value="github">github</option>
          <option value="linear">linear</option>
          <option value="google_alerts">google_alerts</option>
          <option value="custom">custom</option>
        </select>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center justify-center rounded-md bg-cyan-500/15 px-4 text-xs font-medium text-cyan-300 ring-1 ring-inset ring-cyan-500/30 hover:bg-cyan-500/25 disabled:opacity-50"
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
            {tx("webhookCreatedPostPutJson")}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-black/40 px-2 py-1.5 font-mono text-xs">
              {urlFor(state.token)}
            </code>
            <button
              type="button"
              onClick={() => copy(urlFor(state.token), state.id)}
              className="inline-flex h-8 items-center rounded-md bg-white/5 px-2 text-[11px] text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10"
            >
              {copiedId === state.id ? (
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
          {initial.map((h) => (
            <li
              key={h.id}
              className={`rounded-md px-3 py-2 ring-1 ring-inset text-xs ${
                h.enabled
                  ? "bg-white/[0.04] ring-white/10"
                  : "bg-white/[0.02] ring-white/5 opacity-60"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Webhook className="size-3 shrink-0 text-cyan-300" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{h.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {tx("other", { eventType: h.eventType, receiveCount: h.receiveCount })}
                      {h.lastReceivedAt
                        ? ` · last ${new Date(h.lastReceivedAt).toLocaleString(locale)}`
                        : tx("neverReceived")}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => copy(urlFor(h.token), h.id)}
                    className="inline-flex h-7 items-center rounded-md bg-white/5 px-2 text-[11px] text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10"
                  >
                    {copiedId === h.id ? (
                      <>
                        <Check className="mr-1 size-3 text-emerald-300" />
                        URL
                      </>
                    ) : (
                      <>
                        <Copy className="mr-1 size-3" />
                        URL
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      startMut(async () => {
                        await toggleInboundWebhook(h.id, !h.enabled);
                      })
                    }
                    className="inline-flex h-7 items-center rounded-md bg-white/5 px-2 text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10"
                  >
                    {h.enabled ? (
                      <PowerOff className="size-3" />
                    ) : (
                      <Power className="size-3" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      startMut(async () => {
                        await deleteInboundWebhook(h.id);
                      })
                    }
                    className="inline-flex h-7 items-center rounded-md bg-rose-500/10 px-2 text-rose-300 ring-1 ring-inset ring-rose-500/30 hover:bg-rose-500/20"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
