/**
 * The plan PDF, checked by opening the bytes.
 *
 * The first version shipped with its checkbox broken on every line and
 * nobody noticed, because a PDF that typechecks, builds and downloads
 * looks finished. The document declares Helvetica with WinAnsiEncoding;
 * the code drew the checkbox as "○" (U+25CB), which WinAnsi does not
 * contain, so it was written as the two bytes 0x25 0xCB and rendered as
 * "%Ë" — thirty times, once per task.
 *
 * It also never called doc.font(), so the entire document was one
 * weight. Both faults are invisible to every check this repo had.
 *
 * So these tests read the generated file the way a PDF reader does:
 * inflate the content streams and look at the operators.
 */

import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { generatePlanPdf, unencodableCharacters } from "./plan-pdf";
import type { PlanTaskRow } from "./plan-view";

const TASKS: PlanTaskRow[] = [
  {
    id: 1,
    title: "Connect Google Search Console",
    whyItMatters: "It is free and unlocks the keyword data the rest depends on.",
    status: "todo",
    dueDate: new Date("2026-09-13"),
    estimatedMinutes: 15,
    sourceRef: null,
  },
  {
    id: 2,
    title: "Run a full site audit",
    whyItMatters: "A baseline makes every later improvement measurable.",
    status: "done",
    dueDate: new Date("2026-09-14"),
    estimatedMinutes: 30,
    sourceRef: null,
  },
  {
    id: 3,
    title: "Write a meta description for the homepage",
    whyItMatters: null,
    status: "todo",
    dueDate: new Date("2026-09-24"),
    estimatedMinutes: 10,
    sourceRef: null,
  },
];

async function build() {
  const buf = await generatePlanPdf({
    clientName: "Prateek Tapes",
    clientUrl: "https://prateektapes.com",
    tasks: TASKS,
    score: 93,
    issueCount: 50,
  });
  const raw = buf.toString("latin1");
  let streams = "";
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) continue;
    try {
      streams += zlib.inflateSync(buf.subarray(start, end)).toString("latin1");
    } catch {
      // Font programs and images are not flate text streams.
    }
  }
  return { buf, raw, streams };
}

describe("what the reader will actually see", () => {
  it("uses a bold face as well as a regular one", async () => {
    // Without this the title, every week heading and all thirty task
    // names are the same weight as the body text, and the document reads
    // as one wall. The first version never called doc.font() at all.
    const { raw } = await build();
    expect(raw).toContain("/BaseFont /Helvetica-Bold");
    expect(raw).toContain("/BaseFont /Helvetica");
  });

  it("writes no character the document's encoding cannot represent", async () => {
    // The exact bug, proven by probing PDFKit directly: given "○" it
    // writes the two bytes 25 cb, and given "✓" it writes 27 13. Both
    // land in a WinAnsi Helvetica and print as "%Ë" and "'".
    //
    // Checked case-insensitively because the stream is lowercase hex and
    // the first version of this test looked for "25CB", which is why it
    // passed against a deliberately reintroduced bug.
    const { streams } = await build();
    const hex = streams.toLowerCase();
    for (const [seq, ch] of [
      ["25cb", "○"],
      ["2713", "✓"],
      ["2714", "✔"],
      ["25a1", "□"],
      ["2192", "→"],
    ] as const) {
      expect(hex, `"${ch}" was written into a WinAnsi font`).not.toContain(seq);
    }
  });

  it("has no unencodable character anywhere in its own source", async () => {
    // The general rule rather than five specific characters. Any string
    // literal in the generator that reaches doc.text() must be
    // printable by WinAnsi Helvetica; a new "✗" added next year is the
    // same bug with a different codepoint.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(process.cwd(), "src/lib/plan-pdf.ts"), "utf8");

    // Strip comments first. The file's own doc comment names the broken
    // characters on purpose, so the next reader knows what happened, and
    // an apostrophe in a line comment ("next month's report") otherwise
    // opens a fake string literal that swallows everything after it —
    // which is how the first version of this test failed on a file that
    // was correct.
    const body = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");

    // Double quotes and template literals only. The codebase is
    // prettier-formatted, so there are no single-quoted strings, and
    // trying to match them is what produced the false positive above.
    const literals = [
      ...body.matchAll(/"((?:[^"\\]|\\.)*)"/g),
      ...body.matchAll(/`((?:[^`\\]|\\.)*)`/g),
    ].map((m) => m[1] ?? "");

    const offenders: string[] = [];
    for (const lit of literals) {
      for (const ch of unencodableCharacters(lit)) {
        offenders.push(`${ch} in "${lit.slice(0, 40)}"`);
      }
    }
    expect(
      offenders,
      `These cannot be printed by the font this document declares:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("draws filled shapes, not just hairlines", async () => {
    // Three pages with seven lines and nothing else gives the eye no way
    // to find where a week starts.
    const { streams } = await build();
    const fills = (streams.match(/\bf\b|\bre\b/g) ?? []).length;
    expect(fills).toBeGreaterThan(5);
  });

  it("numbers its pages", async () => {
    const { streams } = await build();
    // "1 / 1" for a short plan; the separator is what matters.
    expect(streams).toMatch(/3120\s*2f|1 \/ /i);
  });

  it("still says what the plan is", async () => {
    const { streams } = await build();
    const text = [...streams.matchAll(/<([0-9A-Fa-f]+)>/g)]
      .map((h) =>
        h[1]
          .match(/../g)!
          .map((b) => String.fromCharCode(parseInt(b, 16)))
          .join(""),
      )
      .join("");
    expect(text).toContain("30-day SEO plan");
    expect(text).toContain("Prateek Tapes");
    expect(text).toContain("Connect Google Search Console");
  });
});

describe("the encoding guard itself", () => {
  it("flags the characters that caused this", () => {
    expect(unencodableCharacters("○ task")).toEqual(["○"]);
    expect(unencodableCharacters("✓ done")).toEqual(["✓"]);
    expect(unencodableCharacters("▢ box ✔ tick")).toEqual(["▢", "✔"]);
  });

  it("allows the typographic characters the document legitimately uses", () => {
    // An em dash, a middle dot and a curly apostrophe are all in
    // WinAnsi. Rejecting them would push the text back to ASCII for no
    // reason.
    expect(unencodableCharacters("13 Sept · 15 min — one week's work")).toEqual([]);
    expect(unencodableCharacters("“quoted” and – dashed")).toEqual([]);
  });

  it("allows plain Latin-1 accents", () => {
    expect(unencodableCharacters("Café Ludhiana Ühr")).toEqual([]);
  });
});
