import { describe, expect, it } from "vitest";
import { inferTargeting, isDefaultTargeting } from "./infer-targeting";

describe("inferTargeting", () => {
  it("reads the country code at the end of an address (nd-prestige.com)", () => {
    expect(
      inferTargeting({ url: "https://nd-prestige.com/", address: "9 rue Jean Mermoz, Orly, Île-de-France, 94310, FR" }),
    ).toEqual({ country: "FR", language: "fr" });
  });

  it("reads a country spelled out in the address", () => {
    expect(inferTargeting({ address: "Rue Neuve 12, 1000 Bruxelles, Belgique" })).toEqual({
      country: "BE",
      language: "fr",
    });
  });

  it("falls back to the phone prefix, longest first", () => {
    expect(inferTargeting({ url: "https://example.com", phone: "+33 7 67 72 89 86" })?.country).toBe("FR");
    expect(inferTargeting({ phone: "+212 6 12 34 56 78" })?.country).toBe("MA");
    expect(inferTargeting({ phone: "0033 1 23 45 67 89" })?.country).toBe("FR");
  });

  it("then to a country-code domain", () => {
    expect(inferTargeting({ url: "https://boulangerie-martin.fr/" })).toEqual({ country: "FR", language: "fr" });
    expect(inferTargeting({ url: "shop.co.uk" })).toEqual({ country: "GB", language: "en" });
  });

  it("the address wins over a .com domain and a missing phone", () => {
    expect(inferTargeting({ url: "https://example.com", address: "Calle Mayor 1, 28013 Madrid, España" })?.country).toBe(
      "ES",
    );
  });

  it("finds nothing on a generic domain without address or phone", () => {
    expect(inferTargeting({ url: "https://example.com" })).toBeNull();
    expect(inferTargeting({ url: "https://startup.io" })).toBeNull();
    expect(inferTargeting({ phone: "07 67 72 89 86" })).toBeNull();
  });
});

describe("isDefaultTargeting", () => {
  it("is true only on the US / English column defaults", () => {
    expect(isDefaultTargeting({ country: "US", language: "en" })).toBe(true);
    expect(isDefaultTargeting({ country: null, language: null })).toBe(true);
    expect(isDefaultTargeting({ country: "FR", language: "fr" })).toBe(false);
    expect(isDefaultTargeting({ country: "US", language: "es" })).toBe(false);
  });
});
