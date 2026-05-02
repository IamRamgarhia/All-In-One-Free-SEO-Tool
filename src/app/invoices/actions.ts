"use server";

import { revalidatePath } from "next/cache";
import { count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { invoices } from "@/db/schema";
import { redirect } from "next/navigation";

const lineSchema = z.object({
  description: z.string().trim().min(1).max(200),
  quantity: z.coerce.number().min(0).max(10_000),
  rate: z.coerce.number().min(0).max(1_000_000),
});

const inputSchema = z.object({
  clientId: z.coerce.number().int().positive(),
  invoiceNumber: z.string().trim().min(1).max(40),
  issueDate: z.string().trim().optional(),
  dueDate: z.string().trim().optional(),
  currency: z.string().trim().min(2).max(8).default("USD"),
  taxPercent: z.coerce.number().min(0).max(100).default(0),
  notes: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type CreateInvoiceResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

async function nextInvoiceNumber(): Promise<string> {
  const [{ value }] = await db.select({ value: count() }).from(invoices);
  const year = new Date().getFullYear();
  return `INV-${year}-${String(value + 1).padStart(4, "0")}`;
}

export async function createInvoice(
  _prev: CreateInvoiceResult | null,
  formData: FormData,
): Promise<CreateInvoiceResult> {
  const parsed = inputSchema.safeParse({
    clientId: formData.get("clientId"),
    invoiceNumber: formData.get("invoiceNumber") || (await nextInvoiceNumber()),
    issueDate: formData.get("issueDate") ?? undefined,
    dueDate: formData.get("dueDate") ?? undefined,
    currency: formData.get("currency") ?? "USD",
    taxPercent: formData.get("taxPercent") ?? 0,
    notes: formData.get("notes") ?? undefined,
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  // Pull repeating fields from formData
  const descriptions = formData.getAll("description");
  const quantities = formData.getAll("quantity");
  const rates = formData.getAll("rate");

  const items: {
    description: string;
    quantity: number;
    rate: number;
  }[] = [];

  for (let i = 0; i < descriptions.length; i++) {
    const d = String(descriptions[i] ?? "").trim();
    if (!d) continue;
    const q = Number(quantities[i] ?? 0);
    const r = Number(rates[i] ?? 0);
    const lp = lineSchema.safeParse({
      description: d,
      quantity: q,
      rate: r,
    });
    if (lp.success) items.push(lp.data);
  }

  if (items.length === 0) {
    return { ok: false, error: "Add at least one line item." };
  }

  const issueDate = parsed.data.issueDate
    ? new Date(parsed.data.issueDate)
    : new Date();
  const dueDate = parsed.data.dueDate
    ? new Date(parsed.data.dueDate)
    : null;

  const [row] = await db
    .insert(invoices)
    .values({
      clientId: parsed.data.clientId,
      invoiceNumber: parsed.data.invoiceNumber,
      status: "draft",
      issueDate,
      dueDate,
      items,
      currency: parsed.data.currency.toUpperCase(),
      taxRate: Math.round(parsed.data.taxPercent * 100),
      notes: parsed.data.notes,
    })
    .returning({ id: invoices.id });

  revalidatePath("/invoices");
  redirect(`/invoices/${row.id}`);
}

export async function setInvoiceStatus(
  invoiceId: number,
  status: "draft" | "sent" | "paid" | "overdue" | "void",
) {
  if (!Number.isFinite(invoiceId) || invoiceId <= 0) return;
  const updates: { status: typeof status; updatedAt: Date; paidAt?: Date } = {
    status,
    updatedAt: new Date(),
  };
  if (status === "paid") updates.paidAt = new Date();
  await db
    .update(invoices)
    .set(updates)
    .where(eq(invoices.id, invoiceId));
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
}

export async function deleteInvoice(invoiceId: number) {
  if (!Number.isFinite(invoiceId) || invoiceId <= 0) return;
  await db.delete(invoices).where(eq(invoices.id, invoiceId));
  revalidatePath("/invoices");
  redirect("/invoices");
}

export async function getNextInvoiceNumber(): Promise<string> {
  return nextInvoiceNumber();
}

void desc;
