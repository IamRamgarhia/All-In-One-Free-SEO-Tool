import { describe, expect, it } from "vitest";
import {
  DOCKER,
  NATIVE,
  UNKNOWN,
  detectInstallMode,
  forcedMode,
  readComposePs,
} from "../../scripts/install-mode.mjs";

/**
 * Whether this install runs in Docker decides whether the control
 * panel's buttons are safe. Every one of them drives `bin/START.*` and
 * the local `data.db`; on a Docker install that starts a second app
 * against a different, empty database and reports success.
 *
 * CLAUDE.md recorded this detection as unverified against real Docker,
 * and it still is at the one point that needs it — whether `execFile`
 * can launch the binary. There is no Docker on this machine and a
 * stubbed `docker.cmd` cannot stand in, because Node's `execFile` will
 * not launch a `.cmd`. Everything downstream of that call is pure, and
 * is covered here.
 *
 * The compose-output fixtures are written from the documented
 * `docker compose ps --format json` schema and the two shapes it has
 * shipped — a JSON array before Compose v2.21, NDJSON after. They are
 * NOT captured from a live daemon. If a real run disagrees with one of
 * these, the fixture is what is wrong.
 */

const NDJSON_RUNNING = [
  '{"Name":"seo-seo-1","Image":"seo-tool:local","Service":"seo","State":"running","Health":"","ExitCode":0}',
].join("\n");

const NDJSON_STOPPED = [
  // `-a` is passed precisely so this counts: a stopped container is
  // still a Docker install, and that is when someone comes looking for
  // a Start button.
  '{"Name":"seo-seo-1","Image":"seo-tool:local","Service":"seo","State":"exited","Health":"","ExitCode":0}',
].join("\n");

const ARRAY_RUNNING =
  '[{"Name":"seo-seo-1","Image":"seo-tool:local","Service":"seo","State":"running"}]';

const NDJSON_OTHER_PROJECT = [
  '{"Name":"blog-web-1","Image":"nginx:latest","Service":"web","State":"running"}',
  '{"Name":"blog-db-1","Image":"postgres:16","Service":"db","State":"running"}',
].join("\n");

describe("forcedMode", () => {
  it("honours an explicit override either way", () => {
    expect(forcedMode({ SEO_INSTALL_MODE: "docker" })).toBe(DOCKER);
    expect(forcedMode({ SEO_INSTALL_MODE: "native" })).toBe(NATIVE);
    // Case and whitespace are what a person actually types.
    expect(forcedMode({ SEO_INSTALL_MODE: " Docker " })).toBe(DOCKER);
    expect(forcedMode({ SEO_INSTALL_MODE: "NATIVE" })).toBe(NATIVE);
  });

  it("returns null when unset, so detection runs", () => {
    expect(forcedMode({})).toBeNull();
    expect(forcedMode({ SEO_INSTALL_MODE: "" })).toBeNull();
  });

  it("treats a typo as unknown rather than as detection", () => {
    // `SEO_INSTALL_MODE=dcoker` must not quietly fall through to
    // guessing. The user said something; we could not read it.
    expect(forcedMode({ SEO_INSTALL_MODE: "dcoker" })).toBe(UNKNOWN);
    expect(forcedMode({ SEO_INSTALL_MODE: "true" })).toBe(UNKNOWN);
  });
});

describe("readComposePs", () => {
  it("recognises our container, running or stopped, in both formats", () => {
    expect(readComposePs(NDJSON_RUNNING)).toBe(DOCKER);
    expect(readComposePs(NDJSON_STOPPED)).toBe(DOCKER);
    expect(readComposePs(ARRAY_RUNNING)).toBe(DOCKER);
  });

  it("reads no containers as a real native answer", () => {
    // The command ran and said this project has nothing. That is an
    // answer, not a failure.
    expect(readComposePs("[]")).toBe(NATIVE);
    expect(readComposePs("")).toBe(NATIVE);
    expect(readComposePs("   \n  ")).toBe(NATIVE);
  });

  it("does not claim Docker for somebody else's containers", () => {
    expect(readComposePs(NDJSON_OTHER_PROJECT)).toBe(NATIVE);
  });

  it("reads the service by position in the container name", () => {
    // The old check was `stdout.includes("seo")`, which is true of the
    // image `seo-tool:local`, the volume `seo-data`, and any path
    // containing "seo" — including this project's own directory.
    //
    // Matching "seo" as a delimited segment instead is the obvious fix
    // and is still wrong: "seo" IS a segment of `video-seo-helper`.
    // The first version of this helper did that and this case caught
    // it. Compose names containers <project>-<service>-<index>, so only
    // the position settles it.
    const lookalike =
      '{"Name":"video-seo-helper-web-1","Image":"nginx","State":"running"}';
    expect(readComposePs(lookalike)).toBe(NATIVE);

    // And the same project really running our service is still found,
    // without a Service field to lean on.
    const ours = '{"Name":"video-seo-helper-seo-1","State":"running"}';
    expect(readComposePs(ours)).toBe(DOCKER);
  });

  it("says unknown when the command did not run", () => {
    // execCapped returns null for a failure, a timeout, or a daemon
    // that is not running — which is the common case, and the one the
    // old boolean reported as "native".
    expect(readComposePs(null)).toBe(UNKNOWN);
    expect(readComposePs(undefined)).toBe(UNKNOWN);
  });

  it("says unknown for output it cannot parse", () => {
    // A future format change, or a daemon writing a warning to stdout.
    // Guessing native here is the dangerous direction.
    expect(readComposePs("NAME  IMAGE  SERVICE  STATUS")).toBe(UNKNOWN);
    expect(readComposePs("{not json")).toBe(UNKNOWN);
  });

  it("still finds our container when one NDJSON line is malformed", () => {
    expect(readComposePs(`garbage\n${NDJSON_RUNNING}`)).toBe(DOCKER);
  });

  it("will not call it native when a line failed to parse", () => {
    // Half-read output cannot support "this project has no containers":
    // the line we could not read might have been ours.
    expect(readComposePs(`garbage\n${NDJSON_OTHER_PROJECT}`)).toBe(UNKNOWN);
  });
});

describe("detectInstallMode", () => {
  const deps = (over: Partial<Record<string, unknown>> = {}) => ({
    env: {},
    hasComposeFile: () => true,
    hasDockerBin: async () => true,
    composePs: async () => NDJSON_RUNNING,
    ...over,
  });

  it("returns docker when compose has our container", async () => {
    const r = await detectInstallMode(deps());
    expect(r.mode).toBe(DOCKER);
    expect(r.why).toMatch(/container/);
  });

  it("returns native with no compose file", async () => {
    const r = await detectInstallMode(deps({ hasComposeFile: () => false }));
    expect(r.mode).toBe(NATIVE);
  });

  it("returns native when docker is not installed", async () => {
    const r = await detectInstallMode(deps({ hasDockerBin: async () => false }));
    expect(r.mode).toBe(NATIVE);
    expect(r.why).toMatch(/not installed/);
  });

  it("returns unknown when docker is there but will not answer", async () => {
    // Docker Desktop installed and not running. The whole reason this
    // is three-valued: the old code called this native and then started
    // a second app against an empty database.
    const r = await detectInstallMode(deps({ composePs: async () => null }));
    expect(r.mode).toBe(UNKNOWN);
    expect(r.why).toMatch(/not running/);
    // The message has to tell the user how to get past it.
    expect(r.why).toMatch(/SEO_INSTALL_MODE/);
  });

  it("an override wins without touching the machine", async () => {
    // Also the only way to exercise either branch here.
    let touched = false;
    const spy = {
      hasComposeFile: () => {
        touched = true;
        return true;
      },
      hasDockerBin: async () => {
        touched = true;
        return true;
      },
      composePs: async () => {
        touched = true;
        return NDJSON_RUNNING;
      },
    };
    for (const [value, expected] of [
      ["docker", DOCKER],
      ["native", NATIVE],
    ] as const) {
      const r = await detectInstallMode(
        deps({ env: { SEO_INSTALL_MODE: value }, ...spy }),
      );
      expect(r.mode).toBe(expected);
      expect(r.forced).toBe(true);
    }
    expect(touched, "an override should short-circuit detection").toBe(false);
  });

  it("an unreadable override refuses instead of detecting", async () => {
    const r = await detectInstallMode(
      deps({ env: { SEO_INSTALL_MODE: "yes" } }),
    );
    expect(r.mode).toBe(UNKNOWN);
    expect(r.forced).toBe(true);
  });

  it("every outcome carries a reason to show the user", async () => {
    for (const d of [
      deps(),
      deps({ hasComposeFile: () => false }),
      deps({ hasDockerBin: async () => false }),
      deps({ composePs: async () => null }),
      deps({ composePs: async () => "[]" }),
      deps({ env: { SEO_INSTALL_MODE: "docker" } }),
    ]) {
      const r = await detectInstallMode(d);
      expect([DOCKER, NATIVE, UNKNOWN]).toContain(r.mode);
      expect(typeof r.why).toBe("string");
      expect(r.why.length).toBeGreaterThan(0);
    }
  });
});
