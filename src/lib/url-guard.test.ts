import { describe, expect, it } from "vitest";
import { guardUrl, isPrivateIp } from "./url-guard";

/**
 * A guard that is too loose does nothing; a guard that is too strict
 * starts rejecting real customer sites with a security-flavoured error,
 * which is worse than no guard because people then turn it off. Both
 * directions are pinned here.
 */

describe("isPrivateIp", () => {
  it.each([
    ["127.0.0.1", "loopback"],
    ["127.1.2.3", "loopback range"],
    ["10.0.0.1", "RFC1918"],
    ["172.16.0.1", "RFC1918 lower bound"],
    ["172.31.255.254", "RFC1918 upper bound"],
    ["192.168.1.1", "RFC1918"],
    ["169.254.169.254", "AWS/GCP metadata"],
    ["0.0.0.0", "unspecified"],
    ["100.64.0.1", "CGNAT"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "broadcast"],
    ["::1", "IPv6 loopback"],
    ["::", "IPv6 unspecified"],
    ["fe80::1", "IPv6 link-local"],
    ["fd00::1", "IPv6 unique-local"],
    ["::ffff:127.0.0.1", "IPv4-mapped loopback"],
  ])("blocks %s (%s)", (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });

  it.each([
    ["8.8.8.8", "public DNS"],
    ["1.1.1.1", "public DNS"],
    ["172.15.0.1", "just below RFC1918"],
    ["172.32.0.1", "just above RFC1918"],
    ["11.0.0.1", "just above 10/8"],
    ["126.255.255.255", "just below loopback"],
    ["128.0.0.1", "just above loopback"],
    ["169.253.0.1", "just below link-local"],
    ["169.255.0.1", "just above link-local"],
    ["192.167.1.1", "just below 192.168"],
    ["192.169.1.1", "just above 192.168"],
    ["100.63.0.1", "just below CGNAT"],
    ["100.128.0.1", "just above CGNAT"],
    ["2606:4700::1111", "public IPv6"],
  ])("allows %s (%s)", (ip) => {
    expect(isPrivateIp(ip)).toBe(false);
  });
});

describe("guardUrl", () => {
  it("rejects non-http schemes", async () => {
    for (const u of [
      "file:///etc/passwd",
      "ftp://example.com/x",
      "gopher://example.com",
      "data:text/html,<script>",
    ]) {
      const r = await guardUrl(u);
      expect(r.ok, u).toBe(false);
    }
  });

  it("rejects localhost by name", async () => {
    for (const u of [
      "http://localhost/",
      "http://localhost:6379/",
      "http://foo.localhost/",
      "http://ip6-localhost/",
    ]) {
      const r = await guardUrl(u);
      expect(r.ok, u).toBe(false);
    }
  });

  it("rejects cloud metadata endpoints", async () => {
    for (const u of [
      "http://169.254.169.254/latest/meta-data/",
      "http://metadata.google.internal/computeMetadata/v1/",
    ]) {
      const r = await guardUrl(u);
      expect(r.ok, u).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/metadata|private|reserved/i);
    }
  });

  it("rejects private IP literals without needing DNS", async () => {
    for (const u of [
      "http://127.0.0.1:3000/",
      "http://10.1.2.3/",
      "http://192.168.0.1/admin",
      "http://[::1]:8080/",
    ]) {
      const r = await guardUrl(u, { resolveDns: false });
      expect(r.ok, u).toBe(false);
    }
  });

  it("rejects internal-looking TLDs", async () => {
    for (const u of ["http://db.internal/", "http://printer.local/"]) {
      const r = await guardUrl(u);
      expect(r.ok, u).toBe(false);
    }
  });

  it("allows ordinary public URLs", async () => {
    for (const u of [
      "https://example.com/",
      "http://example.com/page?a=1",
      "https://sub.domain.example.co.uk/path",
    ]) {
      const r = await guardUrl(u, { resolveDns: false });
      expect(r.ok, u).toBe(true);
    }
  });

  it("allows a public IP literal", async () => {
    const r = await guardUrl("http://8.8.8.8/", { resolveDns: false });
    expect(r.ok).toBe(true);
  });

  it("does not block a domain that simply fails to resolve", async () => {
    // A typo'd domain is a user error, not an attack. Reporting it as
    // "blocked for security" sends people hunting for the wrong problem.
    const r = await guardUrl(
      "https://this-domain-definitely-does-not-exist-9f8a7b.example/",
    );
    expect(r.ok).toBe(true);
  });

  it("rejects malformed input", async () => {
    for (const u of ["", "not a url", "http://"]) {
      const r = await guardUrl(u);
      expect(r.ok, JSON.stringify(u)).toBe(false);
    }
  });
});
