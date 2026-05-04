"use client";

import { useActionState } from "react";
import { Beaker, Loader2 } from "lucide-react";
import {
  createTitleTest,
  type CreateTitleTestResult,
} from "./actions";

export function CreateTitleTestForm({
  clients,
}: {
  clients: { id: number; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<
    CreateTitleTestResult | null,
    FormData
  >(createTitleTest, null);

  if (clients.length === 0) {
    return (
      <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-200 ring-1 ring-inset ring-amber-500/30">
        Add a client first.
      </p>
    );
  }

  return (
    <form
      action={formAction}
      className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3"
    >
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <Beaker className="size-4 text-violet-300" />
        New title test
      </h2>
      <p className="text-[11px] text-muted-foreground">
        Pick a client + page + 2-5 candidate titles. The runner rotates
        them automatically and picks the highest-CTR winner from GSC.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Client</span>
          <select
            name="clientId"
            defaultValue={clients[0]?.id}
            className="flex h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Page URL</span>
          <input
            name="pageUrl"
            required
            placeholder="https://clientsite.com/page"
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </label>
      </div>

      <label className="block space-y-1 text-xs">
        <span className="text-muted-foreground">
          Candidate titles (one per line, 2-5)
        </span>
        <textarea
          name="titles"
          required
          rows={4}
          placeholder={"Best Vegan Bakery in Portland — Acme\nVegan Bakery Portland | Acme — fresh daily\nPortland's #1 Vegan Bakery"}
          className="w-full rounded-md border border-white/10 bg-card/60 px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
      </label>

      <label className="block space-y-1 text-xs">
        <span className="text-muted-foreground">
          Days per variant (rotation cadence)
        </span>
        <input
          name="durationDays"
          type="number"
          min={7}
          max={60}
          defaultValue={14}
          className="h-9 w-32 rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-9 items-center rounded-md bg-violet-500/15 px-4 text-xs font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50"
      >
        {pending ? (
          <>
            <Loader2 className="mr-2 size-3 animate-spin" />
            Creating…
          </>
        ) : (
          "Start test"
        )}
      </button>
      {state?.ok && <p className="text-xs text-emerald-300">✓ Test started.</p>}
      {state && !state.ok && (
        <p className="text-xs text-rose-300">{state.error}</p>
      )}
    </form>
  );
}
