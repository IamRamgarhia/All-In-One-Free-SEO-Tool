import { Receipt } from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { NewInvoiceForm } from "./new-form";
import { getNextInvoiceNumber } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage() {
  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .orderBy(clients.name);

  const defaultInvoiceNumber = await getNextInvoiceNumber();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="New invoice"
        description="Build a quick invoice for any client. Add line items, tax, and notes — then download as PDF."
        icon={Receipt}
        accent="amber"
        crumbs={[{ label: "Invoices", href: "/invoices" }, { label: "New" }]}
      />
      <NewInvoiceForm
        clients={allClients}
        defaultInvoiceNumber={defaultInvoiceNumber}
      />
    </div>
  );
}
