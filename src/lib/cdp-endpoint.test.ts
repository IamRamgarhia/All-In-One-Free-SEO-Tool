import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isLoopbackCdpUrl } from "./browser-pool";

/**
 * Attaching to the user's own Chrome.
 *
 * A Chrome DevTools Protocol endpoint is unauthenticated, complete
 * control of a browser: read any page, read any cookie, act as whoever
 * is signed in. The only thing keeping that private is that the port is
 * bound to loopback — so a settings field that accepts a remote address
 * would hand a stranger the user's logged-in browser.
 *
 * Hence a guard rather than a hope, and hence it refusing loudly: a
 * silent fall back to headless would leave someone wondering why their
 * rank checks are still blocked.
 */

describe("isLoopbackCdpUrl", () => {
  it.each([
    "http://127.0.0.1:9222",
    "http://localhost:9222",
    "http://127.0.0.1:9222/",
    "https://localhost:9222",
    "http://[::1]:9222",
    "  http://127.0.0.1:9222  ",
  ])("accepts %s", (url) => {
    expect(isLoopbackCdpUrl(url)).toBe(true);
  });

  it.each([
    // The ones that matter: a real machine somewhere else.
    "http://192.168.1.50:9222",
    "http://10.0.0.5:9222",
    "http://chrome.example.com:9222",
    "http://169.254.169.254:9222",
    // Lookalikes that a substring check would wave through.
    "http://127.0.0.1.evil.com:9222",
    "http://localhost.evil.com:9222",
    "http://evil.com/?x=127.0.0.1",
    // Not even a browser endpoint.
    "ws://127.0.0.1:9222",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "",
    "   ",
    "nonsense",
  ])("rejects %s", (url) => {
    expect(isLoopbackCdpUrl(url)).toBe(false);
  });
});

describe("the borrowed browser is never closed or replaced", () => {
  const src = readFileSync(
    join(process.cwd(), "src/lib/browser-pool.ts"),
    "utf8",
  );

  it("reuses the user's existing context rather than making one", () => {
    // newContext() over CDP returns a fresh, profile-less context: no
    // cookies, no consent choices, no sign-ins. That is exactly the
    // browser fingerprint we attached in order to stop presenting,
    // while the user believes their real profile is in use.
    expect(src).toMatch(/if \(attachedOverCdp\)[\s\S]{0,400}browser\.contexts\(\)\[0\]/);
  });

  it("never closes a context it borrowed", () => {
    expect(src).toContain("context !== borrowedContext");
  });

  it("never calls close() on a browser the user started", () => {
    // Their tabs. closeBrowser() runs when settings are saved, which
    // would otherwise shut their browser for them.
    const fn = src.slice(src.indexOf("export async function closeBrowser"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    const borrowedBranch = body.slice(body.indexOf("if (borrowed)"), body.indexOf("await b.close()"));
    expect(borrowedBranch).toContain("return;");
    expect(borrowedBranch).not.toContain("b.close(");
  });

  it("refuses a non-loopback endpoint instead of ignoring it", () => {
    expect(src).toMatch(/isLoopbackCdpUrl\(cdp\)/);
    expect(src).toMatch(/throw new Error\(\s*\n?\s*`The Chrome debugging address/);
  });
});
