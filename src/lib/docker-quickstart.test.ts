import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The advertised Docker install did not work.
 *
 * README said:
 *
 *     git clone … && cd …
 *     docker compose up -d
 *
 *     Open http://localhost:3000. That's it.
 *
 * Run on a clean checkout (30 Oct 2026, real Docker 29.9.2), that
 * produces `Restarting (1)` forever. The Dockerfile's entrypoint
 * refuses to boot without APP_PASSWORD, because the container listens
 * on 0.0.0.0 and cannot see whether Docker published its port to the
 * machine or to the internet. The refusal is deliberate and the message
 * is good; the documentation simply did not mention it, so the headline
 * install was a command that cannot succeed.
 *
 * The Dockerfile's own comment says the guard "costs nothing when the
 * default loopback mapping is used WITH A PASSWORD SET" — which is
 * exactly the step the README left out.
 *
 * This pins the two together: if the guard is ever relaxed, or the
 * documented command changes, one of these fails rather than the next
 * person discovering it by waiting for a container that never starts.
 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("the documented Docker install matches what the container requires", () => {
  const dockerfile = read("Dockerfile");

  it("the entrypoint still refuses without a password", () => {
    // If this stops being true, the docs below are over-cautious rather
    // than wrong — but somebody should notice and decide, not drift.
    expect(dockerfile).toContain("REFUSING TO START: APP_PASSWORD is not set.");
    expect(dockerfile).toMatch(/-z\s+\\?"\$APP_PASSWORD\\?"/);
    expect(dockerfile).toContain("SEO_ALLOW_NO_PASSWORD");
  });

  it.each([
    ["README.md", "README.md"],
    ["docs/HOSTING.md", "docs/HOSTING.md"],
  ])("%s tells the reader to set it before composing up", (_label, file) => {
    const text = read(file);
    const idx = text.indexOf("docker compose up -d");
    expect(idx, `${file} no longer documents docker compose up`).toBeGreaterThan(
      -1,
    );

    // The password has to be mentioned near the command, not merely
    // somewhere in the file — a reader following the quickstart block
    // does not read the whole document first.
    const nearby = text.slice(Math.max(0, idx - 900), idx + 900);
    expect(
      /APP_PASSWORD|SEO_ALLOW_NO_PASSWORD/.test(nearby),
      `${file} documents "docker compose up -d" without mentioning ` +
        `APP_PASSWORD anywhere near it. On a clean checkout that command ` +
        `crash-loops: the entrypoint refuses to start without a password.`,
    ).toBe(true);
  });

  it("README no longer claims the bare command is all there is", () => {
    const text = read("README.md");
    // The exact sentence that was false.
    expect(text).not.toMatch(
      /docker compose up -d\s*```\s*\n\s*Open <http:\/\/localhost:3000>\. That's it\./,
    );
  });

  it("compose still binds to loopback by default", () => {
    // The guard is the second line of defence; this is the first. If
    // the default bind ever becomes 0.0.0.0, an install with
    // SEO_ALLOW_NO_PASSWORD=1 would be open to the network.
    const compose = read("docker-compose.yml");
    expect(compose).toContain("${SEO_BIND_ADDR:-127.0.0.1}");
  });
});
