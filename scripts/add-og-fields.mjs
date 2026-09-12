/**
 * Replace the looped Open Graph handler with explicit branches.
 *
 * The loop was fewer lines and worse. plugin-contract.test.ts verifies
 * the wire contract by finding `isset($body['field'])` literally, which
 * is a deliberately simple check on a file that runs inside other
 * people's live sites — and a foreach over a list of field names is
 * invisible to it. Being clever here bought six saved lines and cost the
 * only guard standing between a typo and a silent no-op write.
 *
 * Same reason the branches above it are written out one by one.
 */

import fs from "node:fs";

const FILE = "wordpress-plugin/seo-tool-bridge.php";
const raw = fs.readFileSync(FILE, "utf8");
const crlf = raw.includes("\r\n");
let s = raw.split("\r\n").join("\n");

const LOOPED_START = "// Open Graph and Twitter. Text fields are sanitised as text and the";
const LOOPED_END = "    if (isset($body['robots'])) {";

const from = s.indexOf(LOOPED_START);
const to = s.indexOf(LOOPED_END);
if (from === -1 || to === -1 || to < from) {
  console.log("SKIP: looped block not found");
  process.exit(1);
}

const text = (field) => `    if (isset($body['${field}'])) {
        $new = sanitize_text_field($body['${field}']);
        $old = stb_get_social_meta($id, '${field}');
        if ($new !== $old) {
            stb_set_social_meta($id, '${field}', $new);
            $rev_id = stb_record_revision('${field}', "post:$id", $old, $new);
            $changes[] = ['field' => '${field}', 'rev_id' => $rev_id];
        }
    }

`;

const url = (field) => `    if (isset($body['${field}'])) {
        // esc_url_raw, not sanitize_text_field: an og:image that is not a
        // URL renders as a broken share card rather than no card, which
        // is the worse of the two outcomes.
        $new = esc_url_raw(trim((string)$body['${field}']));
        $old = stb_get_social_meta($id, '${field}');
        if ($new !== $old) {
            stb_set_social_meta($id, '${field}', $new);
            $rev_id = stb_record_revision('${field}', "post:$id", $old, $new);
            $changes[] = ['field' => '${field}', 'rev_id' => $rev_id];
        }
    }

`;

const block =
  `    // Open Graph and Twitter, written out one branch per field.
    //
    // A foreach over a list of field names was shorter and is not worth
    // it: plugin-contract.test.ts verifies this wire contract by finding
    // isset($body['field']) literally, and a loop is invisible to it.
    // That check is the only thing standing between a renamed field and
    // a write that reports success while changing nothing, which has
    // already happened here twice.

` +
  text("og_title") +
  text("og_description") +
  url("og_image") +
  text("twitter_title") +
  text("twitter_description") +
  url("twitter_image");

s = s.slice(0, from) + block + s.slice(to);

if (crlf) s = s.split("\n").join("\r\n");
fs.writeFileSync(FILE, s, "utf8");
console.log("rewrote the Open Graph handler as explicit branches");
