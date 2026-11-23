/**
 * The crawler writes its findings in the workspace language: they are
 * stored as written and end up in tasks, reports and the client portal.
 */
import { afterEach, describe, expect, it } from "vitest";
import { checkPage, setAuditLanguage } from "./audit";

const findings = () =>
  checkPage({
    url: "https://example.fr/",
    finalUrl: "https://example.fr/",
    status: 200,
    html: "<html><head></head><body><p>Bonjour</p></body></html>",
    headers: new Headers(),
    responseTimeMs: 100,
    redirectHops: 0,
  }).findings;

describe("finding messages", () => {
  afterEach(() => setAuditLanguage("en"));

  it("are French in a French workspace", () => {
    setAuditLanguage("fr");
    const byType = new Map(findings().map((f) => [f.type, f.message]));
    expect(byType.get("missing_title")).toBe("Balise <title> absente.");
    expect(byType.get("missing_meta_description")).toBe("Méta-description absente.");
    expect(byType.get("missing_h1")).toBe("Aucun titre <h1> sur la page.");
    expect(byType.get("thin_content")).toMatch(/^La page ne compte que \d+ mots/);
  });

  it("stay English otherwise", () => {
    setAuditLanguage("en");
    const byType = new Map(findings().map((f) => [f.type, f.message]));
    expect(byType.get("missing_title")).toBe("Missing <title> tag.");
  });
});
