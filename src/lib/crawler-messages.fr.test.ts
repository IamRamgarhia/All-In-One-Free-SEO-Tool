import { describe, expect, it } from "vitest";
import { extractTrPairs } from "@/audit/engine/extract-messages";
import { translateCrawlerMessage } from "@/audit/engine/translate-message";
import { CRAWLER_MESSAGES_FR } from "./crawler-messages.fr";

describe("catalogue of the crawler's messages", () => {
  it("matches the tr() pairs in the crawler's code", () => {
    const pairs = [...extractTrPairs("src/lib/audit.ts"), ...extractTrPairs("src/lib/tech-audit-rules.ts")];
    expect(CRAWLER_MESSAGES_FR).toEqual(pairs);
  }, 60_000);

  it("reads an English finding in French, technology prefix kept", () => {
    expect(translateCrawlerMessage("Title is 62 characters — Google may truncate beyond ~60.")).toBe(
      "Le title fait 62 caractères : Google peut le couper au-delà d’environ 60.",
    );
    expect(translateCrawlerMessage("Missing meta description.")).toBe("Méta-description absente.");
    expect(translateCrawlerMessage("Something unknown.")).toBe("Something unknown.");
  });
});
