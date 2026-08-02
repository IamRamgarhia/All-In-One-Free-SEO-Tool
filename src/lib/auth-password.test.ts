import { describe, expect, it } from "vitest";
import {
  MIN_PASSWORD_LENGTH,
  hashPassword,
  normaliseEmail,
  passwordProblem,
  verifyPassword,
} from "./auth";

/**
 * Password handling only. The rest of auth.ts talks to the database and
 * to `next/headers`, which belongs in the E2E run rather than here.
 */

describe("hashPassword / verifyPassword", () => {
  it("round-trips", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", stored)).toBe(
      true,
    );
  });

  it("rejects the wrong password", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery stapler", stored)).toBe(
      false,
    );
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("never stores the password itself", async () => {
    const stored = await hashPassword("hunter2-hunter2-hunter2");
    expect(stored).not.toContain("hunter2");
  });

  it("salts, so two people with the same password get different hashes", async () => {
    const a = await hashPassword("same password for both");
    const b = await hashPassword("same password for both");
    expect(a).not.toBe(b);
    // ...and both still verify.
    expect(await verifyPassword("same password for both", a)).toBe(true);
    expect(await verifyPassword("same password for both", b)).toBe(true);
  });

  it("refuses a malformed stored value instead of throwing", async () => {
    // A truncated or hand-edited row must fail closed. Throwing here
    // would surface as a 500 on the login page, which reads as "the app
    // is broken" rather than "that password is wrong".
    for (const bad of ["", "garbage", "scrypt:1:onlythree", "bcrypt:1:a:b"]) {
      expect(await verifyPassword("anything", bad), bad).toBe(false);
    }
  });
});

describe("passwordProblem", () => {
  it("accepts a long passphrase", () => {
    expect(passwordProblem("a reasonably long passphrase")).toBeNull();
  });

  it("rejects anything under the minimum, and says the number", () => {
    const msg = passwordProblem("short");
    expect(msg).not.toBeNull();
    expect(msg).toContain(String(MIN_PASSWORD_LENGTH));
  });

  it("does not demand symbols or mixed case", () => {
    // Deliberate: complexity rules push people toward Passw0rd! and a
    // sticky note. Length is the requirement.
    expect(passwordProblem("aaaaaaaaaaaaaaaaaaaa")).toBeNull();
  });

  it("caps absurd lengths so scrypt isn't handed a megabyte", () => {
    expect(passwordProblem("x".repeat(5000))).not.toBeNull();
  });
});

describe("normaliseEmail", () => {
  it("lowercases and trims, so one person can't hold two accounts", () => {
    expect(normaliseEmail("  Priya@Agency.COM ")).toBe("priya@agency.com");
  });
});
