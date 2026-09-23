/**
 * Add the undo branches for the Open Graph / Twitter fields.
 *
 * The write branches went in and the undo switch did not, so every
 * social write answered {ok:true} and every undo of one answered 400
 * "Unsupported field". Writing worked, taking it back did not, which is
 * the worse half to get wrong: the tool offers an undo button for it.
 *
 * The `canonical` case a few lines above carries a comment saying this
 * exact thing happened to canonical and robots, and was "added late, and
 * only because the plugin was finally run". It happened again for the
 * same reason — a new field added to the writer without its mirror.
 */

import fs from "node:fs";

const FILE = "wordpress-plugin/seo-tool-bridge.php";
const raw = fs.readFileSync(FILE, "utf8");
const crlf = raw.includes("\r\n");
let s = raw.split("\r\n").join("\n");

const ANCHOR = `        case 'alt':`;
if (s.split(ANCHOR).length - 1 !== 1) {
  console.log("SKIP: alt case not found exactly once");
  process.exit(1);
}

const BRANCHES = `        case 'og_title':
        case 'og_description':
        case 'og_image':
        case 'twitter_title':
        case 'twitter_description':
        case 'twitter_image':
            // One case per field rather than a fallthrough with a lookup,
            // so this switch stays greppable — the same reason the write
            // side is written out branch by branch.
            //
            // stb_set_social_meta deletes the keys for an empty value, so
            // undoing "a tag was added to a page that had none" removes
            // it rather than storing a blank override. Those are
            // different states to an SEO plugin, and only one of them is
            // what the page looked like before.
            stb_set_social_meta($object_id, $field, (string)$previous);
            break;
`;

s = s.replace(ANCHOR, BRANCHES + ANCHOR);

s = s.replace(" * Version: 0.6.0", " * Version: 0.6.1");

if (crlf) s = s.split("\n").join("\r\n");
fs.writeFileSync(FILE, s, "utf8");
console.log("added six undo branches, bumped to 0.6.1");
