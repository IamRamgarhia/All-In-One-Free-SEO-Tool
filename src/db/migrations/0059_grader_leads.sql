-- Leads from the embeddable site grader.
--
-- CLAUDE.md lists a free public site grader as the primary acquisition
-- channel — the pattern Ahrefs and Semrush both use. The grader existed
-- but only inside the app, behind the login, where the only person who
-- could ever use it was the agency itself. As a marketing channel that
-- is worth nothing.
--
-- The version that matters is one an agency embeds on THEIR site: a
-- prospect pastes a URL, sees a real score, leaves an email to get the
-- detail, and the agency wakes up to a qualified lead who has already
-- admitted their site has problems.
--
-- Deliberately stores the score and findings count alongside the email.
-- A lead saying "someone wants an audit" is a to-do; a lead saying
-- "someone with a 34/100 site and 9 critical issues wants an audit" is
-- a sales conversation with an opening line.

CREATE TABLE IF NOT EXISTS grader_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- The site they graded. Always present — the grade happens first and
  -- the email is optional, so a lead row can exist without one.
  url TEXT NOT NULL,
  email TEXT,
  name TEXT,
  score INTEGER,
  critical_count INTEGER NOT NULL DEFAULT 0,
  high_count INTEGER NOT NULL DEFAULT 0,
  -- The findings as graded, so the agency can open the lead months later
  -- and see what was actually wrong without re-crawling a site that has
  -- since changed.
  findings_json TEXT,
  -- new | contacted | won | lost | spam
  status TEXT NOT NULL DEFAULT 'new',
  notes TEXT,
  -- Where the widget was embedded, from the Referer. Lets an agency see
  -- which landing page actually converts.
  source_page TEXT,
  -- Truncated to a /24 (or /48 for v6) before storage. Enough to spot
  -- one actor spamming the form; not a precise record of who visited an
  -- agency's marketing page. A self-hosted, privacy-first tool should
  -- not accumulate full visitor IPs as a side effect of a lead form.
  ip_prefix TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  contacted_at INTEGER
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS grader_leads_created ON grader_leads (created_at DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS grader_leads_status ON grader_leads (status, created_at DESC);
--> statement-breakpoint

-- One row per graded URL per day, so the same prospect refreshing the
-- page doesn't create five leads and make the inbox useless.
CREATE INDEX IF NOT EXISTS grader_leads_url ON grader_leads (url, created_at DESC);
