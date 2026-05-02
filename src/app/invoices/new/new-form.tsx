"use client";

import { useActionState, useState } from "react";
import { Plus, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createInvoice,
  type CreateInvoiceResult,
} from "../actions";

type Line = { description: string; quantity: string; rate: string };

const blankLine = (): Line => ({
  description: "",
  quantity: "1",
  rate: "",
});

export function NewInvoiceForm({
  clients,
  defaultInvoiceNumber,
}: {
  clients: { id: number; name: string }[];
  defaultInvoiceNumber: string;
}) {
  const [lines, setLines] = useState<Line[]>([
    { description: "Monthly SEO retainer", quantity: "1", rate: "" },
  ]);
  const [taxPercent, setTaxPercent] = useState("0");

  const [state, formAction, pending] = useActionState<
    CreateInvoiceResult | null,
    FormData
  >(createInvoice, null);

  if (clients.length === 0) {
    return (
      <div className="rounded-2xl border border-white/5 bg-card/40 p-5 text-sm text-muted-foreground backdrop-blur-md">
        Add a client first, then create an invoice.
      </div>
    );
  }

  const subtotal = lines.reduce((sum, l) => {
    const q = Number(l.quantity) || 0;
    const r = Number(l.rate) || 0;
    return sum + q * r;
  }, 0);
  const tax = subtotal * (Number(taxPercent) || 0) / 100;
  const total = subtotal + tax;

  const addLine = () => setLines((ls) => [...ls, blankLine()]);
  const removeLine = (i: number) =>
    setLines((ls) => (ls.length === 1 ? ls : ls.filter((_, idx) => idx !== i)));
  const updateLine = (i: number, key: keyof Line, value: string) =>
    setLines((ls) =>
      ls.map((l, idx) => (idx === i ? { ...l, [key]: value } : l)),
    );

  const today = new Date().toISOString().split("T")[0];
  // eslint-disable-next-line react-hooks/purity
  const nextMonth = new Date(Date.now() + 30 * 86_400_000)
    .toISOString()
    .split("T")[0];

  return (
    <form
      action={formAction}
      className="rounded-2xl border border-white/5 bg-card/40 p-5 backdrop-blur-md"
    >
      <div className="grid gap-4 md:grid-cols-3">
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
          <Label htmlFor="invoiceNumber">Invoice number</Label>
          <Input
            id="invoiceNumber"
            name="invoiceNumber"
            defaultValue={defaultInvoiceNumber}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="currency">Currency</Label>
          <Input
            id="currency"
            name="currency"
            defaultValue="USD"
            maxLength={4}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="issueDate">Issue date</Label>
          <Input
            id="issueDate"
            name="issueDate"
            type="date"
            defaultValue={today}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dueDate">Due date</Label>
          <Input
            id="dueDate"
            name="dueDate"
            type="date"
            defaultValue={nextMonth}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="taxPercent">Tax %</Label>
          <Input
            id="taxPercent"
            name="taxPercent"
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={taxPercent}
            onChange={(e) => setTaxPercent(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-6 space-y-2">
        <Label>Line items</Label>
        <div className="rounded-xl border border-white/5 bg-black/20 p-3 space-y-2">
          {lines.map((l, i) => (
            <div
              key={i}
              className="grid items-center gap-2 md:grid-cols-[1fr_80px_120px_30px]"
            >
              <Input
                name="description"
                placeholder="Description"
                value={l.description}
                onChange={(e) =>
                  updateLine(i, "description", e.target.value)
                }
                required={i === 0}
              />
              <Input
                name="quantity"
                type="number"
                min="0"
                step="0.5"
                value={l.quantity}
                onChange={(e) => updateLine(i, "quantity", e.target.value)}
              />
              <Input
                name="rate"
                type="number"
                min="0"
                step="0.01"
                placeholder="Rate"
                value={l.rate}
                onChange={(e) => updateLine(i, "rate", e.target.value)}
              />
              <button
                type="button"
                onClick={() => removeLine(i)}
                aria-label="Remove line"
                disabled={lines.length === 1}
                className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-30"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addLine}
            className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-xs text-muted-foreground hover:bg-white/10 hover:text-foreground"
          >
            <Plus className="size-3" />
            Add line
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes</Label>
          <Input
            id="notes"
            name="notes"
            placeholder="Payment instructions, thank-you message, etc."
            maxLength={1000}
          />
        </div>
        <div className="rounded-xl border border-white/5 bg-black/20 p-4 text-sm">
          <Row label="Subtotal" value={subtotal.toFixed(2)} />
          <Row label={`Tax (${taxPercent}%)`} value={tax.toFixed(2)} />
          <div className="my-2 h-px bg-white/10" />
          <Row label="Total" value={total.toFixed(2)} bold />
        </div>
      </div>

      {state && !state.ok && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs text-rose-300">
          <AlertCircle className="size-3.5" />
          {state.error}
        </div>
      )}

      <div className="mt-4">
        <Button
          type="submit"
          disabled={pending}
          className="shadow-md shadow-amber-500/20"
        >
          {pending ? "Creating…" : "Create invoice"}
        </Button>
      </div>
    </form>
  );
}

function Row({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between text-xs ${bold ? "font-bold text-foreground" : "text-muted-foreground"}`}
    >
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
