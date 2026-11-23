/**
 * The prospect mini-audit PDF, read back the way plan-pdf.test.ts does:
 * inflate the content streams and decode the text PDFKit wrote. It was
 * English only, whatever the workspace language.
 */

import zlib from "node:zlib";
import { describe, expect, it, vi } from "vitest";

// The real helper fetches the audited site for its name and logo.
vi.mock("@/lib/site-metadata", () => ({
  fetchSiteMetadata: async () => ({ name: "Boulangerie Martin" }),
}));

import { generateGraderPdf } from "./grader-report";

async function textOf(locale: "fr" | "en"): Promise<string> {
  const buf = await generateGraderPdf({
    url: "https://example.fr",
    finalUrl: "https://example.fr/",
    score: 62,
    pagesCrawled: 1,
    counts: { critical: 0, high: 1, medium: 1, low: 0 },
    findings: [
      {
        type: "missing_meta_description",
        severity: "high",
        message: "Page has no meta description.",
        url: "https://example.fr/",
      },
    ],
    locale,
  });
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

describe("the mini-audit in French", () => {
  it("writes its headings, severities and issue names in French", async () => {
    const text = await textOf("fr");
    expect(text).toContain("AUDIT SEO EXPRESS");
    expect(text).toContain("SCORE DE SANTÉ");
    expect(text).toContain("Synthèse des constats");
    expect(text).toContain("Problèmes à corriger en priorité");
    expect(text).toContain("ÉLEVÉE");
    expect(text).toContain("Méta-description absente");
    expect(text).not.toContain("Findings summary");
    expect(text).not.toContain("HEALTH SCORE");
  });

  it("keeps English as it was", async () => {
    const text = await textOf("en");
    expect(text).toContain("INSTANT SEO AUDIT");
    expect(text).toContain("Findings summary");
    expect(text).toContain("Top issues to fix");
  });
});
