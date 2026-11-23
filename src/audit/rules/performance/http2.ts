import { defineRule, notMeasured, pass } from "@/audit/engine/define-rule";

export const http2Rule = defineRule({
  id: "perf-http2",
  name: "HTTP/2+ Support",
  description: "Checks for indicators of HTTP/2 or HTTP/3 protocol support (alt-svc header)",
  category: "perf",
  weight: 5,
  run: (context) => {
    const altSvc = context.headers["alt-svc"] || "";
    const details = {
      altSvc: altSvc || "not set"
    };
    if (altSvc) {
      const supportsH3 = altSvc.includes("h3");
      if (supportsH3) {
        return pass(
          "perf-http2",
          "HTTP/3 support advertised via alt-svc header \u2014 optimal protocol performance",
          { ...details, protocol: "h3" }
        );
      }
      return pass(
        "perf-http2",
        `alt-svc header present ("${altSvc.length > 80 ? altSvc.slice(0, 80) + "..." : altSvc}") \u2014 modern protocol support indicated`,
        details
      );
    }
    // No alt-svc says nothing about HTTP/2: it is negotiated in the TLS
    // handshake (ALPN), which these headers do not show, and alt-svc only
    // advertises HTTP/3. nd-prestige.com serves HTTP/2 and was warned for it.
    return notMeasured(
      "perf-http2",
      "HTTP/2 is negotiated in the TLS handshake, not visible in headers; no alt-svc header (no HTTP/3 advertised)",
      details
    );
  }
});
