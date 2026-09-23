/**
 * The passage scorer reads markdown. The GEO score handed it raw HTML.
 *
 * The scorer strips tags, so the mistake did not throw — it scored
 * whatever sat between the tags, inline scripts and JSON-LD included,
 * and averaged that into the page's citability.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scoreAllPassages } from "./aio-passage-scorer";
import { parseHtmlToMarkdown } from "./main-content-extractor";

// Constructed, not captured: the shape of a typical page — analytics
// script and JSON-LD in the head, navigation, one real paragraph.
const PAGE = `<!doctype html><html><head><title>Kraft paper tape</title>
<script>window.dataLayer = window.dataLayer || []; function gtag(){ dataLayer.push(arguments); }
gtag("js", new Date()); gtag("config", "G-XXXX"); var loaded = document.readyState === "complete";</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Example Tapes","url":"https://example.com"}</script>
<style>.hero { color: #333; margin: 0 auto; } .nav a { padding: 4px 8px; }</style>
</head><body>
<nav><a href="/">Home</a> <a href="/products">Products</a> <a href="/contact">Contact</a></nav>
<h1>Kraft paper tape</h1>
<p>Kraft paper tape is a pressure-sensitive packaging tape made from a paper backing coated with a natural rubber adhesive. It is used to seal corrugated boxes where the whole package needs to be recyclable, because the paper backing can go into the same recycling stream as the carton.</p>
</body></html>`;

const passageText = (p: ReturnType<typeof scoreAllPassages>[number]) => JSON.stringify(p);

describe("scoring a page's passages", () => {
  it("scores script and JSON-LD as prose when handed raw HTML", () => {
    // Guards the guard: this is the failure. If the scorer ever starts
    // cleaning HTML itself, this stops being true and the fix below is
    // no longer what prevents it.
    const raw = scoreAllPassages(PAGE);
    expect(raw.some((p) => /dataLayer|@context|margin: 0 auto/.test(passageText(p)))).toBe(true);
  });

  it("scores only the page's text once the main content is extracted", () => {
    const passages = scoreAllPassages(parseHtmlToMarkdown(PAGE).markdown);
    expect(passages.length).toBeGreaterThan(0);
    for (const p of passages) {
      expect(passageText(p)).not.toMatch(/dataLayer|@context|margin: 0 auto|gtag/);
    }
    expect(passages.some((p) => /pressure-sensitive packaging tape/.test(passageText(p)))).toBe(true);
  });

  it("is what the GEO score does", () => {
    const src = readFileSync(new URL("../app/tools/geo-score/actions.ts", import.meta.url), "utf8");
    expect(src).toMatch(/scoreAllPassages\(parseHtmlToMarkdown\(html\)\.markdown\)/);
    expect(src).not.toMatch(/scoreAllPassages\(html\)/);
  });
});
