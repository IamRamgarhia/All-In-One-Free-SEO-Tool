import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

import { Receipt, FileDown, Send, Check, X, Trash2 } from "lucide-react";
import { db } from "@/db/client";
import { clients, invoices } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { invoiceTotals, formatMoney, lineAmount } from "@/lib/invoice-utils";
import { deleteInvoice, setInvoiceStatus } from "../actions";

const statusTone: Record<string, string> = {
  draft: "bg-white/5 text-muted-foreground ring-white/10",
  sent: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  paid: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  overdue: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  void: "bg-white/5 text-muted-foreground ring-white/10",
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const invoiceId = Number(id);
  if (!Number.isFinite(invoiceId)) notFound();

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  if (!invoice) notFound();

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, invoice.clientId))
    .limit(1);

  const { subtotal, tax, total } = invoiceTotals(invoice.items, invoice.taxRate);

  const setSent = setInvoiceStatus.bind(null, invoice.id, "sent");
  const setPaid = setInvoiceStatus.bind(null, invoice.id, "paid");
  const setVoid = setInvoiceStatus.bind(null, invoice.id, "void");
  const setDraft = setInvoiceStatus.bind(null, invoice.id, "draft");
  const removeAction = deleteInvoice.bind(null, invoice.id);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={`Invoice ${invoice.invoiceNumber}`}
        description={`For ${client?.name ?? "—"}. Total ${formatMoney(total, invoice.currency)}.`}
        icon={Receipt}
        accent="amber"
        crumbs={[
          { label: "Invoices", href: "/invoices" },
          { label: invoice.invoiceNumber },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <a
              href={`/invoices/${invoice.id}/pdf`}
              className={buttonVariants({
                variant: "outline",
                className: "border-white/10 bg-white/5",
              })}
              download
            >
              <FileDown className="size-4" />
              Download PDF
            </a>
            {invoice.status === "draft" && (
              <form action={setSent}>
                <Button type="submit">
                  <Send className="size-4" />
                  Mark sent
                </Button>
              </form>
            )}
            {invoice.status !== "paid" && invoice.status !== "void" && (
              <form action={setPaid}>
                <Button
                  type="submit"
                  className="shadow-md shadow-emerald-500/20"
                >
                  <Check className="size-4" />
                  Mark paid
                </Button>
              </form>
            )}
          </div>
        }
        meta={
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusTone[invoice.status]}`}
          >
            {invoice.status}
          </span>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Subtotal" value={formatMoney(subtotal, invoice.currency)} />
        <Stat label="Tax" value={formatMoney(tax, invoice.currency)} />
        <Stat label="Total" value={formatMoney(total, invoice.currency)} bold />
      </div>

      <section className="overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
        <header className="border-b border-white/5 px-5 py-3 text-sm font-semibold">
          Line items
        </header>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-2 text-left font-medium">Description</th>
              <th className="px-5 py-2 text-right font-medium">Qty</th>
              <th className="px-5 py-2 text-right font-medium">Rate</th>
              <th className="px-5 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {invoice.items.map((it, i) => (
              <tr key={i}>
                <td className="px-5 py-3">{it.description}</td>
                <td className="px-5 py-3 text-right font-mono">{it.quantity}</td>
                <td className="px-5 py-3 text-right font-mono">
                  {formatMoney(it.rate, invoice.currency)}
                </td>
                <td className="px-5 py-3 text-right font-mono">
                  {formatMoney(lineAmount(it), invoice.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {invoice.notes && (
        <section className="rounded-2xl border border-white/5 bg-card/40 p-5 text-sm backdrop-blur-md">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Notes
          </div>
          <p className="mt-1.5 whitespace-pre-wrap text-foreground/85">
            {invoice.notes}
          </p>
        </section>
      )}

      <section className="rounded-2xl border border-rose-500/20 bg-rose-500/5 backdrop-blur-md">
        <header className="border-b border-rose-500/20 px-5 py-3 text-sm font-semibold text-rose-300">
          Manage
        </header>
        <div className="flex flex-wrap items-center gap-2 px-5 py-4 text-xs">
          {invoice.status !== "draft" && invoice.status !== "void" && (
            <form action={setDraft}>
              <button
                type="submit"
                className="rounded-md bg-white/5 px-2 py-1 font-medium text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10 hover:text-foreground"
              >
                Revert to draft
              </button>
            </form>
          )}
          {invoice.status !== "void" && invoice.status !== "paid" && (
            <form action={setVoid}>
              <button
                type="submit"
                className="rounded-md bg-white/5 px-2 py-1 font-medium text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10 hover:text-foreground"
              >
                Void
              </button>
            </form>
          )}
          <form action={removeAction}>
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 px-2 py-1 font-medium text-rose-300 ring-1 ring-inset ring-rose-500/30 hover:bg-rose-500/25"
            >
              <Trash2 className="size-3" />
              Delete
            </button>
          </form>
          {client && client.id ? (
            <Link
              href={`/clients/${client.id}`}
              className="ml-auto text-muted-foreground hover:text-foreground hover:underline"
            >
              View client → {client.name}
            </Link>
          ) : null}
        </div>
      </section>

      {/* Suppress unused import if no need for X */}
      {false && <X />}
    </div>
  );
}

function Stat({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-card/40 p-4 backdrop-blur-md">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={
          bold
            ? "mt-1 text-2xl font-bold tracking-tight text-gradient-amber"
            : "mt-1 text-2xl font-semibold tracking-tight"
        }
      >
        {value}
      </div>
    </div>
  );
}
