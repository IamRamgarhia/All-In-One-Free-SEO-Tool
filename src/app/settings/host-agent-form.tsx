"use client";

import { useActionState } from "react";
import { saveHostAgent } from "./host-agent-actions";

export function HostAgentForm({
  enabled,
  forcedOff,
  fromEnv,
}: {
  enabled: boolean;
  forcedOff: boolean;
  fromEnv: boolean;
}) {
  const [state, action, pending] = useActionState(saveHostAgent, null);
  return (
    <form action={action} className="space-y-3">
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={enabled}
          disabled={forcedOff || fromEnv}
          className="mt-1 size-4"
        />
        <span>
          Let this app run Claude Code, <code>gh</code> and <code>git</code> on this computer
          {forcedOff && (
            <span className="block text-xs text-muted-foreground">
              Forced off by <code>SEO_TOOL_HOST_AGENT=0</code> in the server&apos;s environment.
            </span>
          )}
          {fromEnv && (
            <span className="block text-xs text-muted-foreground">
              Forced on by <code>SEO_TOOL_HOST_AGENT=1</code> in the server&apos;s environment.
            </span>
          )}
        </span>
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || forcedOff || fromEnv}
          className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {state?.ok && <span className="text-xs text-emerald-300">Saved.</span>}
        {state && !state.ok && <span className="text-xs text-rose-300">{state.error}</span>}
      </div>
    </form>
  );
}
