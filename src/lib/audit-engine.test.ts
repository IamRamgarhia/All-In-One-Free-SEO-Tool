import { describe, expect, it } from "vitest";
import { FIX_SUGGESTIONS } from "@/audit/engine/fix-suggestions";
import { getAllRules, getRuleById, getRuleCount } from "@/audit/catalog";
import { AUDIT_FINDING_TYPES } from "./audit-finding-types";
import { dropCovered, ENGINE_EQUIVALENTS, isAuditMode } from "./audit-engine";
import type { AuditFinding } from "./audit";

const engine = (ruleId: string, url: string): AuditFinding => ({
  type: `seomator:${ruleId}`,
  severity: "high",
  message: ruleId,
  url,
});

describe("audit engine", () => {
  it("registers the whole catalogue", () => {
    expect(getRuleCount()).toBe(373);
  });

  it("has fix text for every rule", () => {
    const missing = getAllRules()
      .map((r) => r.id)
      .filter((id) => !FIX_SUGGESTIONS[id]);
    expect(missing).toEqual([]);
  });

  it("maps equivalents between real rules and real finding types", () => {
    const known = new Set<string>(AUDIT_FINDING_TYPES);
    for (const [ruleId, types] of Object.entries(ENGINE_EQUIVALENTS)) {
      expect(getRuleById(ruleId), ruleId).toBeDefined();
      for (const type of types) expect(known.has(type), `${ruleId} → ${type}`).toBe(true);
    }
  });

  it("drops engine findings SEO Tool already reported on the same page", () => {
    const crawl: AuditFinding[] = [
      { type: "missing_title", severity: "high", message: "", url: "https://ex.com/a/" },
    ];
    const kept = dropCovered(
      [
        engine("core-title-present", "https://ex.com/a"),
        engine("core-title-present", "https://ex.com/b"),
        engine("a11y-color-contrast", "https://ex.com/a"),
      ],
      crawl,
    );
    expect(kept.map((f) => `${f.type} ${f.url}`)).toEqual([
      "seomator:core-title-present https://ex.com/b",
      "seomator:a11y-color-contrast https://ex.com/a",
    ]);
  });

  it("treats a site-wide check on the origin as covering every page", () => {
    const crawl: AuditFinding[] = [
      { type: "missing_security_headers", severity: "medium", message: "", url: "https://ex.com/" },
    ];
    expect(dropCovered([engine("security-hsts", "https://ex.com/pricing")], crawl)).toEqual([]);
  });

  it("drops the engine's cross-host canonical note when the crawler already flagged it, not the homepage one", () => {
    const crawl: AuditFinding[] = [
      { type: "non_self_canonical", severity: "low", message: "", url: "https://ex.com/a" },
    ];
    const kept = dropCovered(
      [
        engine("core-canonical-external", "https://ex.com/a"),
        engine("core-canonical-to-homepage", "https://ex.com/a"),
      ],
      crawl,
    );
    expect(kept.map((f) => f.type)).toEqual(["seomator:core-canonical-to-homepage"]);
  });

  it("only accepts the two modes", () => {
    expect(isAuditMode("quick")).toBe(true);
    expect(isAuditMode("full")).toBe(true);
    expect(isAuditMode("deep")).toBe(false);
    expect(isAuditMode(null)).toBe(false);
  });
});
