/**
 * Turn a backup filename into something a person can choose between.
 *
 * The restore dropdown listed raw filenames:
 *
 *   today 04:46 · 2.8 MB · data-before-0075-fk-2026-10-29.db
 *   10/29/2026 18:59 · 2.9 MB · data-before-acme-delete-185920.db
 *   9/24/2026 19:02 · 2.3 MB · data.db.bak-2026-09-24T13-32-23Z
 *
 * Which is three different date formats, a second copy of the date
 * inside most of the names, and no answer to the only question being
 * asked: what IS this one, and why would I pick it? This is the single
 * button on the panel that can lose data, so being unable to read the
 * list is not a cosmetic problem.
 *
 * Deliberately NOT guessed: `data.db.bak-<stamp>` is written both by
 * the app's nightly auto-backup and by this panel's own "Back up now" —
 * same name, same folder, no way to tell them apart after the fact. So
 * both are called a routine backup rather than one of them being
 * labelled "nightly" on a coin flip.
 */

/** Trailing `-2026-10-29`, or a bare `-185920` time stamp. */
const TRAILING_STAMP = /-(?:\d{4}-\d{2}-\d{2}(?:T[\d-]+Z?)?|\d{5,8})$/;

/** A migration number: four digits, as in 0075_fk_client_cascades.sql. */
const MIGRATION = /^(\d{4})(?:-(\d{4}))?\b/;

/**
 * @param bucket "data" (beside the database) or "backups" (the folder)
 * @param name   the filename as it is on disk
 * @returns {{kind: string, detail: string|null}}
 */
export function describeBackup(bucket, name) {
  const file = String(name ?? "");

  // The app's scheduler and this panel both write <db>.bak-<stamp> into
  // the data dir. Indistinguishable, so do not distinguish them.
  if (bucket === "data" || /\.bak-/.test(file)) {
    return { kind: "routine backup", detail: null };
  }

  const before = /^data-before-(.+)\.db$/i.exec(file);
  if (before) {
    return { kind: "safety copy", detail: humanise(before[1]) };
  }

  // Something in backups/ that nothing here wrote. Say so plainly
  // rather than inventing a provenance for it.
  return { kind: "copy of the database", detail: null };
}

/** `0075-fk-2026-10-29` -> "before database update 0075". */
function humanise(slug) {
  const trimmed = String(slug).replace(TRAILING_STAMP, "");
  if (!trimmed) return null;

  const mig = MIGRATION.exec(trimmed);
  if (mig) {
    return mig[2]
      ? `taken before database updates ${mig[1]}–${mig[2]}`
      : `taken before database update ${mig[1]}`;
  }
  return `taken before ${trimmed.replace(/[-_]+/g, " ").trim()}`;
}

/**
 * One line for a <select> option. Plain words first, numbers after,
 * filename not at all — it is shown under the dropdown for whichever
 * one is selected, where it is useful and not in the way.
 */
export function backupOptionLabel({ when, sizeMb, kind, detail }) {
  const parts = [when, detail ? `${kind}, ${detail}` : kind];
  if (sizeMb || sizeMb === 0) parts.push(`${sizeMb} MB`);
  return parts.join("  ·  ");
}

/**
 * "4 days ago" — the thing people actually weigh when choosing which
 * backup to go back to.
 *
 * @param iso    the backup's timestamp
 * @param nowMs  injected so this is testable
 */
export function relativeAge(iso, nowMs = Date.now()) {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const mins = Math.round((nowMs - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 9) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}
