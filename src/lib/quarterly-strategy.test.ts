/**
 * The quarterly review PDF, read back the way plan-pdf.test.ts does:
 * inflate the content streams and decode the text PDFKit wrote. It was
 * English only, whatever the workspace language.
 */

import zlib from "node:zlib";
import { describe, expect, it, vi } from "vitest";

// No AI provider in tests: a fixed narrative stands in for the model.
vi.mock("./ai-call", () => ({
  callAI: async () => "Ce qui a fonctionné : le rythme des corrections.",
}));

import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { generateQuarterlyStrategyPdf } from "./quarterly-strategy";

async function textOf(locale: "fr" | "en"): Promise<string> {
  const client = db
    .insert(clients)
    .values({ name: `Trimestre ${locale}`, url: `https://trimestre-${locale}.example.test` })
    .returning({ id: clients.id })
    .get();
  const buf = await generateQuarterlyStrategyPdf(client.id, { locale });
  const raw = buf.toString("latin1");
  let streams = "";
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) continue;
    try {
      streams += zlib.inflateSync(buf.subarray(start, end)).toString("latin1");
    } catch {
      // Not a flate text stream.
    }
  }
  return [...streams.matchAll(/<([0-9A-Fa-f]+)>/g)]
    .map((h) =>
      h[1]
        .match(/../g)!
        .map((b) => String.fromCharCode(parseInt(b, 16)))
        .join(""),
    )
    .join("");
}

describe("the quarterly review in French", () => {
  it("writes its headings in French", async () => {
    const text = await textOf("fr");
    expect(text).toContain("Stratégie SEO trimestrielle");
    expect(text).toContain("ANALYSE STRATÉGIQUE");
    expect(text).toContain("TÂCHES TERMINÉES");
    expect(text).toContain("Mentions de la marque");
    expect(text).toMatch(/T[1-4] 20\d\d/);
    expect(text).not.toContain("Quarterly SEO Strategy");
    expect(text).not.toContain("STRATEGIC NARRATIVE");
  });

  it("keeps English as it was", async () => {
    const text = await textOf("en");
    expect(text).toContain("Quarterly SEO Strategy");
    expect(text).toContain("STRATEGIC NARRATIVE");
    expect(text).toContain("Brand mentions");
  });
});
