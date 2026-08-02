/**
 * A fake Ollama, so the agent's whole loop can run with no API key.
 *
 * The agent's automation — plan, draft, write, verify, undo — had never
 * executed end to end, because drafting needs a model and testing it
 * needed someone's paid key. Ollama's URL is configurable (OLLAMA_URL or
 * the api.ollama_url setting) and its HTTP surface is one route, so a
 * stand-in closes that gap entirely.
 *
 * It returns fixed, deliberately VALID copy — a title inside the display
 * limit, a description in range, alt text that doesn't start with "Image
 * of". The point is not to test the model. It's to test everything that
 * happens either side of it: that a draft reaches the CMS, lands, reads
 * back, and can be taken off again.
 *
 * Pass --bad to return copy that breaks every rule instead. The executor
 * is supposed to refuse it and write nothing, and that is the more
 * important of the two behaviours — a "fix" that leaves a title still
 * truncated, recorded as success, is the exact bug class this project
 * keeps finding.
 *
 *   node scripts/fake-ollama.mjs [port] [--bad]
 */

import { createServer } from "node:http";

const PORT = Number(process.argv[2] ?? 8788);
const BAD = process.argv.includes("--bad");

/** Valid replies: within every limit the executor enforces. */
const GOOD = {
  title: "Handmade Soap for Sensitive Skin",
  meta: "Gentle handmade soap made for sensitive skin, with no synthetic fragrance or harsh detergents. Free UK delivery on orders over twenty pounds.",
  alt: "Bars of handmade soap stacked on a wooden shelf",
  schema:
    '{"@context":"https://schema.org","@type":"Article","headline":"Hello world"}',
};

/** Replies that must be REFUSED, each breaking a different rule. */
const INVALID = {
  title: "A".repeat(95), // still over the display limit
  meta: "A".repeat(200), // would be cut off mid-sentence
  alt: "Image of soap bars on a shelf", // screen readers already say "image"
  schema: "{not json",
};

function reply(prompt) {
  const p = prompt.toLowerCase();
  const set = BAD ? INVALID : GOOD;
  // Order matters: the alt-text prompt also mentions the page, and the
  // schema prompt mentions the title.
  if (p.includes("alt text") || p.includes("alt attribute")) return set.alt;
  if (p.includes("json-ld") || p.includes("schema")) return set.schema;
  if (p.includes("meta description") || p.includes("description")) return set.meta;
  return set.title;
}

const server = createServer(async (req, res) => {
  if (!req.url?.startsWith("/api/chat")) {
    res.writeHead(404).end("{}");
    return;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  let prompt = "";
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    prompt = (body.messages ?? []).map((m) => m.content ?? "").join("\n");
  } catch {
    // fall through to the default reply
  }
  const payload = JSON.stringify({
    model: "fake",
    message: { role: "assistant", content: reply(prompt) },
    done: true,
  });
  res.writeHead(200, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
});

server.listen(PORT, () => {
  console.log(
    `fake Ollama on http://localhost:${PORT} (${BAD ? "INVALID" : "valid"} replies)`,
  );
});
