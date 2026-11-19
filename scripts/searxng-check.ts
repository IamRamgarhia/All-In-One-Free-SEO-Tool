/**
 * Drives the app's own SearXNG provider against a real instance.
 *
 * The first standing rule applied properly: a fixture test proves the
 * parser handles a captured response, and only a live run proves the
 * request shape, the format parameter, the timeout and the instance's
 * config are right together. SearXNG does not serve JSON unless `json`
 * is in `search.formats`, and the symptom of getting that wrong is an
 * HTTP 403 with an HTML body — from the app's side, indistinguishable
 * from a blocked scrape.
 *
 * The assertion that matters most is the last one: a domain that is
 * genuinely absent must come back `ok: true, position: null`, and a
 * broken instance must come back `ok: false`. Conflating those two is
 * the bug this codebase keeps finding, and it is the difference between
 * "you are not ranking" and "we could not look".
 *
 * Start the instance first:
 *
 *   export SEARXNG_SECRET=$(openssl rand -hex 32)
 *   docker compose --profile searxng up -d searxng
 *   pnpm exec tsx scripts/searxng-check.ts
 *
 * The container is not published to the host — an open SearXNG is an
 * open proxy — so this reaches it the way the app does, over the compose
 * network, through a throwaway curl container.
 */
import { execFileSync } from "node:child_process";
import { createSearxngProvider, parseSearxResults } from "../src/lib/serp/searxng";

const DIRECT = process.env.SEARXNG_URL ?? "";
const NETWORK = process.env.SEARXNG_NETWORK ?? "seo_default";
const HOST = process.env.SEARXNG_HOST ?? "http://searxng:8080";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, got?: unknown) {
  if (ok) {
    pass++;
    console.log(`  \x1b[32mPASS\x1b[0m  ${name}`);
  } else {
    fail++;
    console.log(
      `  \x1b[31mFAIL\x1b[0m  ${name}${got === undefined ? "" : ` — got ${JSON.stringify(got)}`}`,
    );
  }
}

/**
 * Fetch through a throwaway container on the compose network.
 *
 * Passed as the provider's `fetchImpl`, so the provider still builds the
 * URL and reads the body exactly as it does in production; only the
 * transport differs. Faking the response here would test nothing.
 */
function dockerFetch(url: string, status = 200): Promise<Response> {
  const body = execFileSync(
    "docker",
    ["run", "--rm", "--network", NETWORK, "curlimages/curl:latest", "-s", "--max-time", "25", url],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
  return Promise.resolve(
    new Response(body, {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

async function main() {
  const viaDocker = !DIRECT;
  const instanceUrl = DIRECT || HOST;
  const fetchImpl = viaDocker
    ? (((input: RequestInfo | URL) => dockerFetch(String(input))) as typeof fetch)
    : undefined;

  console.log(
    `\nInstance: ${instanceUrl}${viaDocker ? ` (via docker network ${NETWORK})` : ""}\n`,
  );

  const provider = createSearxngProvider({ instanceUrl, fetchImpl });
  check("the provider identifies itself as searxng", provider.id === "searxng", provider.id);

  console.log("\nA site that really does rank is found, with a position");
  const hit = await provider.lookup({
    query: "wordpress seo plugin",
    domain: "wordpress.org",
    country: "US",
  });
  check("the lookup succeeded", hit.ok === true, hit);
  if (hit.ok) {
    check("a position was returned", typeof hit.position === "number", hit.position);
    check(
      "the position is plausible, not 0 or negative",
      (hit.position ?? 0) > 0,
      hit.position,
    );
    check("it says how many results it scanned", hit.resultsScanned > 0, hit.resultsScanned);
    check("and which engines backed the answer", Boolean(hit.detail), hit.detail);
    console.log(`    position ${hit.position} of ${hit.resultsScanned} scanned`);
    console.log(`    ${hit.detail ?? ""}`);
    console.log(`    url: ${hit.url ?? "(none)"}`);
  }

  console.log("\n'Not in these results' is an ANSWER, not an error");
  const miss = await provider.lookup({
    // A domain that cannot plausibly rank for this phrase, but a query
    // that definitely returns results — so an empty position is a real
    // finding rather than a failed request.
    query: "wordpress seo plugin",
    domain: "this-domain-does-not-exist-91823.invalid",
    country: "US",
  });
  check("still ok: true", miss.ok === true, miss);
  if (miss.ok) {
    check("position is null", miss.position === null, miss.position);
    check(
      "and it still reports how many results it looked at",
      miss.resultsScanned > 0,
      miss.resultsScanned,
    );
    console.log(`    scanned ${miss.resultsScanned} results, not present`);
  }

  console.log("\nA broken instance is an ERROR, never 'not ranking'");
  const broken = createSearxngProvider({
    instanceUrl: "http://searxng-does-not-exist.invalid:8080",
    fetchImpl: (() => Promise.reject(new Error("getaddrinfo ENOTFOUND"))) as typeof fetch,
  });
  const err = await broken.lookup({ query: "x", domain: "example.com" });
  check("ok is false", err.ok === false, err);
  if (!err.ok) {
    check("with a reason attached", Boolean(err.error), err.error);
    console.log(`    ${err.error}`);
  }

  console.log("\nThe raw body parses the way the fixture test expects");
  const raw = await dockerFetch(`${instanceUrl}/search?q=wordpress+seo+plugin&format=json`);
  const parsed = parseSearxResults(await raw.json());
  check("results came back", parsed.urls.length >= 5, parsed.urls.length);
  check("engines are named", parsed.engines.length > 0, parsed.engines);
  check(
    "no hostless redirect survived the parse",
    parsed.urls.every((u) => {
      try {
        return new URL(u).hostname.includes(".");
      } catch {
        return false;
      }
    }),
  );
  console.log(`    ${parsed.urls.length} results from: ${parsed.engines.join(", ")}`);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(
    "\nCould not reach the instance. Is it running?\n" +
      "  export SEARXNG_SECRET=$(openssl rand -hex 32)\n" +
      "  docker compose --profile searxng up -d searxng\n",
  );
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
