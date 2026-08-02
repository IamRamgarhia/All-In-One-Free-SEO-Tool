/**
 * Run the agent's CMS-writing path against a fake WordPress.
 *
 * Everything added in the last few commits — the bridge client, per-image
 * alt-text expansion, the write/verify/undo model — had never executed.
 * Written carefully and reviewed, which this project has repeatedly
 * learned is not the same as run: the portal shipped a sidebar, the
 * audit page invented its page count, four checks of mine passed on code
 * they never touched. Every one of those looked correct.
 *
 * scripts/fake-wordpress.mjs implements the plugin's endpoints as the PHP
 * is documented to behave. This drives the real client and executor
 * against it.
 *
 *   pnpm exec tsx scripts/wp-bridge-check.ts
 *
 * It starts and stops its own fake. The checks below write titles,
 * schema and links, so they only hold against a fresh site — sharing a
 * long-lived server would make the second run fail for reasons that have
 * nothing to do with the code.
 *
 * What this proves: our side. What it does NOT prove: that the PHP
 * behaves as documented — that still needs a real WordPress, and the
 * link inserter especially, since it edits article bodies.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  getPostImages,
  getPostSchema,
  getPostSeo,
  insertInternalLinks,
  pingWpBridge,
  setAttachmentAlt,
  setPostSchema,
  setPostSeo,
  findPostIdByUrl,
  type WpCreds,
} from "../src/lib/wp-bridge";
import { hasPluginVersion } from "../src/lib/agent/capabilities";

const PORT = Number(process.env.FAKE_WP_PORT ?? 8787);
const creds: WpCreds = {
  endpoint: `http://localhost:${PORT}/seo-tool/v1`,
  key: "fake-bridge-key",
};

// The endpoint is loopback, which the SSRF guard refuses by default and
// should. This is the same opt-in a self-hoster running WordPress in the
// same compose stack would set. Done here rather than in CI's env so
// running the script by hand needs no ceremony.
process.env.SEO_ALLOW_PRIVATE_WP_ENDPOINT = "1";

let server: ChildProcess | null = null;

async function startFakeWordPress(): Promise<boolean> {
  const here = dirname(fileURLToPath(import.meta.url));
  server = spawn(
    process.execPath,
    [join(here, "fake-wordpress.mjs"), String(PORT)],
    { stdio: "ignore" },
  );
  server.on("error", () => {});

  // Poll rather than sleep — a fixed wait is either slower than it needs
  // to be or flaky on a loaded CI runner, and usually both.
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/seo-tool/v1/ping`, {
        headers: { "x-stb-key": "fake-bridge-key" },
      });
      if (res.ok) return true;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

function stopFakeWordPress() {
  server?.kill();
  server = null;
}

let pass = 0;
let fail = 0;
const ok = (m: string, d = "") => {
  pass++;
  console.log(`  PASS  ${m}${d ? "  — " + d : ""}`);
};
const bad = (m: string, d = "") => {
  fail++;
  console.log(`  FAIL  ${m}${d ? "  — " + d : ""}`);
};
const section = (t: string) =>
  console.log("\n" + "=".repeat(70) + "\n" + t + "\n" + "=".repeat(70));

async function main() {
  section("Connection");
  if (!(await startFakeWordPress())) {
    bad("the fake WordPress never came up", `port ${PORT} may be in use`);
    finish();
    return;
  }
  const ping = await pingWpBridge(creds);
  if (!ping.ok) {
    bad("couldn't reach the fake bridge", ping.error ?? "");
    finish();
    return;
  }
  ok("ping", `plugin ${ping.version}`);

  if (hasPluginVersion(ping.version, "0.3.0")) {
    ok("version gate accepts 0.3.0");
  } else {
    bad("version gate rejected a 0.3.0 plugin");
  }

  section("Auth is actually enforced");
  const wrongKey = await pingWpBridge({ ...creds, key: "wrong" });
  if (!wrongKey.ok) ok("a bad key is rejected");
  else bad("A BAD KEY WAS ACCEPTED", "the header isn't being checked");

  section("Resolve a URL to a post");
  const postId = await findPostIdByUrl(
    creds,
    `http://localhost:${PORT}/hello-world`,
  );
  if (postId === 101) ok("found the post", `id ${postId}`);
  else bad("URL didn't resolve", String(postId));

  section("Titles and meta — read, write, read back");
  const before = await getPostSeo(creds, 101);
  if (before.ok) ok("read current SEO", `title "${before.seo.title}"`);
  else bad("couldn't read", before.error);

  const newTitle = "Handmade Soap for Sensitive Skin";
  const wrote = await setPostSeo(creds, 101, { title: newTitle });
  if (wrote.ok) ok("wrote a title");
  else bad("write failed", wrote.error ?? "");

  const after = await getPostSeo(creds, 101);
  if (after.ok && after.seo.title === newTitle) {
    ok("read it back and it matches", "this is what 'verified' means");
  } else {
    bad("read-back didn't match", after.ok ? after.seo.title : after.error);
  }

  section("Images — the endpoint that unblocked alt text");
  const images = await getPostImages(creds, 101);
  if (!images.ok) {
    bad("couldn't list images", images.error);
  } else {
    ok(`listed ${images.images.length} images`);
    const withIds = images.images.filter((i) => i.attachmentId !== null);
    if (withIds.length > 0) ok("images carry attachment ids", "alt text is reachable");
    else bad("no attachment ids", "alt text would still be unfixable");

    const needing = images.images.filter(
      (i) => i.fixable && i.alt.trim() === "",
    );
    const already = images.images.filter((i) => i.alt.trim() !== "");
    if (needing.length > 0 && already.length > 0) {
      ok(
        "distinguishes images that need alt text from ones that have it",
        `${needing.length} need, ${already.length} have`,
      );
    } else {
      bad("couldn't tell needs-alt from has-alt");
    }
  }

  section("Alt text — write, verify, undo");
  const target = 201;
  const originalAlt = "";
  const altText = "Bars of handmade soap stacked on a wooden shelf";

  const altWrite = await setAttachmentAlt(creds, target, altText);
  if (altWrite.ok) ok("wrote alt text");
  else bad("alt write failed", altWrite.error ?? "");

  const recheck = await getPostImages(creds, 101);
  const written =
    recheck.ok && recheck.images.find((i) => i.attachmentId === target);
  if (written && written.alt === altText) {
    ok("verified by reading the media library back");
  } else {
    bad("alt text didn't stick", written ? written.alt : "image gone");
  }

  // The undo path, which is the reason the agent is allowed to write at
  // all. If this doesn't work, nothing else here should ship.
  const undo = await setAttachmentAlt(creds, target, originalAlt);
  const undone = await getPostImages(creds, 101);
  const restored =
    undone.ok && undone.images.find((i) => i.attachmentId === target);
  if (undo.ok && restored && restored.alt === originalAlt) {
    ok("undo restored the previous value exactly");
  } else {
    bad("UNDO DIDN'T RESTORE", restored ? restored.alt : "image gone");
  }

  section("Schema — read before write, so updates are safe");
  const emptySchema = await getPostSchema(creds, 101);
  if (emptySchema.ok && emptySchema.managedJsonLd === "") {
    ok("reports no managed schema on a fresh page");
  } else {
    bad("unexpected initial schema", JSON.stringify(emptySchema));
  }

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "Hello world",
  });
  const schemaWrite = await setPostSchema(creds, 101, jsonLd);
  if (schemaWrite.ok) ok("wrote schema");
  else bad("schema write failed", schemaWrite.error ?? "");

  // Compared as parsed JSON, not as strings: the plugin decodes and
  // re-encodes with wp_json_encode, so what comes back is normalised and
  // need not be byte-identical to what went out.
  const readSchema = await getPostSchema(creds, 101);
  const sameSchema =
    readSchema.ok &&
    JSON.stringify(JSON.parse(readSchema.managedJsonLd || "null")) ===
      JSON.stringify(JSON.parse(jsonLd));
  if (sameSchema) {
    ok("schema reads back", "an update can now be safe rather than destructive");
  } else {
    bad(
      "schema didn't read back",
      readSchema.ok ? readSchema.managedJsonLd : readSchema.error,
    );
  }

  // Malformed JSON-LD must be refused by the CMS, not silently stored.
  // A page that looks marked up and isn't is worse than one that isn't.
  const bogus = await setPostSchema(creds, 101, "{not json");
  if (!bogus.ok) ok("malformed JSON-LD is refused");
  else bad("MALFORMED JSON-LD WAS ACCEPTED");

  section("Internal links — the one that edits article bodies");
  const linked = await insertInternalLinks(creds, 101, [
    { anchor: "handmade soap", url: "/shop/soap" },
  ]);
  if (linked.ok && linked.changed && linked.inserted.length === 1) {
    ok("inserted a link", `"${linked.inserted[0].anchor}"`);
  } else {
    bad("link insertion failed", JSON.stringify(linked));
  }

  // Running twice must not stack links on the same phrase — the
  // behaviour that gets auto-linking plugins uninstalled.
  const again = await insertInternalLinks(creds, 101, [
    { anchor: "handmade soap", url: "/shop/soap" },
  ]);
  if (again.ok && !again.changed && again.skipped.length === 1) {
    ok("re-running skips an already-linked anchor", again.skipped[0].reason);
  } else {
    bad("RE-RUN LINKED THE SAME PHRASE TWICE", JSON.stringify(again));
  }

  // External URLs must be refused, or a connection key becomes a
  // link-injection vector.
  const external = await insertInternalLinks(creds, 101, [
    { anchor: "cold process", url: "https://evil.example.com/" },
  ]);
  if (external.ok && !external.changed) {
    ok("refused an external URL", external.skipped[0]?.reason ?? "");
  } else {
    bad("ACCEPTED AN EXTERNAL LINK", "connection key = link injection");
  }

  // An anchor that isn't in the text is a normal outcome, not a failure.
  const missing = await insertInternalLinks(creds, 101, [
    { anchor: "nonexistent phrase here", url: "/shop" },
  ]);
  if (missing.ok && !missing.changed && missing.skipped.length === 1) {
    ok("a missing anchor is reported, not silently dropped");
  } else {
    bad("missing anchor handled wrongly", JSON.stringify(missing));
  }

  section("Old plugin — the user should be told to update");
  // A 0.2.1 plugin has no /images route and answers 404. Reproduced here
  // with a missing post rather than a missing route — same status, same
  // branch in the client, which is the part being tested: a 404 must
  // become an actionable sentence, not a generic error.
  const notFound = await getPostImages(creds, 999);
  if (!notFound.ok && /plugin|update/i.test(notFound.error)) {
    ok("a 404 becomes an update-the-plugin message", notFound.error.slice(0, 52));
  } else {
    bad("404 handled generically", notFound.ok ? "unexpectedly ok" : notFound.error);
  }

  if (!hasPluginVersion("0.2.1", "0.3.0")) {
    ok("version gate rejects 0.2.1", "capability reported unavailable");
  } else {
    bad("version gate accepted an old plugin");
  }

  finish();
}

function finish() {
  stopFakeWordPress();
  console.log("\n" + "=".repeat(70));
  console.log(`${pass} passed, ${fail} failed`);
  console.log(
    "\nProves our client and action model. Does NOT prove the PHP behaves\nas documented — that needs a real WordPress.",
  );
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  stopFakeWordPress();
  console.error("CRASHED:", e);
  process.exit(1);
});
