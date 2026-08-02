/**
 * Verify the public grader widget the way a stranger meets it.
 *
 * This is the only endpoint in the product that anyone on the internet
 * can reach AND that makes the server fetch a URL of their choosing.
 * Three properties matter, and all three fail silently:
 *
 *   - It must be reachable with no session. If the auth gate ever covers
 *     it, the widget renders a login page inside the agency's marketing
 *     site and nobody notices until leads stop arriving.
 *   - It must refuse internal addresses. A public SSRF against an
 *     agency's own network is the worst thing this app could ship.
 *   - It must not leak the app. The agency's sidebar rendering inside a
 *     stranger's browser is the white-label failure, again.
 *
 *   node scripts/grader-embed-check.mjs http://localhost:3000
 */

const BASE = process.argv[2] ?? "http://localhost:3000";

let pass = 0;
let fail = 0;
const ok = (m, d = "") => {
  pass++;
  console.log(`  PASS  ${m}${d ? "  — " + d : ""}`);
};
const bad = (m, d = "") => {
  fail++;
  console.log(`  FAIL  ${m}${d ? "  — " + d : ""}`);
};
const section = (t) =>
  console.log("\n" + "=".repeat(70) + "\n" + t + "\n" + "=".repeat(70));

async function main() {
  console.log(`Grader widget check against ${BASE}\n`);

  section("Reachable without a session");
  const res = await fetch(`${BASE}/embed/grader`, {
    headers: { accept: "text/html" },
    redirect: "manual",
  });
  const html = res.ok ? await res.text() : "";

  if (res.status === 200) ok("loads anonymously", "200");
  else {
    bad(
      "the widget is not publicly reachable",
      `status ${res.status}${res.headers.get("location") ? " -> " + res.headers.get("location") : ""}`,
    );
    finish();
    return;
  }

  if (html.includes("Free SEO audit")) ok("renders the audit form");
  else bad("the form is missing from the page");

  section("Does not leak the app into a stranger's browser");
  // The exact failure found on the client portal: shell rendered under
  // an overlay, invisible on screen, fully present in the HTML.
  const leaks = [
    ["sidebar-foreground", "the app sidebar"],
    ['href="/settings"', "a link to Settings"],
    ['href="/clients"', "a link to the client list"],
  ];
  let leaked = false;
  for (const [needle, label] of leaks) {
    if (html.includes(needle)) {
      bad(`${label} is present in the widget HTML`);
      leaked = true;
    }
  }
  if (!leaked) ok("no app chrome, no internal links");

  section("Framing policy");
  const csp = res.headers.get("content-security-policy") ?? "";
  const xfo = res.headers.get("x-frame-options");
  if (csp.includes("frame-ancestors *")) {
    ok("the widget may be framed by any site", "frame-ancestors *");
  } else {
    bad(
      "the widget cannot be embedded",
      `csp="${csp}" x-frame-options="${xfo}" — an agency's iframe would render nothing`,
    );
  }

  // And the rest of the app must NOT be framable, or a logged-in user
  // can be clickjacked.
  const appRes = await fetch(`${BASE}/settings`, {
    headers: { accept: "text/html" },
    redirect: "manual",
  });
  const appCsp = appRes.headers.get("content-security-policy") ?? "";
  const appXfo = appRes.headers.get("x-frame-options") ?? "";
  if (appCsp.includes("frame-ancestors 'self'") || appXfo === "SAMEORIGIN") {
    ok("the rest of the app refuses framing", appXfo || appCsp);
  } else {
    bad("the app can be framed by anyone", "clickjacking risk");
  }

  section("SSRF and rate limiting");
  console.log(
    "  NOTE  these run against the action's logic directly, not over HTTP.",
  );
  console.log(
    "        The first version of this script POSTed a plain form to the",
  );
  console.log(
    "        route — but a Next server action needs its Next-Action id, so",
  );
  console.log(
    "        the action never ran and every SSRF target 'passed' because",
  );
  console.log(
    "        nothing had happened. A green check on code that didn't",
  );
  console.log(
    "        execute is worse than no check. See grader-ssrf-check.ts.",
  );
  console.log(
    "        Run:  pnpm exec tsx scripts/grader-ssrf-check.ts",
  );

  finish();
}

function finish() {
  console.log("\n" + "=".repeat(70));
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("CRASHED:", e);
  process.exit(1);
});
