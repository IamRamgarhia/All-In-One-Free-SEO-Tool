import { describe, expect, it } from "vitest";
import { isNafCode, isPostcode, LOCAL_TRADES, parseCompanies } from "./prospect-search";
import { pickBusinessSite } from "./prospect-site";

const est = (over: Record<string, unknown> = {}) => ({
  siret: "12345678900011",
  adresse: "2 AVENUE MOLIERE 94310 ORLY",
  code_postal: "94310",
  libelle_commune: "ORLY",
  etat_administratif: "A",
  date_creation: "2015-03-02",
  liste_enseignes: ["LE BANNETON D OSIER"],
  nom_commercial: null,
  ...over,
});
const company = (over: Record<string, unknown> = {}) => ({
  siren: "123456789",
  nom_complet: "SARL EXEMPLE",
  activite_principale: "10.71C",
  statut_diffusion: "O",
  opposition_diffusion_commerciale: false,
  matching_etablissements: [est()],
  ...over,
});

describe("establishments to prospect", () => {
  it("keeps an open shop in the postcode, under its sign", () => {
    expect(parseCompanies({ results: [company()] }, "94310")).toEqual([
      {
        siren: "123456789",
        siret: "12345678900011",
        name: "Le Banneton D Osier",
        address: "2 Avenue Moliere 94310 Orly",
        postcode: "94310",
        city: "Orly",
        activity: "10.71C",
        since: 2015,
      },
    ]);
  });

  it("leaves out companies that opposed prospecting or are not fully public", () => {
    expect(parseCompanies({ results: [company({ opposition_diffusion_commerciale: true })] }, "94310")).toEqual([]);
    expect(parseCompanies({ results: [company({ statut_diffusion: "P" })] }, "94310")).toEqual([]);
  });

  it("leaves out closed establishments and those in another postcode", () => {
    const c = company({
      matching_etablissements: [
        est({ etat_administratif: "F", siret: "1" }),
        est({ code_postal: "94000", siret: "2" }),
        est({ siret: "3", liste_enseignes: null }),
      ],
    });
    const r = parseCompanies({ results: [c] }, "94310");
    expect(r.map((b) => b.siret)).toEqual(["3"]);
    expect(r[0].name).toBe("Sarl Exemple");
  });

  it("validates the form's inputs", () => {
    expect(isPostcode("94310")).toBe(true);
    expect(isPostcode("9431")).toBe(false);
    expect(isNafCode("10.71C")).toBe(true);
    expect(isNafCode("boulangerie")).toBe(false);
    for (const t of LOCAL_TRADES) expect(isNafCode(t.naf), t.id).toBe(true);
  });
});

describe("the business's own site", () => {
  it("skips directories and social networks", () => {
    expect(
      pickBusinessSite(
        [
          "https://www.pagesjaunes.fr/pros/123",
          "https://www.facebook.com/lebannetondosier",
          "https://www.lebannetondosier.fr/accueil",
        ],
        "Le Banneton D Osier",
      ),
    ).toBe("https://www.lebannetondosier.fr/");
  });

  it("does not take another business's site", () => {
    expect(pickBusinessSite(["https://www.boulangerie-dupont.fr/"], "Boulangerie Martin")).toBeNull();
  });

  it("does not match on the trade word alone", () => {
    expect(pickBusinessSite(["https://www.boulangerie-orly.fr/"], "Boulangerie")).toBeNull();
  });
});
