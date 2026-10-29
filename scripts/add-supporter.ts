/**
 * Record a support payment in supporters.json.
 *
 * That file is read live from GitHub by every install, so committing a
 * change here updates the Support & about page and the dashboard card
 * everywhere with no release. The point of a script rather than editing
 * the JSON by hand is that four fields have to agree — totalReceived,
 * supporters, thanks and people — and keeping them in step by hand is
 * exactly the kind of job that produces a page claiming five supporters
 * above a list of four names.
 *
 *   pnpm exec tsx scripts/add-supporter.ts "Asha Traders" 501
 *   pnpm exec tsx scripts/add-supporter.ts "Ravi K" 251 --anonymous
 *   pnpm exec tsx scripts/add-supporter.ts --undo "Asha Traders" 501
 *   pnpm exec tsx scripts/add-supporter.ts --undo --remove-name "Asha Traders" 501
 *   pnpm exec tsx scripts/add-supporter.ts --dry-run "Asha Traders" 501
 *
 * The same name twice is the same supporter: the total rises, the count
 * does not, and their row shows the combined amount.
 *
 * Only list a name the supporter is happy to see on a public page. Without
 * permission use --anonymous: the money and the count are recorded, the
 * name is not written anywhere.
 *
 * Nothing is written unless the result parses back through the app's own
 * parseSupporters — a file this script cannot read is a file the page
 * would silently drop.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { localDay, parseSupporters, type Supporter } from "../src/lib/supporters";

const FILE = join(process.cwd(), "supporters.json");

const USAGE = `Usage:
  pnpm exec tsx scripts/add-supporter.ts "Name" <amount in rupees> [--anonymous]
  pnpm exec tsx scripts/add-supporter.ts --undo [--remove-name] "Name" <amount>
  pnpm exec tsx scripts/add-supporter.ts --dry-run "Name" <amount>`;

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const positional = argv.filter((a) => !a.startsWith("--"));

const undo = flags.has("--undo");
const anonymous = flags.has("--anonymous");
const removeName = flags.has("--remove-name");
const dryRun = flags.has("--dry-run");

const unknown = [...flags].filter(
  (f) => !["--undo", "--anonymous", "--remove-name", "--dry-run"].includes(f),
);
if (unknown.length) die(`Unknown option ${unknown.join(", ")}\n\n${USAGE}`);
if (removeName && !undo) die("--remove-name only makes sense with --undo.");
if (anonymous && undo) die("--anonymous records a payment; it cannot be combined with --undo.");

const name = (positional[0] ?? "").replace(/\s+/g, " ").trim();
// Accept "₹1,001" and "1001" alike — the figure gets copied out of a UPI
// app or a bank SMS, and both of those punctuate it.
const amount = Number((positional[1] ?? "").replace(/[₹,\s]/g, ""));

if (!name || !Number.isFinite(amount) || amount <= 0) die(USAGE);
if (name.length > 60) die("Keep the name to 60 characters — the page cuts it there.");

const rawText = readFileSync(FILE, "utf8");
const raw = JSON.parse(rawText) as Record<string, unknown>;

const thanks: string[] = Array.isArray(raw.thanks)
  ? raw.thanks.filter((n): n is string => typeof n === "string")
  : [];
const people: Supporter[] = Array.isArray(raw.people)
  ? (raw.people as unknown[]).filter(
      (p): p is Supporter =>
        Boolean(p) && typeof p === "object" && typeof (p as Supporter).name === "string",
    )
  : [];

const today = localDay();
const existing = people.find((p) => p.name === name);
const listed = !anonymous;

// An anonymous payment counts a person we cannot recognise again, so a
// repeat from the same anonymous supporter counts twice. That is the
// honest direction to be wrong in: it never claims a name we were not
// given, and the total — the figure the page leads with — stays exact.
const wasAnonymous = undo && !thanks.includes(name) && !existing;

let nextPeople = people;
let nextThanks = thanks;
let countDelta = 0;

if (!undo) {
  countDelta = anonymous || !thanks.includes(name) ? 1 : 0;
  if (listed) {
    const merged: Supporter = {
      name,
      amount: Math.round((existing?.amount ?? 0) + amount),
      date: today,
    };
    nextPeople = [...people.filter((p) => p !== existing), merged];
    if (!thanks.includes(name)) nextThanks = [...thanks, name];
  }
} else {
  const left = existing ? Math.round(existing.amount - amount) : 0;
  // Gone from the list means gone from the count. Three ways to get
  // there, and the third is the one that was wrong: undoing an
  // anonymous payment used to take the money back and leave the person
  // counted forever, because there was no name to remove. The page
  // would then have read "2 supporters" above one name.
  const dropsAPerson = removeName || (existing !== undefined && left <= 0) || wasAnonymous;
  if (dropsAPerson) countDelta = -1;

  if (existing) {
    nextPeople =
      removeName || left <= 0
        ? people.filter((p) => p !== existing)
        : people.map((p) => (p === existing ? { ...p, amount: left } : p));
  }
  if (removeName || (existing !== undefined && left <= 0)) {
    nextThanks = thanks.filter((n) => n !== name);
  }
}

const nextTotal = Math.round(Number(raw.totalReceived ?? 0) + (undo ? -amount : amount));
if (nextTotal < 0) die(`That would take the total to ${nextTotal}. Nothing written.`);

const nextSupporters = Math.max(0, Number(raw.supporters ?? 0) + countDelta);

// Every listed person is a supporter, so the count can never be below
// the number of names. If it is, the four fields have drifted and the
// right move is to stop rather than publish a page that contradicts
// itself.
if (nextSupporters < nextPeople.length) {
  die(
    `That would leave ${nextSupporters} supporters above ${nextPeople.length} listed names. ` +
      `supporters.json looks out of step — fix it by hand. Nothing written.`,
  );
}

const next = {
  ...raw,
  totalReceived: nextTotal,
  supporters: nextSupporters,
  thanks: nextThanks,
  people: nextPeople,
  updated: today,
};

// The app's own reader is the acceptance test. If it cannot parse this,
// the page shows nothing and the figures are lost — better to refuse now,
// with the old file still on disk.
const parsed = parseSupporters(next);
if (!parsed) die("The result would not parse as a tracker. Nothing written.");

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
console.log(
  `${undo ? "Removed" : "Recorded"} ${rupees(amount)} ${undo ? "from" : "for"} ${anonymous ? `${name} (anonymous — not listed)` : name}`,
);
console.log(
  `  total ${rupees(parsed.totalReceived)}  ·  ${parsed.supporters} supporter${parsed.supporters === 1 ? "" : "s"}  ·  ${parsed.people.length} listed`,
);

if (dryRun) {
  console.log("\n--dry-run: nothing written.");
  process.exit(0);
}

writeFileSync(FILE, `${JSON.stringify(next, null, 2)}\n`, "utf8");
console.log(`\nWrote ${FILE}`);
console.log("Commit and push it — every install picks the new figures up.");
