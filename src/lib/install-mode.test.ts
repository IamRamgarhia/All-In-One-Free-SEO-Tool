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
 * Verified against real Docker on 30 Oct 2026 (Docker Desktop 4.97.0,
 * engine 29.9.2), which closed the one gap these pure tests cannot
 * cover: whether Node's `execFile` can launch the binary at all. It
 * can — `docker.exe`, not a `.cmd`, which is why a stub could never
 * stand in for it.
 *
 * The NDJSON fixtures match what that run produced: one object per
 * line carrying `Service`, `Name` and `Image`, and empty output with
 * exit 0 when the project has no containers. The pre-2.21 JSON-array
 * shape and the malformed cases remain written from the documented
 * schema rather than captured, since this machine's Compose only emits
 * the newer one.
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
    // The message has to tell the user how to get past it, and both
    // routes count — the buttons in the panel and the env var.
    expect(r.why).toMatch(/tell this panel|SEO_INSTALL_MODE/);
  });

  /**
   * The case that made the control panel unusable.
   *
   * Installing Docker Desktop on a machine with a working native
   * install, and not running it, moved detection from NATIVE ("docker is
   * not installed") to UNKNOWN — and UNKNOWN refuses every button. The
   * guard was right and the product stopped working: measured on the
   * maintainer's own machine, Start returned "not safe to run".
   */
  describe("when the daemon stays silent", () => {
    const silent = (over = {}) => deps({ composePs: async () => null, ...over });

    it("takes local evidence over refusing", async () => {
      const r = await detectInstallMode(
        silent({ nativeEvidence: () => "data.db is in this folder" }),
      );
      expect(r.mode).toBe(NATIVE);
      // Flagged, because this is weaker than an answer from Docker and
      // the panel says so rather than implying it was confirmed.
      expect(r.inferred).toBe(true);
      expect(r.evidence).toBe("data.db is in this folder");
      expect(r.why).toMatch(/data\.db is in this folder/);
    });

    it("still refuses when there is no evidence either way", async () => {
      // A fresh clone has no data.db, so nothing here settles it. This
      // is the half the inference must not swallow.
      const r = await detectInstallMode(silent({ nativeEvidence: () => null }));
      expect(r.mode).toBe(UNKNOWN);
    });

    it("refuses when no evidence function was supplied at all", async () => {
      // Back-compatibility with a caller that predates the parameter
      // must fail safe, not fail open.
      const r = await detectInstallMode(silent());
      expect(r.mode).toBe(UNKNOWN);
    });

    it("never infers DOCKER from anything local", async () => {
      // Local evidence can only conclude "native". Concluding Docker
      // from a file on disk would be the original bug — guessing — with
      // extra steps, and would refuse to start an app that works.
      for (const evidence of ["a Dockerfile is here", "docker-compose.yml is here"]) {
        const r = await detectInstallMode(silent({ nativeEvidence: () => evidence }));
        expect(r.mode).toBe(NATIVE);
      }
    });
  });

  it("a real answer from docker beats local evidence", async () => {
    // The inference is a fallback for silence, not a vote. A daemon that
    // says "this project has a container" is the fact.
    const r = await detectInstallMode(
      deps({ nativeEvidence: () => "data.db is in this folder" }),
    );
    expect(r.mode).toBe(DOCKER);
    expect(r.inferred).toBeFalsy();
  });

  describe("a saved answer from the panel", () => {
    it("decides it, without touching the machine", async () => {
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
      for (const [saved, expected] of [
        ["native", NATIVE],
        ["docker", DOCKER],
        // What a person types, and what a file with a trailing newline
        // holds. The panel writes the newline itself.
        ["native\n", NATIVE],
        [" Docker ", DOCKER],
      ] as const) {
        const r = await detectInstallMode(deps({ savedMode: () => saved, ...spy }));
        expect(r.mode).toBe(expected);
        expect(r.saved).toBe(true);
        expect(r.why).toMatch(/told this panel/);
      }
      expect(touched, "a saved answer should short-circuit detection").toBe(false);
    });

    it("loses to the environment variable", async () => {
      // SEO_INSTALL_MODE is what an administrator sets for a whole
      // deployment; a click in the panel is one person on one machine.
      const r = await detectInstallMode(
        deps({ env: { SEO_INSTALL_MODE: "docker" }, savedMode: () => "native" }),
      );
      expect(r.mode).toBe(DOCKER);
    });

    it("is ignored when the file holds something else", async () => {
      // A truncated or hand-edited file must not mean anything halfway.
      // Detection runs instead, which here finds a container.
      for (const junk of ["", "  ", "yes", "DOCKERR", "native docker"]) {
        const r = await detectInstallMode(deps({ savedMode: () => junk }));
        expect(r.mode, `saved=${JSON.stringify(junk)}`).toBe(DOCKER);
        expect(r.saved).toBeFalsy();
      }
    });

    it("is ignored when the file is missing", async () => {
      const r = await detectInstallMode(deps({ savedMode: () => null }));
      expect(r.mode).toBe(DOCKER);
      expect(r.saved).toBeFalsy();
    });
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
