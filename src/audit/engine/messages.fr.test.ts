import { describe, expect, it } from "vitest";
import { extractMessageTemplates } from "./extract-messages";
import { ENGINE_MESSAGES_FR } from "./messages.fr";
import { translateEngineMessage } from "./translate-message";

describe("French catalogue of the engine's messages", () => {
  it("has a French version of every message template the rules can produce", () => {
    const known = new Set(ENGINE_MESSAGES_FR.filter((e) => e.fr).map((e) => `${e.ruleId}\u0000${e.en}`));
    const missing = extractMessageTemplates()
      .filter((t) => !known.has(`${t.ruleId}\u0000${t.en}`))
      .map((t) => `${t.ruleId}: ${t.en}`);
    expect(missing).toEqual([]);
  }, 60_000);

  it("never addresses the reader as « tu »", () => {
    for (const e of ENGINE_MESSAGES_FR) expect(e.fr, e.ruleId).not.toMatch(/(^|[\s’'])(tu|ton|ta|tes) /i);
  });

  it("keeps every value it refers to", () => {
    for (const e of ENGINE_MESSAGES_FR) {
      for (const m of e.fr.matchAll(/\{(\d+)\}/g)) expect(e.en, `${e.ruleId}: ${e.fr}`).toContain(`{${m[1]}}`);
    }
  });
});

describe("translating a stored message", () => {
  it("puts the values back into the French template", () => {
    const fr = translateEngineMessage(
      "core-title-length",
      "Title is too long (62 characters). Recommended: 30-60 characters",
    );
    expect(fr).not.toMatch(/Title is/);
    expect(fr).toContain("62");
  });

  it("leaves an unknown message and an unknown rule unchanged", () => {
    expect(translateEngineMessage("core-title-length", "Something else entirely")).toBe("Something else entirely");
    expect(translateEngineMessage("no-such-rule", "Title is too long (62 characters)")).toBe(
      "Title is too long (62 characters)",
    );
  });
});

describe("values that are English fragments", () => {
  it("are translated too", () => {
    expect(translateEngineMessage("eeat-about-page", "About page link found in navigation")).toBe(
      "Lien vers la page « À propos » trouvé dans la navigation",
    );
    expect(translateEngineMessage("eeat-privacy-policy", "Privacy policy link found in footer (2 links)")).toBe(
      "Lien vers la politique de confidentialité trouvé dans le pied de page (2 lien(s))",
    );
  });
});

describe("a finding grouped over several pages", () => {
  it("keeps its « (N pages) » and is still translated", () => {
    expect(
      translateEngineMessage(
        "core-description-length",
        "Meta description is too short (112 characters). Recommended: 120-160 characters (3 pages)",
      ),
    ).toBe("Méta-description trop courte (112 caractères). Recommandé : 120 à 160 caractères (3 pages)");
  });
});
