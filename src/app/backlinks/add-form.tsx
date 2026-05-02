"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addBacklink, type AddBacklinkResult } from "./actions";

export function AddBacklinkForm({
  clients,
}: {
  clients: { id: number; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<
    AddBacklinkResult | null,
    FormData
  >(addBacklink, null);

  if (clients.length === 0) {
    return (
      <div className="rounded-2xl border border-white/5 bg-card/40 p-5 text-sm text-muted-foreground backdrop-blur-md">
        Add a client first, then you can log their backlinks here.
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="rounded-2xl border border-white/5 bg-card/40 p-5 backdrop-blur-md"
    >
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="clientId">For client</Label>
          <select
            id="clientId"
            name="clientId"
            defaultValue={clients[0].id}
            className="flex h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 py-1 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="sourceUrl">Source URL (the linking page)</Label>
          <Input
            id="sourceUrl"
            name="sourceUrl"
            placeholder="techcrunch.com/some-article"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="targetUrl">Target page (optional)</Label>
          <Input
            id="targetUrl"
            name="targetUrl"
            placeholder="https://yoursite.com/page"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="anchorText">Anchor text</Label>
          <Input id="anchorText" name="anchorText" placeholder="best widgets" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="domainAuthority">DA / DR (0–100)</Label>
          <Input
            id="domainAuthority"
            name="domainAuthority"
            type="number"
            min="0"
            max="100"
            placeholder="65"
          />
        </div>
        <div className="space-y-1.5 md:col-span-3">
          <Label htmlFor="notes">Notes</Label>
          <Input id="notes" name="notes" placeholder="How you got it, context, etc." />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button
          type="submit"
          disabled={pending}
          className="shadow-lg shadow-violet-500/25 ring-1 ring-inset ring-white/15"
        >
          <Plus className="size-4" />
          {pending ? "Adding…" : "Add backlink"}
        </Button>
        {state && !state.ok && (
          <span className="text-xs text-rose-300">{state.error}</span>
        )}
      </div>
    </form>
  );
}
