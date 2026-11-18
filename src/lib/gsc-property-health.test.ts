import { describe, expect, it } from "vitest";
import {
  diagnoseGscProperties,
  describeGscIssue,
  type GscAvailableProperty,
} from "./gsc-property-health";

/**
 * The real case this was written for, measured 19 Nov 2026:
 * the connected Google account held ZERO properties while a client row
 * still asked for "https://dicecodes.com/", so every Search Console
 * tool returned 403 and nothing in the app said why.
 */

const NONE: GscAvailableProperty[] = [];
const OWNER = (siteUrl: string): GscAvailableProperty => ({
  siteUrl,
  permissionLevel: "siteOwner",
});

describe("diagnoseGscProperties", () => {
  it("flags a property the account cannot read at all", () => {
    const { issues, okCount } = diagnoseGscProperties(
      [{ id: 4, name: "Dice Codes", gscProperty: "https://dicecodes.com/" }],
      NONE,
    );
    expect(okCount).toBe(0);
    expect(issues).toHaveLength(1);
    expect(issues[0].reason).toBe("account-has-none");
    expect(issues[0].suggestion).toBeNull();
  });

  it("suggests the domain property when the URL-prefix form was stored", () => {
    // Google has recommended domain properties since 2019, and older
    // set-up flows stored the URL-prefix spelling. Same site, and the
    // API treats them as different properties.
    const { issues } = diagnoseGscProperties(
      [{ id: 1, name: "Acme", gscProperty: "https://www.acme.com/" }],
      [OWNER("sc-domain:acme.com")],
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].reason).toBe("not-in-account");
    expect(issues[0].suggestion).toBe("sc-domain:acme.com");
    expect(describeGscIssue(issues[0])).toContain("sc-domain:acme.com");
  });

  it("suggests the URL-prefix form when a domain property was stored", () => {
    const { issues } = diagnoseGscProperties(
      [{ id: 1, name: "Acme", gscProperty: "sc-domain:acme.com" }],
      [OWNER("https://acme.com/")],
    );
    expect(issues[0].suggestion).toBe("https://acme.com/");
  });

  it("counts an exact match as healthy", () => {
    const { issues, okCount } = diagnoseGscProperties(
      [{ id: 1, name: "Acme", gscProperty: "sc-domain:acme.com" }],
      [OWNER("sc-domain:acme.com")],
    );
    expect(issues).toEqual([]);
    expect(okCount).toBe(1);
  });

  it("does not treat an unset property as broken", () => {
    // A client that was never connected to Google is not a fault, and
    // reporting it as one would bury the clients that ARE broken.
    const { issues, unsetCount, okCount } = diagnoseGscProperties(
      [
        { id: 1, name: "No Google", gscProperty: null },
        { id: 2, name: "Blank", gscProperty: "   " },
      ],
      [OWNER("sc-domain:acme.com")],
    );
    expect(issues).toEqual([]);
    expect(unsetCount).toBe(2);
    expect(okCount).toBe(0);
  });

  it("does not confuse two different sites that share a suffix", () => {
    // "acme.com" must not match "notacme.com" — a suggestion pointing at
    // somebody else's property is worse than no suggestion.
    const { issues } = diagnoseGscProperties(
      [{ id: 1, name: "Acme", gscProperty: "https://acme.com/" }],
      [OWNER("sc-domain:notacme.com")],
    );
    expect(issues[0].suggestion).toBeNull();
  });

  it("explains the account-has-none case in words a person can act on", () => {
    const { issues } = diagnoseGscProperties(
      [{ id: 4, name: "Dice Codes", gscProperty: "https://dicecodes.com/" }],
      NONE,
    );
    const text = describeGscIssue(issues[0]);
    expect(text).toContain("Dice Codes");
    expect(text).toMatch(/no Search Console properties at all/);
    expect(text).toMatch(/403/);
  });
});
