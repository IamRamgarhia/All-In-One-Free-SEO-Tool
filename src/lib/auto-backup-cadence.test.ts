/**
 * A backup whose bookkeeping failed must back off, not spin.
 *
 * MEASURED on a fresh Windows install, 19 Nov 2026: seven backups of a
 * 4 KB empty database in three minutes, one per scheduler tick, and
 * still going while the app stayed open.
 *
 * The cause is a loop with a missing link. `tickAutoBackup` decides
 * whether it is due by reading `autobackup.last_run_at` — a row in the
 * settings table, inside the very database being backed up. That
 * install's migrations had never run, so there was no settings table;
 * the write at the end of each run could not land; the next tick read
 * "never backed up" and ran again.
 *
 * Nothing errored. No log said anything. The work simply repeated,
 * because the record of having done it could not be kept.
 *
 * Running the migrations fixes that particular cause. This test is
 * about the behaviour: the cadence must not depend solely on a write
 * succeeding, whatever the reason it failed — a read-only disk, a
 * locked database, a full volume, a schema that is mid-migration.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(join(process.cwd(), "src/lib/auto-backup.ts"), "utf8");

describe("auto-backup cadence", () => {
  it("keeps an in-process record as well as a persisted one", () => {
    expect(SRC).toMatch(/let lastRunInProcess/);
    // The persisted one is still the real record — it survives
    // restarts, and dropping it would make every launch take a backup.
    expect(SRC).toContain("autobackup.last_run_at");
  });

  it("checks the in-process record before taking a backup", () => {
    const guard = SRC.indexOf("lastRunInProcess !== null");
    // The CALL, not the several comments that mention VACUUM INTO —
    // the first draft of this test compared against one of those and
    // failed for a reason that had nothing to do with the code.
    const vacuum = SRC.indexOf("sqlite.exec(");
    expect(guard, "no in-process guard before the backup").toBeGreaterThan(-1);
    expect(vacuum, "the backup call moved or was renamed").toBeGreaterThan(-1);
    expect(guard, "the guard runs after the backup, which is no guard").toBeLessThan(
      vacuum,
    );
  });

  it("records the run BEFORE the settings write that can fail", () => {
    // The ordering is the entire fix. Recording it after the persisted
    // write — or only on the success of that write — reproduces the
    // original behaviour exactly.
    const record = SRC.indexOf("lastRunInProcess = Date.now()");
    const persist = SRC.indexOf('setSetting("autobackup.last_run_at"');
    expect(record).toBeGreaterThan(-1);
    expect(persist).toBeGreaterThan(-1);
    expect(
      record,
      "the in-process record depends on the write it exists to survive",
    ).toBeLessThan(persist);
  });

  it("compares against the cadence rather than blocking forever", () => {
    // A guard that never expires would take one backup per process
    // lifetime — wrong in the other direction for an app left open for
    // days.
    expect(SRC).toMatch(/Date\.now\(\) - lastRunInProcess < cadenceMs/);
  });
});
