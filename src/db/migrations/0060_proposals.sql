-- Proposals — turning an audit into work someone pays for.
--
-- The gap this closes is the one between "the tool found 47 problems"
-- and "the client signed". A freelancer's actual bottleneck is not
-- finding issues; it is writing the document that turns findings into a
-- scope, a price and a signature. That is an evening's work per pitch,
-- done from a template that drifts, and it happens BEFORE any of the
-- tooling in this app becomes useful to them.
--
-- The scope lines are derived from real audit findings, not invented.
-- That distinction is the whole design: a proposal generator that writes
-- "we will increase your organic traffic by 300%" is a lie generator
-- with a PDF export. Nothing in here forecasts traffic, rankings or
-- revenue, because none of those can be honestly predicted from a crawl
-- — and a proposal is exactly where an unfounded number does the most
-- damage, since the client keeps it.
--
-- Pricing is entered by the user. The tool has no basis for pricing
-- someone else's labour and does not pretend otherwise.

CREATE TABLE IF NOT EXISTS proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- One of these is set. A proposal is written either for an existing
  -- client (upsell, re-scope) or for a lead from the grader widget.
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  lead_id INTEGER REFERENCES grader_leads(id) ON DELETE SET NULL,

  -- Who it's for, captured at write time. Denormalised on purpose: a
  -- proposal is a document sent on a date, and it should still say what
  -- it said if the client is later renamed or deleted.
  prospect_name TEXT NOT NULL,
  prospect_url TEXT,
  prospect_email TEXT,

  title TEXT NOT NULL,
  -- Free text above the scope. The part the freelancer actually writes.
  intro TEXT,
  -- Derived scope lines: [{ label, detail, findings: n }]
  scope_json TEXT,
  -- [{ label, detail, amount }] — amounts are whatever the user typed.
  pricing_json TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  -- Free text below pricing: terms, timeline, what's not included.
  terms TEXT,

  -- The audit this was built from, so the document can say what it was
  -- based on and when — a proposal citing a crawl from four months ago
  -- is worse than one citing none.
  audit_id INTEGER REFERENCES audits(id) ON DELETE SET NULL,
  based_on_score INTEGER,
  based_on_at INTEGER,

  status TEXT NOT NULL DEFAULT 'draft',
  sent_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS proposals_created ON proposals (created_at DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS proposals_client ON proposals (client_id, created_at DESC);
