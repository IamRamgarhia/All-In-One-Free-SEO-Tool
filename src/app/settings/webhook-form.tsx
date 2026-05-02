"use client";

import { useActionState, useState } from "react";
import { Send, Save, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveWebhookUrl,
  testWebhook,
  type WebhookActionResult,
} from "./actions";

export function WebhookForm({ initialUrl }: { initialUrl: string | null }) {
  const [draft, setDraft] = useState(initialUrl ?? "");

  const [saveState, saveAction, savePending] = useActionState<
    WebhookActionResult | null,
    FormData
  >(saveWebhookUrl, null);

  const [testState, testAction, testPending] = useActionState<
    WebhookActionResult | null,
    FormData
  >(testWebhook, null);

  // Latest action result (whichever ran most recently)
  const latest =
    (saveState && testState
      ? // pick the one that's "newer" — a state without an error message means saved
        saveState
      : (saveState ?? testState)) ?? null;

  // Auto-detect what kind of webhook it is
  const kind = detectKindClient(draft);

  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="webhook-url">Webhook URL</Label>
        <div className="relative">
          <Input
            id="webhook-url"
            name="url"
            placeholder="https://hooks.slack.com/services/T0XXXXX/B0XXXXX/..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="pr-28"
          />
          {draft && kind !== "generic" && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-violet-300 ring-1 ring-inset ring-violet-500/30">
              {kind}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Paste a Slack incoming webhook, Discord webhook URL, or Microsoft
          Teams connector URL. Leave blank and save to disable.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form action={saveAction}>
          <input type="hidden" name="url" value={draft} />
          <Button
            type="submit"
            disabled={savePending}
            className="shadow-md shadow-violet-500/20"
          >
            <Save className="size-4" />
            {savePending ? "Saving…" : "Save webhook"}
          </Button>
        </form>
        <form action={testAction}>
          <input type="hidden" name="url" value={draft} />
          <Button
            type="submit"
            variant="outline"
            disabled={testPending || draft.trim() === ""}
            className="border-white/10 bg-white/5"
          >
            <Send className="size-4" />
            {testPending ? "Sending…" : "Send test"}
          </Button>
        </form>
      </div>

      {latest && (
        <div
          className={
            latest.ok
              ? "flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-300"
              : "flex items-start gap-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-sm text-rose-300"
          }
        >
          {latest.ok ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
          )}
          <span>{latest.ok ? latest.message : latest.error}</span>
        </div>
      )}
    </div>
  );
}

// Mirror of detectKind from notifier.ts (client-safe)
function detectKindClient(
  url: string,
): "slack" | "discord" | "teams" | "generic" {
  if (/hooks\.slack\.com/i.test(url)) return "slack";
  if (/discord(?:app)?\.com\/api\/webhooks/i.test(url)) return "discord";
  if (
    /(?:office\.com|outlook\.com|webhook\.office\.com|teams\.microsoft\.com)/i.test(
      url,
    )
  )
    return "teams";
  return "generic";
}
