import { describe, expect, it } from "vitest";
import { rankByRelevance, stems } from "./keyword-relevance";

const about = {
  name: "ND Prestige",
  businessType: "chauffeur VTC",
  description:
    "Chauffeur privé VTC à Paris : transferts Orly, CDG, Beauvais, gares et Disneyland. Prix fixe, 24h/24, devis sur WhatsApp.",
};

// The order discovery returned on nd-prestige.com, abridged.
const discovered = [
  "circuits touristiques dans le cantal",
  "circuits touristiques en algérie",
  "mise à disposition chauffeur routier",
  "mise à disposition chauffeur paris",
  "transfert aéroport dakar",
  "transfert gareth bale real madrid",
  "transfert gare montparnasse orly",
  "voiture de luxe avec chauffeur paris",
  "taxi aeroport d orly",
].map((query) => ({ query }));

describe("rankByRelevance", () => {
  it("puts what the business does first, the first seed's noise last", () => {
    const ranked = rankByRelevance(discovered, about).map((k) => k.query);
    expect(ranked.slice(0, 3)).toEqual([
      "transfert gare montparnasse orly",
      "mise à disposition chauffeur paris",
      "voiture de luxe avec chauffeur paris",
    ]);
    expect(ranked.slice(-2)).toEqual(["circuits touristiques dans le cantal", "circuits touristiques en algérie"]);
  });

  it("keeps discovery's order among equals and removes nothing", () => {
    const ranked = rankByRelevance(discovered, about);
    expect(ranked).toHaveLength(discovered.length);
    expect(new Set(ranked.map((k) => k.query))).toEqual(new Set(discovered.map((k) => k.query)));
  });

  it("does not lift a keyword for sharing the brand name", () => {
    const ranked = rankByRelevance([{ query: "prestige auto lyon" }, { query: "chauffeur orly" }], about);
    expect(ranked[0].query).toBe("chauffeur orly");
  });

  it("leaves the order alone when nothing was said about the business", () => {
    expect(rankByRelevance(discovered, {})).toEqual(discovered);
  });
});

describe("stems", () => {
  it("folds accents, case, plurals and drops small words", () => {
    expect(stems("Les Transferts AÉROPORT de Paris")).toEqual(new Set(["transf", "aeropo", "pari"]));
    expect(stems("gares")).toEqual(stems("gare"));
    expect(stems("transfert")).toEqual(stems("transferts"));
  });
});

describe("searches that bring no customer", () => {
  it("job, pay and accident searches go to the bottom even with the trade's words", () => {
    const ranked = rankByRelevance(
      [
        { query: "chauffeur vtc paris salaire" },
        { query: "chauffeur vtc paris emploi" },
        { query: "chauffeur vtc paris accident" },
        { query: "transfert aéroport orly" },
        { query: "taxi vtc paris" },
      ],
      about,
    ).map((k) => k.query);
    expect(ranked.slice(0, 2)).toEqual(["transfert aéroport orly", "taxi vtc paris"]);
    expect(ranked.slice(-3)).toEqual([
      "chauffeur vtc paris salaire",
      "chauffeur vtc paris emploi",
      "chauffeur vtc paris accident",
    ]);
  });
});
