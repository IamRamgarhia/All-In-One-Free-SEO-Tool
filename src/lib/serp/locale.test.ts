import { describe, expect, it } from "vitest";
import {
  acceptLanguageFor,
  browserLocaleFor,
  duckDuckGoRegion,
  timezoneForCountry,
} from "./locale";

/**
 * The browser context was en-US / UTC and DuckDuckGo had no region,
 * whatever the client's market. These pin the mapping that replaced it.
 */
describe("duckDuckGoRegion", () => {
  it.each([
    ["FR", "fr", "fr-fr"],
    ["fr", "FR", "fr-fr"],
    ["BE", "nl", "be-nl"],
    ["CA", "fr", "ca-fr"],
    ["US", "en", "us-en"],
    ["GB", "en", "uk-en"],
    // The pair is unknown but the country is: its first region.
    ["DE", "fr", "de-de"],
    ["", "fr", "wt-wt"],
    [undefined, undefined, "wt-wt"],
    ["ZZ", "en", "wt-wt"],
  ])("%s + %s -> %s", (country, language, expected) => {
    expect(duckDuckGoRegion(country, language)).toBe(expected);
  });
});

describe("browser locale", () => {
  it("speaks the client's language", () => {
    expect(acceptLanguageFor("fr", "FR")).toBe("fr-FR,fr;q=0.9");
    expect(acceptLanguageFor("fr")).toBe("fr;q=0.9");
    expect(acceptLanguageFor("nonsense", "FR")).toBe("en-US,en;q=0.9");
    expect(browserLocaleFor("fr", "BE")).toBe("fr-BE");
    expect(browserLocaleFor(undefined, "FR")).toBe("en-US");
  });

  it("uses the country's clock when it has an obvious one, else UTC", () => {
    expect(timezoneForCountry("FR")).toBe("Europe/Paris");
    expect(timezoneForCountry("fr")).toBe("Europe/Paris");
    expect(timezoneForCountry("US")).toBe("UTC");
    expect(timezoneForCountry(undefined)).toBe("UTC");
  });
});
