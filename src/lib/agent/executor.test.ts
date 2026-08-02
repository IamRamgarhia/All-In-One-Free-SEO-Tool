import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The drafting path, which is where the agent can quietly make a page
 * worse. "Fixing" a 102-character title by writing a 118-character one
 * and recording a success is a silent-wrong-answer bug of exactly the
 * kind this codebase keeps finding — the run log would say the problem
 * was fixed, and the title would still be truncated in search results.
 *
 * ai-call is mocked because these assert our validation, not the model's
 * behaviour. A real model would pass or fail nondeterministically.
 */

const callAIResult = vi.fn();
vi.mock("../ai-call", () => ({
  callAIResult: (...args: unknown[]) => callAIResult(...args),
}));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("../wp-bridge", () => ({
  findPostIdByUrl: vi.fn(),
  getClientWpCreds: vi.fn(),
  getPostImages: vi.fn(),
  getPostSeo: vi.fn(),
  setAttachmentAlt: vi.fn(),
  setPostSchema: vi.fn(),
  setPostSeo: vi.fn(),
}));

const { draftValue, requiresDraft } = await import("./executor");

const action = {
  kind: "write_title" as const,
  targetUrl: "https://example.com/page",
  reason: "Title is 102 characters, which is too long to display.",
  risk: "safe" as const,
  weight: 100,
  currentValue: "x".repeat(102),
};
const context = { siteName: "Example", pageUrl: "https://example.com/page" };

beforeEach(() => callAIResult.mockReset());

function reply(text: string) {
  callAIResult.mockResolvedValue({ ok: true, text });
}

describe("draftValue — titles", () => {
  it("accepts a title within the display limit", async () => {
    reply("Handmade Soap for Sensitive Skin | Example");
    const r = await draftValue(action, context);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("Handmade Soap for Sensitive Skin | Example");
  });

  it("REFUSES a replacement that is still too long", async () => {
    // The bug this prevents: the agent reports "fixed", the title is
    // still truncated, and nobody looks again for months.
    reply("A".repeat(95));
    const r = await draftValue(action, context);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/still over/i);
      expect(r.error).toMatch(/95/);
    }
  });

  it("refuses a replacement too short to say anything", async () => {
    reply("Soap");
    expect((await draftValue(action, context)).ok).toBe(false);
  });

  it("strips the quotes models add despite being told not to", async () => {
    reply('"Handmade Soap for Sensitive Skin"');
    const r = await draftValue(action, context);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("Handmade Soap for Sensitive Skin");
  });

  it("strips a leading label", async () => {
    reply("Title: Handmade Soap for Sensitive Skin");
    const r = await draftValue(action, context);
    if (r.ok) expect(r.value).toBe("Handmade Soap for Sensitive Skin");
  });

  it("takes only the first line when the model offers alternatives", async () => {
    reply("Handmade Soap for Sensitive Skin\nOr: Gentle Soap for Sensitive Skin");
    const r = await draftValue(action, context);
    if (r.ok) expect(r.value).toBe("Handmade Soap for Sensitive Skin");
  });

  it("keeps a legitimate trailing quotation mark", async () => {
    // The quote-stripping must only remove a MATCHED wrapping pair, or
    // it corrupts titles that genuinely end in one.
    reply('What Does "Cold Process" Mean');
    const r = await draftValue(action, context);
    if (r.ok) expect(r.value).toBe('What Does "Cold Process" Mean');
  });

  it("passes the AI failure through rather than inventing a title", async () => {
    callAIResult.mockResolvedValue({
      ok: false,
      failure: { reason: "no_provider", message: "No AI provider is set up yet." },
    });
    const r = await draftValue(action, context);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no ai provider/i);
  });

  it("refuses an empty response instead of writing a blank title", async () => {
    reply("   ");
    const r = await draftValue(action, context);
    expect(r.ok).toBe(false);
  });
});

describe("draftValue — meta descriptions", () => {
  const metaAction = {
    ...action,
    kind: "write_meta_description" as const,
    currentValue: null,
    reason: "This page has no meta description.",
  };

  it("accepts one in the displayable range", async () => {
    reply(
      "Gentle handmade soap made for sensitive skin, with no synthetic fragrance or harsh detergents. Free UK delivery on orders over twenty pounds.",
    );
    const r = await draftValue(metaAction, context);
    expect(r.ok).toBe(true);
  });

  it("refuses one that would be cut off mid-sentence", async () => {
    reply("A".repeat(200));
    const r = await draftValue(metaAction, context);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/still over/i);
  });

  it("refuses one too short to describe the page", async () => {
    reply("Soap for sale.");
    expect((await draftValue(metaAction, context)).ok).toBe(false);
  });
});

describe("draftValue — unknown kinds", () => {
  it("refuses rather than guessing", async () => {
    // A kind with no drafting path at all. This used to name
    // write_schema, which passed for the wrong reason once schema got a
    // generator — it failed on the mocked fetch, not on being unknown.
    const r = await draftValue(
      { ...action, kind: "write_canonical" as never },
      context,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no drafting rule/i);
  });
});

describe("requiresDraft", () => {
  // run.ts asks this instead of keeping its own list. Its list omitted
  // alt text and schema, which were then executed with an empty string,
  // verified against the field they hadn't changed, and reported fixed.
  it("covers every kind the agent can write", () => {
    for (const kind of [
      "write_title",
      "write_meta_description",
      "write_image_alt",
      "write_schema",
    ]) {
      expect(requiresDraft(kind), kind).toBe(true);
    }
  });

  it("is false for a kind nothing can draft", () => {
    expect(requiresDraft("write_canonical")).toBe(false);
  });
});

describe("draftValue — alt text", () => {
  const altAction = {
    ...action,
    kind: "write_image_alt" as const,
    currentValue: "",
    imageSrc: "https://example.com/wp-content/uploads/handmade-soap-bars.jpg",
    reason: "This image has no alt text.",
  };

  it("accepts a plain description", async () => {
    reply("Bars of handmade soap stacked on a wooden shelf");
    const r = await draftValue(altAction, context);
    expect(r.ok).toBe(true);
  });

  it("refuses one too long for a screen reader", async () => {
    reply("A".repeat(200));
    const r = await draftValue(altAction, context);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/125/);
  });

  it('refuses "Image of…", which screen readers already announce', async () => {
    // The single most common alt-text mistake. A screen reader says
    // "image" before reading the text, so "Image of a soap bar" becomes
    // "image, image of a soap bar".
    for (const prefix of ["Image of", "Photo of", "Picture of"]) {
      reply(`${prefix} soap bars on a shelf`);
      const r = await draftValue(altAction, context);
      expect(r.ok, prefix).toBe(false);
    }
  });

  it("refuses something too short to describe anything", async () => {
    reply("soap");
    expect((await draftValue(altAction, context)).ok).toBe(false);
  });

  it("passes the filename to the model, since that's all we have", async () => {
    reply("Bars of handmade soap on a wooden shelf");
    await draftValue(altAction, context);
    const prompt = callAIResult.mock.calls[0]?.[0] as { user: string };
    expect(prompt.user).toContain("handmade-soap-bars.jpg");
  });
});
