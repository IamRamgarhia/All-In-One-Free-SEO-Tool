"use client";

import { useActionState, useState } from "react";
import { Plus, X, Check, AlertCircle, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTask, type CreateTaskResult } from "./actions";

export function NewTaskTrigger({
  clients,
}: {
  clients: { id: number; name: string }[];
}) {
  const [open, setOpen] = useState(false);

  if (clients.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">
        Add a client to create tasks
      </span>
    );
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="shadow-md shadow-amber-500/20"
      >
        <Plus className="size-4" />
        Add task
      </Button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="mt-[8vh] w-full max-w-lg rounded-2xl border border-white/10 bg-card/95 p-5 shadow-2xl backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">New task</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <CreateForm
              clients={clients}
              onCreated={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}

function CreateForm({
  clients,
  onCreated,
}: {
  clients: { id: number; name: string }[];
  onCreated: () => void;
}) {
  const [state, formAction, pending] = useActionState<
    CreateTaskResult | null,
    FormData
  >(createTask, null);

  if (state?.ok) {
    setTimeout(onCreated, 600);
  }

  return (
    <form action={formAction} className="mt-4 space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="clientId">Client</Label>
        <select
          id="clientId"
          name="clientId"
          defaultValue={clients[0].id}
          required
          className="flex h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 py-1 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          placeholder="Refresh top 5 cornerstone articles"
          required
          minLength={2}
          maxLength={200}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="whyItMatters">Why it matters (optional)</Label>
        <Input
          id="whyItMatters"
          name="whyItMatters"
          placeholder="Stops content decay on traffic-driving pages"
          maxLength={500}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="priority">Priority</Label>
          <select
            id="priority"
            name="priority"
            defaultValue="medium"
            className="flex h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 py-1 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dueInDays">Due in (days)</Label>
          <Input
            id="dueInDays"
            name="dueInDays"
            type="number"
            min="0"
            max="365"
            placeholder="7"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="recurringInterval" className="flex items-center gap-1">
            <Repeat className="size-3" /> Repeat
          </Label>
          <select
            id="recurringInterval"
            name="recurringInterval"
            defaultValue=""
            className="flex h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 py-1 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            <option value="">No</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
          </select>
        </div>
      </div>

      {state && (
        <div
          className={
            state.ok
              ? "flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300"
              : "flex items-center gap-2 rounded-md border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs text-rose-300"
          }
        >
          {state.ok ? (
            <Check className="size-3.5" />
          ) : (
            <AlertCircle className="size-3.5" />
          )}
          {state.ok ? "Created." : state.error}
        </div>
      )}

      <div className="flex items-center gap-2 pt-2">
        <Button type="submit" disabled={pending}>
          <Plus className="size-4" />
          {pending ? "Creating…" : "Create task"}
        </Button>
      </div>
    </form>
  );
}
