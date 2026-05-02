export type InvoiceItem = {
  description: string;
  quantity: number;
  rate: number;
};

export function lineAmount(item: InvoiceItem): number {
  return item.quantity * item.rate;
}

export function invoiceTotals(
  items: InvoiceItem[],
  taxRateBasisPoints: number,
): { subtotal: number; tax: number; total: number } {
  const subtotal = items.reduce((sum, i) => sum + lineAmount(i), 0);
  const tax = (subtotal * taxRateBasisPoints) / 10_000;
  return {
    subtotal,
    tax,
    total: subtotal + tax,
  };
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
