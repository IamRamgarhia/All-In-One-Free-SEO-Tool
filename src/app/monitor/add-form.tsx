"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addMonitoredPage, type AddMonitorResult } from "./actions";

export function AddMonitorForm({
  clients,
}: {
  clients: { id: number; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<
    AddMonitorResult | null,
    FormData
  >(addMonitoredPage, null);

  if (clients.length === 0) {
    return (
      <div className="rounded-2xl border border-white/5 bg-card/40 p-5 text-sm text-muted-foreground backdrop-blur-md">
        Add a client first, then you can monitor their key pages here.
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="rounded-2xl border border-white/5 bg-card/40 p-5 backdrop-blur-md"
    >
      <div className="grid gap-3 md:grid-cols-[auto_1fr_1fr_auto] md:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="clientId">Client</Label>
          <select
            id="clientId"
            name="clientId"
            defaultValue={clients[0].id}
            className="flex h-9 min-w-[10rem] rounded-md border border-white/10 bg-card/60 px-3 py-1 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="url">Page URL</Label>
          <Input
            id="url"
            name="url"
            placeholder="https://acmecoffee.com/products/dark-roast"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="label">Label (optional)</Label>
          <Input id="label" name="label" placeholder="Top product page" />
        </div>
        <Button
          type="submit"
          disabled={pending}
          className="shadow-md shadow-fuchsia-500/20"
        >
          <Plus className="size-4" />
          {pending ? "Adding…" : "Monitor"}
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        We&apos;ll fetch the page now to take a baseline snapshot. Future checks
        compare title, meta description, H1, canonical, and body content — and
        ping your webhook when any change.
      </p>
      {state && !state.ok && (
        <p className="mt-2 text-xs text-rose-300">{state.error}</p>
      )}
    </form>
  );
}
