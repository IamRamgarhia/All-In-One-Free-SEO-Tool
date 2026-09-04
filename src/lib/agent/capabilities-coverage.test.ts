import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NOT_YET_PLANNED } from "./capabilities";

/**
 * A capability nothing asks for is a promise nothing keeps.
 *
 * I shipped three in one commit — write_robots_txt, write_redirects,
 * write_hardening. The plugin endpoints were real and tested, the client
 * functions were real and typed, capability detection reported them, and
 * no planner entry anywhere asked for any of them. The visible effect
 * was worse than nothing: a user on plugin 0.4.0 would be told to update
 * to 0.5.0 to unlock three features that do nothing once they have it.
 *
 * capabilities.ts's own comment names this failure — "it confidently
 * planned work it had no way to carry out, and reported success" — and
 * the file grew the exact inverse of it while I was extending it.
 */

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

const caps = src("lib/agent/capabilities.ts");
const planner = src("lib/agent/planner.ts");

/** Every capability id the union declares. */
function declaredCapabilities(): string[] {
  const start = caps.indexOf("export type CapabilityId =");
  const end = caps.indexOf(";", start);
  return [...caps.slice(start, end).matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
}

/**
 * Capabilities the planner actually requires for some action.
 *
 * Two shapes count, because there are two ways to require one. Most come
 * from a FIXABLE entry keyed to an audit finding. Internal linking does
 * not — an orphan page is invisible to any per-page check, since the
 * problem is the absence of a link on a *different* page — so
 * planInternalLinks gates itself with `has(capabilities, ...)` instead.
 * Reading only the first shape flagged it as an orphan capability, which
 * it is not.
 */
function plannedCapabilities(): Set<string> {
  return new Set([
    ...[...planner.matchAll(/capability:\s*"([a-z_]+)"/g)].map((m) => m[1]),
    ...[...planner.matchAll(/has\([^,]+,\s*"([a-z_]+)"\)/g)].map((m) => m[1]),
  ]);
}

describe("every write capability is asked for by something", () => {
  it("is planned, or explicitly recorded as not planned yet", () => {
    const planned = plannedCapabilities();
    const orphans = declaredCapabilities()
      .filter((id) => id.startsWith("write_"))
      .filter((id) => !planned.has(id))
      .filter((id) => !(id in NOT_YET_PLANNED));

    expect(
      orphans,
      `${orphans.join(", ")} is detected and reported to users but no ` +
        `planner entry ever requires it, so it can never turn into work. ` +
        `Either give it a FIXABLE entry, or add it to NOT_YET_PLANNED with ` +
        `what is missing — which also keeps it out of the "update your ` +
        `plugin" prompt, so nobody is sent to unlock something inert.`,
    ).toEqual([]);
  });

  it("nothing sits in NOT_YET_PLANNED that is actually planned", () => {
    // The other direction: wiring one up and forgetting to remove it
    // here would permanently suppress a real gap message, so a user
    // whose plugin is too old would never be told why it isn't working.
    const planned = plannedCapabilities();
    const stale = Object.keys(NOT_YET_PLANNED).filter((id) => planned.has(id));
    expect(
      stale,
      `${stale.join(", ")} is planned now, so remove it from ` +
        `NOT_YET_PLANNED — otherwise its "update your plugin" message ` +
        `stays suppressed and the capability silently never works.`,
    ).toEqual([]);
  });

  it("every excuse names a real capability", () => {
    const declared = new Set(declaredCapabilities());
    const unreal = Object.keys(NOT_YET_PLANNED).filter((id) => !declared.has(id));
    expect(unreal, `${unreal.join(", ")} is not a capability.`).toEqual([]);
  });

  it("reads back a non-empty reason for each", () => {
    for (const [id, why] of Object.entries(NOT_YET_PLANNED)) {
      expect((why ?? "").length, `${id} needs a real reason`).toBeGreaterThan(30);
    }
  });
});
