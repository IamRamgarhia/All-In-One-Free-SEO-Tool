import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, invoices } from "@/db/schema";
import { getSetting } from "@/lib/settings-store";
import {
  invoiceTotals,
  formatMoney,
  lineAmount,
} from "@/lib/invoice-utils";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const invoiceId = Number(id);
  if (!Number.isFinite(invoiceId)) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, invoice.clientId))
    .limit(1);

  const brandName = await getSetting<string>("brand.name");
  const brandColor = await getSetting<string>("brand.color");
  const brandLogo = await getSetting<string>("brand.logo_data_url");

  const accent =
    brandColor && /^#[0-9a-f]{6}$/i.test(brandColor)
      ? brandColor
      : "#6d49d6";

  const ink = "#0f1117";
  const mute = "#5b6173";
  const rule = "#dde0e7";

  const { subtotal, tax, total } = invoiceTotals(invoice.items, invoice.taxRate);

  const buffers: Buffer[] = [];
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
    info: {
      Title: `Invoice ${invoice.invoiceNumber}`,
      Author: brandName ?? "SEO Tool",
    },
  });

  doc.on("data", (chunk: Buffer) => buffers.push(chunk));
  const finished = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(buffers)));
  });

  // Header: logo + brand name
  let logoBuffer: Buffer | null = null;
  if (brandLogo) {
    const m = brandLogo.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (m && (m[1] === "image/png" || m[1] === "image/jpeg")) {
      try {
        logoBuffer = Buffer.from(m[2], "base64");
      } catch {
        logoBuffer = null;
      }
    }
  }
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, 50, 50, { fit: [100, 36] });
    } catch {
      /* ignore */
    }
  }
  doc.fontSize(10).fillColor(mute).text(brandName ?? "SEO tool", 200, 55, {
    align: "right",
  });

  // Invoice meta
  doc.moveDown(3);
  doc
    .fontSize(28)
    .fillColor(accent)
    .font("Helvetica-Bold")
    .text("INVOICE");
  doc
    .fontSize(11)
    .fillColor(ink)
    .font("Helvetica")
    .text(invoice.invoiceNumber);

  doc.moveDown(1);

  // Two-column meta block: Bill to / Issue/Due
  const colTop = doc.y;
  doc
    .fontSize(9)
    .fillColor(mute)
    .text("BILL TO", 50, colTop, { characterSpacing: 1.5 });
  doc.fontSize(11).fillColor(ink).font("Helvetica-Bold").text(
    client?.name ?? "—",
    50,
    colTop + 12,
  );
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(mute)
    .text(client?.url ?? "", 50, colTop + 28);

  doc.fontSize(9).fillColor(mute).text("ISSUED", 350, colTop, {
    characterSpacing: 1.5,
  });
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(ink)
    .text(invoice.issueDate.toLocaleDateString(), 350, colTop + 12);

  if (invoice.dueDate) {
    doc.fontSize(9).fillColor(mute).text("DUE", 350, colTop + 30, {
      characterSpacing: 1.5,
    });
    doc.fontSize(10).fillColor(ink).text(
      invoice.dueDate.toLocaleDateString(),
      350,
      colTop + 42,
    );
  }

  doc.moveDown(5);

  // Line items table
  const tableTop = doc.y + 10;
  doc
    .strokeColor(rule)
    .lineWidth(0.5)
    .moveTo(50, tableTop - 6)
    .lineTo(545, tableTop - 6)
    .stroke();

  doc.fontSize(9).fillColor(mute).font("Helvetica-Bold");
  doc.text("DESCRIPTION", 50, tableTop, { characterSpacing: 1 });
  doc.text("QTY", 350, tableTop, { width: 40, align: "right", characterSpacing: 1 });
  doc.text("RATE", 400, tableTop, { width: 60, align: "right", characterSpacing: 1 });
  doc.text("AMOUNT", 470, tableTop, { width: 75, align: "right", characterSpacing: 1 });

  doc
    .strokeColor(rule)
    .lineWidth(0.5)
    .moveTo(50, tableTop + 14)
    .lineTo(545, tableTop + 14)
    .stroke();

  doc.font("Helvetica").fillColor(ink).fontSize(10);
  let y = tableTop + 22;
  for (const item of invoice.items) {
    doc.text(item.description, 50, y, { width: 290 });
    doc.text(String(item.quantity), 350, y, { width: 40, align: "right" });
    doc.text(formatMoney(item.rate, invoice.currency), 400, y, {
      width: 60,
      align: "right",
    });
    doc.text(
      formatMoney(lineAmount(item), invoice.currency),
      470,
      y,
      { width: 75, align: "right" },
    );
    y += 22;
  }

  doc
    .strokeColor(rule)
    .lineWidth(0.5)
    .moveTo(350, y + 4)
    .lineTo(545, y + 4)
    .stroke();

  y += 14;
  doc.fontSize(10).fillColor(mute).text("Subtotal", 350, y, {
    width: 110,
    align: "right",
  });
  doc.fillColor(ink).text(formatMoney(subtotal, invoice.currency), 470, y, {
    width: 75,
    align: "right",
  });

  if (invoice.taxRate > 0) {
    y += 18;
    doc.fillColor(mute).text(
      `Tax (${(invoice.taxRate / 100).toFixed(2)}%)`,
      350,
      y,
      { width: 110, align: "right" },
    );
    doc.fillColor(ink).text(formatMoney(tax, invoice.currency), 470, y, {
      width: 75,
      align: "right",
    });
  }

  y += 24;
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor(accent)
    .text("Total", 350, y, { width: 110, align: "right" });
  doc.text(formatMoney(total, invoice.currency), 470, y, {
    width: 75,
    align: "right",
  });

  // Notes
  if (invoice.notes) {
    doc.font("Helvetica").fontSize(10).fillColor(mute);
    doc.text("Notes", 50, y + 60);
    doc.fillColor(ink).fontSize(10).text(invoice.notes, 50, y + 75, {
      width: 495,
    });
  }

  // Status watermark
  if (invoice.status === "paid") {
    doc.save();
    doc.fontSize(60).fillColor("#0f9460").opacity(0.15).rotate(-25, {
      origin: [300, 400],
    });
    doc.text("PAID", 200, 380, { align: "center", width: 200 });
    doc.restore();
  } else if (invoice.status === "void") {
    doc.save();
    doc.fontSize(60).fillColor(mute).opacity(0.15).rotate(-25, {
      origin: [300, 400],
    });
    doc.text("VOID", 200, 380, { align: "center", width: 200 });
    doc.restore();
  }

  // Footer
  doc
    .fillColor(mute)
    .font("Helvetica-Oblique")
    .fontSize(8)
    .text(
      brandName
        ? `Thank you for your business · ${brandName}`
        : `Generated by SEO tool · ${new Date().toLocaleString()}`,
      50,
      doc.page.height - 40,
      { align: "center", width: doc.page.width - 100 },
    );

  doc.end();
  const pdf = await finished;

  const filename = `${invoice.invoiceNumber.replace(/[^a-z0-9-]+/gi, "-")}.pdf`;

  // @ts-expect-error - Buffer is valid BodyInit at runtime
  return new NextResponse(pdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
