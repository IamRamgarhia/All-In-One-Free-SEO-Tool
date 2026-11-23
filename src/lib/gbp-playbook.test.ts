import { describe, expect, it } from "vitest";
import { GBP_PLAYBOOK, GBP_PLAYBOOK_FR, playbookFor, scoreGbpProfile } from "./gbp-playbook";

describe("the Business Profile playbook in French", () => {
  it("has French text for every item, and nothing for items that do not exist", () => {
    const ids = GBP_PLAYBOOK.map((i) => i.id).sort();
    expect(Object.keys(GBP_PLAYBOOK_FR).sort()).toEqual(ids);
    for (const t of Object.values(GBP_PLAYBOOK_FR)) {
      expect(t.title.trim()).not.toBe("");
      expect(t.whyItMatters.trim()).not.toBe("");
      expect(t.action.trim()).not.toBe("");
    }
  });

  it("keeps ids, weights and cadences, and only swaps the words", () => {
    const en = playbookFor("local");
    const fr = playbookFor("local", "fr");
    expect(fr.map((i) => [i.id, i.weight, i.cadence])).toEqual(en.map((i) => [i.id, i.weight, i.cadence]));
    expect(fr.find((i) => i.id === "claim-listing")?.title).toBe("Revendiquer et valider votre fiche Google");
    expect(en.find((i) => i.id === "claim-listing")?.title).toBe("Claim and verify your GBP listing");
  });

  it("names the missing fields in French", () => {
    const input = {
      hasGbpUrl: false,
      hasAddress: false,
      hasPhone: true,
      hasHours: true,
      reviewCount: 0,
      ratingAverage: null,
    };
    expect(scoreGbpProfile(input, "fr").missing).toEqual([
      "Lien de la fiche Google",
      "Adresse",
      "Avis (5 au minimum pour commencer)",
    ]);
    expect(scoreGbpProfile(input).missing).toEqual(["GBP listing URL", "Address", "Reviews (need at least 5 to start)"]);
  });
});
