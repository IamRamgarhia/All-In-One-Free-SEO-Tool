-- Generating every client's monthly report in one go, then reviewing
-- them before they go out.
--
-- The reason the whole product exists, per CLAUDE.md, is that agencies
-- managing 20 clients spend 120-160 hours a month on manual reporting —
-- close to a full-time employee — and the goal is 6 hours down to 25
-- minutes. That claim was not yet true at agency scale: reports were
-- generated one client at a time, from that client's own page, by a
-- human clicking a button eighteen times.
--
-- Two things were missing, and only one of them is "do it in a loop".
--
-- The second is a review step. A report that is generated and sent
-- automatically is a report nobody read, and the first time an AI
-- executive summary says something wrong about a client's business, it
-- says it to the client. So a batch produces DRAFTS. Nothing leaves the
-- building until a person has looked at it and said yes.

CREATE TABLE IF NOT EXISTS report_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- What period every report in the batch covers. Stored on the batch
  -- rather than per-report so "March for everyone" can't drift into
  -- some clients getting February.
  period_start INTEGER,
  period_end INTEGER,
  template TEXT NOT NULL DEFAULT 'detailed',
  status TEXT NOT NULL DEFAULT 'running',
  total INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  -- Which client is being worked on right now, so the progress bar can
  -- say "generating Acme Coffee (7 of 18)" rather than a bare percentage
  -- during a run that takes minutes.
  current_client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  error TEXT
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS report_batches_started ON report_batches (started_at DESC);
--> statement-breakpoint

-- draft    — generated, nobody has looked at it
-- approved — a person read it and said yes
-- sent     — delivered to the client
-- failed   — generation errored; the row exists so the batch can show it
-- rejected — a person read it and said no
--
-- Existing rows default to 'approved': every archived report predates
-- this workflow and was generated deliberately by a human clicking a
-- button, so treating them as unreviewed drafts would be wrong and would
-- fill the review queue with history on first boot.
ALTER TABLE report_archives ADD COLUMN status TEXT NOT NULL DEFAULT 'approved';
--> statement-breakpoint

ALTER TABLE report_archives ADD COLUMN batch_id INTEGER REFERENCES report_batches(id) ON DELETE SET NULL;
--> statement-breakpoint

ALTER TABLE report_archives ADD COLUMN reviewed_at INTEGER;
--> statement-breakpoint

ALTER TABLE report_archives ADD COLUMN sent_at INTEGER;
--> statement-breakpoint

-- Why a report failed to generate, kept next to the client it failed
-- for. Without this a batch of 18 that produced 17 reports would leave
-- the user to work out which client is missing and why.
ALTER TABLE report_archives ADD COLUMN error TEXT;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS report_archives_status ON report_archives (status, created_at DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS report_archives_batch ON report_archives (batch_id);
