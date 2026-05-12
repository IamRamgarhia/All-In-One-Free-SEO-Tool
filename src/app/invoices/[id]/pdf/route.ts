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
  const brandTagline = await getSetting<string>("brand.tagline");
  const brandWebsite = await getSetting<string>("brand.website");
  const brandEmail = await getSetting<string>("brand.email");
  const brandPhone = await getSetting<string>("brand.phone");
  const brandFooterText = await getSetting<string>("brand.footer_text");

  const accent =
    brandColor && /^#[0-9a-f]{6}$/i.test(brandColor)
      ? brandColor
      : "#6d49d6";

  const ink = "#0f1117";
  const mute = "#5b6173";
  const rule = "#dde0e7";

  const { subtotal, tax, total } = invoiceTotals(invoice.items, invoice.taxRate);

  const buffers: Buffer[] = [];
  // Tighter margins + auto-pagination disabled. We size every section
  // so a normal invoice (1-15 line items + tax + notes) fits on a
  // single A4 page. Wider invoices fall back to a second page
  // gracefully but the common case is one page.
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 40, bottom: 40, left: 40, right: 40 },
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
  // Layout coordinates. Everything below is positioned explicitly so
  // the entire invoice fits on one A4 page for the common case
  // (≤15 line items + notes + tax).
  const LEFT = 40;
  const RIGHT = 555; // 595 - 40
  const COL_BILL_X = LEFT;
  const COL_META_X = 380;
  const TABLE_QTY_X = 340;
  const TABLE_RATE_X = 400;
  const TABLE_AMT_X = 470;

  // Header band: logo (left) + brand name (right). Fixed height 60px.
  const HEADER_HEIGHT = 60;
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, LEFT, 40, { fit: [110, 36] });
    } catch {
      /* ignore */
    }
  }
  if (brandName) {
    doc
      .fontSize(11)
      .fillColor(ink)
      .font("Helvetica-Bold")
      .text(brandName, LEFT + 160, 42, {
        align: "right",
        width: RIGHT - LEFT - 160,
      });
    // Stack of small contact lines underneath. Each line is conditional
    // — only what the user actually filled in shows.
    const contactBits = [brandTagline, brandEmail, brandPhone, brandWebsite]
      .filter((s): s is string => Boolean(s))
      .slice(0, 3);
    if (contactBits.length > 0) {
      doc
        .fontSize(8.5)
        .fillColor(mute)
        .font("Helvetica")
        .text(contactBits.join(" · "), LEFT + 160, 58, {
          align: "right",
          width: RIGHT - LEFT - 160,
        });
    }
  }

  // INVOICE title row — moderate jump, not the doc.moveDown(3) of before
  doc
    .fontSize(24)
    .fillColor(accent)
    .font("Helvetica-Bold")
    .text("INVOICE", LEFT, 40 + HEADER_HEIGHT + 12);
  doc
    .fontSize(11)
    .fillColor(ink)
    .font("Helvetica")
    .text(invoice.invoiceNumber, LEFT, 40 + HEADER_HEIGHT + 42);

  // Two-column meta block: Bill to / Issue/Due
  const metaTop = 40 + HEADER_HEIGHT + 72;
  doc
    .fontSize(9)
    .fillColor(mute)
    .font("Helvetica-Bold")
    .text("BILL TO", COL_BILL_X, metaTop, { characterSpacing: 1.5 });
  doc
    .fontSize(11)
    .fillColor(ink)
    .font("Helvetica-Bold")
    .text(client?.name ?? "—", COL_BILL_X, metaTop + 13);
  if (client?.url) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(mute)
      .text(client.url, COL_BILL_X, metaTop + 28);
  }

  doc
    .fontSize(9)
    .fillColor(mute)
    .font("Helvetica-Bold")
    .text("ISSUED", COL_META_X, metaTop, { characterSpacing: 1.5 });
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(ink)
    .text(invoice.issueDate.toLocaleDateString(), COL_META_X, metaTop + 13);

  if (invoice.dueDate) {
    doc
      .fontSize(9)
      .fillColor(mute)
      .font("Helvetica-Bold")
      .text("DUE", COL_META_X, metaTop + 30, { characterSpacing: 1.5 });
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(ink)
      .text(invoice.dueDate.toLocaleDateString(), COL_META_X, metaTop + 43);
  }

  // Line items table — anchored 60px below the meta block, regardless
  // of how many lines the meta produced. Saves the runaway moveDown(5).
  const tableTop = metaTop + 64;
  doc
    .strokeColor(rule)
    .lineWidth(0.5)
    .moveTo(LEFT, tableTop - 6)
    .lineTo(RIGHT, tableTop - 6)
    .stroke();

  doc.fontSize(8).fillColor(mute).font("Helvetica-Bold");
  doc.text("DESCRIPTION", LEFT, tableTop, { characterSpacing: 1 });
  doc.text("QTY", TABLE_QTY_X, tableTop, {
    width: 50,
    align: "right",
    characterSpacing: 1,
  });
  doc.text("RATE", TABLE_RATE_X, tableTop, {
    width: 60,
    align: "right",
    characterSpacing: 1,
  });
  doc.text("AMOUNT", TABLE_AMT_X, tableTop, {
    width: 85,
    align: "right",
    characterSpacing: 1,
  });

  doc
    .strokeColor(rule)
    .lineWidth(0.5)
    .moveTo(LEFT, tableTop + 12)
    .lineTo(RIGHT, tableTop + 12)
    .stroke();

  // Line item row height: 16px (was 22). Comfortable but compact.
  doc.font("Helvetica").fillColor(ink).fontSize(10);
  let y = tableTop + 18;
  for (const item of invoice.items) {
    doc.text(item.description, LEFT, y, { width: 290 });
    doc.text(String(item.quantity), TABLE_QTY_X, y, {
      width: 50,
      align: "right",
    });
    doc.text(formatMoney(item.rate, invoice.currency), TABLE_RATE_X, y, {
      width: 60,
      align: "right",
    });
    doc.text(formatMoney(lineAmount(item), invoice.currency), TABLE_AMT_X, y, {
      width: 85,
      align: "right",
    });
    y += 16;
  }

  doc
    .strokeColor(rule)
    .lineWidth(0.5)
    .moveTo(TABLE_QTY_X, y + 2)
    .lineTo(RIGHT, y + 2)
    .stroke();

  y += 10;
  doc.fontSize(10).fillColor(mute).font("Helvetica").text("Subtotal", TABLE_QTY_X, y, {
    width: 120,
    align: "right",
  });
  doc.fillColor(ink).text(formatMoney(subtotal, invoice.currency), TABLE_AMT_X, y, {
    width: 85,
    align: "right",
  });

  if (invoice.taxRate > 0) {
    y += 16;
    doc.fillColor(mute).text(
      `Tax (${(invoice.taxRate / 100).toFixed(2)}%)`,
      TABLE_QTY_X,
      y,
      { width: 120, align: "right" },
    );
    doc.fillColor(ink).text(formatMoney(tax, invoice.currency), TABLE_AMT_X, y, {
      width: 85,
      align: "right",
    });
  }

  y += 20;
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(accent)
    .text("Total", TABLE_QTY_X, y, { width: 120, align: "right" });
  doc.text(formatMoney(total, invoice.currency), TABLE_AMT_X, y, {
    width: 85,
    align: "right",
  });

  // Notes — compact gap, not the 60px of before
  if (invoice.notes) {
    doc.font("Helvetica-Bold").fontSize(9).fillColor(mute);
    doc.text("NOTES", LEFT, y + 40, { characterSpacing: 1.5 });
    doc.font("Helvetica").fillColor(ink).fontSize(10).text(
      invoice.notes,
      LEFT,
      y + 54,
      { width: RIGHT - LEFT },
    );
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

  // Footer — uses brand.footer_text when set (registration info,
  // tagline, address); falls back to a generic line otherwise.
  doc
    .fillColor(mute)
    .font("Helvetica-Oblique")
    .fontSize(8)
    .text(
      brandFooterText ??
        (brandName
          ? `Thank you for your business · ${brandName}`
          : `Generated by SEO tool · ${new Date().toLocaleString()}`),
      LEFT,
      doc.page.height - 30,
      { align: "center", width: doc.page.width - LEFT * 2 },
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
