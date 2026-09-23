import { describe, expect, it } from "vitest";
import { mergeRobotsBlock } from "./executor";

/**
 * Merging into robots.txt, which is the riskiest write in the app.
 *
 * One file governs a whole site. There is no partial blast radius: a
 * dropped Disallow exposes a staging path, and a stray Disallow: / takes
 * the site out of Google entirely. Everything already in the file was
 * put there by somebody, and nothing here can tell a deliberate rule
 * from an accidental one — so the only safe operation is to add, never
 * to replace or reorder.
 */

const BLOCK = [
  "# AI crawler policy — added by SEO Tool.",
  "User-agent: GPTBot",
  "Allow: /",
  "",
  "User-agent: ClaudeBot",
  "Allow: /",
  "",
].join("\n");

describe("existing rules are never touched", () => {
  it("keeps every line of the original, in order", () => {
    const existing = [
      "User-agent: *",
      "Disallow: /wp-admin/",
      "Disallow: /staging/",
      "",
      "Sitemap: https://example.test/sitemap.xml",
    ].join("\n");

    const out = mergeRobotsBlock(existing, BLOCK);

    // Not "contains the rules somewhere" — the original text, intact and
    // in order, at the top. Reordering robots.txt changes which group a
    // crawler matches.
    expect(out.startsWith(existing.trimEnd())).toBe(true);
    expect(out).toContain("Disallow: /staging/");
    expect(out).toContain("Sitemap: https://example.test/sitemap.xml");
  });

  it("never emits Disallow for an AI bot on its own", () => {
    // The finding is "nobody decided". Deciding to block crawlers on a
    // user's behalf is a business decision with revenue attached, and a
    // written Allow is far easier to notice and flip than a silent one.
    const out = mergeRobotsBlock("", BLOCK);
    const aiSection = out.slice(out.indexOf("GPTBot"));
    expect(aiSection).not.toMatch(/Disallow:\s*\//);
  });
});

describe("a bot the file already mentions is left alone", () => {
  it("does not add a second group for it", () => {
    const existing = ["User-agent: GPTBot", "Disallow: /"].join("\n");
    const out = mergeRobotsBlock(existing, BLOCK);

    expect(out.match(/User-agent:\s*GPTBot/gi)?.length).toBe(1);
    // And crucially the existing decision survives — someone chose to
    // block GPTBot and the agent must not quietly reverse it.
    expect(out).toContain("Disallow: /");
    expect(out).toContain("User-agent: ClaudeBot");
  });

  it("matches user-agent names case-insensitively", () => {
    // robots.txt is case-insensitive for user-agent tokens; matching
    // exactly would add a duplicate group for "gptbot".
    const out = mergeRobotsBlock("user-agent: gptbot\ndisallow: /", BLOCK);
    expect(out.match(/user-agent:\s*gptbot/gi)?.length).toBe(1);
  });

  it("returns the input unchanged when every bot is already covered", () => {
    // Unchanged is what lets the caller record "skipped" instead of
    // writing an identical file and reporting it to the user as a fix.
    const existing = [
      "User-agent: GPTBot",
      "Allow: /",
      "User-agent: ClaudeBot",
      "Disallow: /",
    ].join("\n");
    expect(mergeRobotsBlock(existing, BLOCK)).toBe(existing);
  });
});

describe("shape of the result", () => {
  it("works from an empty file", () => {
    const out = mergeRobotsBlock("", BLOCK);
    expect(out).toContain("User-agent: GPTBot");
    expect(out.startsWith("\n")).toBe(false);
    expect(out.endsWith("\n")).toBe(true);
  });

  it("leaves exactly one blank line between the old and the new", () => {
    const out = mergeRobotsBlock("User-agent: *\nDisallow: /x", BLOCK);
    expect(out).not.toMatch(/\n{3,}/);
    expect(out).toMatch(/Disallow: \/x\n\n#/);
  });

  it("survives CRLF input without doubling the line endings", () => {
    // A robots.txt edited on Windows, or fetched over a connection that
    // normalised it. Splitting on \n alone would leave \r stranded at
    // the end of every user-agent name and match nothing.
    const out = mergeRobotsBlock("User-agent: GPTBot\r\nAllow: /\r\n", BLOCK);
    expect(out.match(/User-agent:\s*GPTBot/gi)?.length).toBe(1);
  });
});
