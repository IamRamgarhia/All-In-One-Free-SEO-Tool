"use client";

import { useActionState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generateBriefAction, type GenerateBriefResult } from "./actions";

export function GenerateBriefForm({
  clients,
}: {
  clients: { id: number; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<
    GenerateBriefResult | null,
    FormData
  >(generateBriefAction, null);

  if (clients.length === 0) {
    return (
      <div className="rounded-2xl border border-white/5 bg-card/40 p-5 text-sm text-muted-foreground backdrop-blur-md">
        Add a client first, then you can generate content briefs here.
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="rounded-2xl border border-white/5 bg-card/40 p-5 backdrop-blur-md"
    >
      <div className="grid gap-3 md:grid-cols-[auto_1fr_auto] md:items-end">
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
          <Label htmlFor="targetKeyword">Target keyword or topic</Label>
          <Input
            id="targetKeyword"
            name="targetKeyword"
            placeholder="how to improve organic traffic"
            required
            minLength={2}
            maxLength={150}
          />
        </div>
        <Button
          type="submit"
          disabled={pending}
          className="shadow-lg shadow-violet-500/25 ring-1 ring-inset ring-white/15"
        >
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles className="size-4" />
              Generate brief
            </>
          )}
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        We&apos;ll search the top 5 results, extract their headings + average
        word count, and aggregate a brief with PAA-style questions. Takes
        15–25 seconds.
      </p>
      {state && !state.ok && (
        <p className="mt-3 text-xs text-rose-300">{state.error}</p>
      )}
    </form>
  );
}
