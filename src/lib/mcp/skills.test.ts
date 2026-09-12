/**
 * The skills must only name tools that exist.
 *
 * A skill is prose, so nothing type-checks it. A tool renamed here and
 * not in `plugins/seo-tool/skills` leaves an assistant following an
 * instruction to call something that is not there — and the failure is
 * the worst shape: it does not crash, it improvises. It will fetch the
 * page itself, or answer from what it already has, and the user gets a
 * confident answer built on nothing this install measured.
 *
 * This repo's fourth standing rule is that every pair of hardcoded lists
 * in it had already drifted by the time anyone looked. These are a pair.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MCP_TOOL_LIST } from "./server";

const SKILLS_DIR = join(process.cwd(), "plugins/seo-tool/skills");

/** Every `name` a tool is referenced by in the skill prose. */
function toolMentions(markdown: string): string[] {
  // Backticked snake_case identifiers. Narrow on purpose: prose says
  // "the audit", code spans say `list_audit_issues`, and only the second
  // is a claim that something is callable.
  return [...markdown.matchAll(/`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)`/g)].map((m) => m[1]);
}

function skillFiles(): { name: string; path: string; body: string }[] {
  if (!existsSync(SKILLS_DIR)) return [];
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const path = join(SKILLS_DIR, d.name, "SKILL.md");
      return { name: d.name, path, body: existsSync(path) ? readFileSync(path, "utf8") : "" };
    });
}

const SKILLS = skillFiles();
const TOOL_NAMES = new Set(MCP_TOOL_LIST.map((t) => t.name));

/**
 * snake_case things in the prose that are not tools and never were —
 * field names in a tool's response, mostly. Listed rather than pattern
 * matched, so a genuine typo in a tool name cannot hide behind a rule.
 */
const NOT_TOOLS = new Set(["robots_txt"]);

describe("the skills reference real tools", () => {
  it("ships at least one skill", () => {
    // Guards everything below: an empty directory passes every loop.
    expect(SKILLS.length).toBeGreaterThanOrEqual(4);
  });

  it("every skill has a body", () => {
    for (const s of SKILLS) {
      expect(s.body.length, s.name).toBeGreaterThan(200);
    }
  });

  it("names no tool that does not exist", () => {
    const broken: string[] = [];
    for (const s of SKILLS) {
      for (const mention of toolMentions(s.body)) {
        if (NOT_TOOLS.has(mention)) continue;
        if (!TOOL_NAMES.has(mention)) broken.push(`${s.name}: ${mention}`);
      }
    }
    expect(
      broken,
      `These are written as callable tools and are not registered. An ` +
        `assistant told to call one will improvise instead of failing:\n  ${broken.join("\n  ")}`,
    ).toEqual([]);
  });

  it("actually finds tool mentions, so the test above can fail", () => {
    // Without this, a change to the matcher that stops matching anything
    // turns the assertion above into a test that always passes.
    const all = SKILLS.flatMap((s) => toolMentions(s.body)).filter((m) =>
      TOOL_NAMES.has(m),
    );
    expect(new Set(all).size).toBeGreaterThanOrEqual(8);
  });
});

describe("the skills have the frontmatter a plugin needs", () => {
  it("every skill declares a name matching its directory", () => {
    for (const s of SKILLS) {
      const name = s.body.match(/^---\r?\n(?:.*\r?\n)*?name:\s*(\S+)/)?.[1];
      expect(name, s.name).toBe(s.name);
    }
  });

  it("every skill declares a description", () => {
    for (const s of SKILLS) {
      const desc = s.body.match(/^description:\s*"?(.+?)"?\s*$/m)?.[1];
      expect(desc?.length ?? 0, s.name).toBeGreaterThan(30);
    }
  });
});

describe("the skill that grounds the others is reachable", () => {
  it("the three that need business context point at the setup skill", () => {
    // Each of these gets materially worse without client knowledge, and
    // the whole point of writing it down is that the next session reads
    // it rather than re-deriving it.
    for (const name of ["seo-fix-pass", "seo-keyword-plan"]) {
      const skill = SKILLS.find((s) => s.name === name);
      expect(skill, name).toBeDefined();
      expect(skill!.body, name).toContain("seo-client-setup");
      expect(skill!.body, name).toContain("get_client_knowledge");
    }
  });
});
