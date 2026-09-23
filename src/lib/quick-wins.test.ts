/**
 * Which audit findings become "Fix today" quick wins.
 *
 * The file has always said quick wins are "high impact (medium/high/
 * critical severity)", and every task it makes is high priority and
 * described as high impact. The filter let low findings through anyway:
 * on a real install, long meta descriptions and missing Open Graph tags —
 * both low — were eligible.
 */

import { describe, expect, it } from "vitest";
import { rankQuickWins } from "./quick-wins";

const issue = (type: string, severity: string) => ({ type, severity, message: "", url: "https://x.example/" });

describe("choosing quick wins", () => {
  it("leaves out low-severity findings", () => {
    const picked = rankQuickWins([
      issue("long_meta_description", "low"),
      issue("missing_og_tags", "low"),
      issue("missing_canonical", "medium"),
    ]);
    expect(picked.map((p) => p.type)).toEqual(["missing_canonical"]);
  });

  it("puts the most severe first", () => {
    const picked = rankQuickWins([
      issue("missing_schema", "medium"),
      issue("missing_title", "critical"),
      issue("missing_h1", "high"),
    ]);
    expect(picked.map((p) => p.severity)).toEqual(["critical", "high", "medium"]);
  });

  it("ignores findings that are not quick-win types, whatever their severity", () => {
    expect(rankQuickWins([issue("slow_lcp", "critical")])).toEqual([]);
  });

  it("does not guess at a severity it does not recognise", () => {
    // Unknown used to score as low and still qualify.
    expect(rankQuickWins([issue("missing_title", "unknown")])).toEqual([]);
  });
});
