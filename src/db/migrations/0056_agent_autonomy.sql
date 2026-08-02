-- Turning the agent from something that suggests into something that acts.
--
-- The pieces were already here and simply never connected: seo-agent.ts
-- generates suggestions, wp-bridge.ts can write titles, meta descriptions,
-- alt text and schema to a live WordPress site, and daily-agent.ts runs
-- every 24 hours. Nothing joined them. Suggestions accumulated in
-- ai_suggestions forever, and `status = 'applied'` meant a human ticked a
-- box — not that anything on the site had changed.
--
-- Two tables, because an agent that changes a client's live website has
-- to be able to answer three questions afterwards, and neither the
-- suggestions table nor the activity log can answer them:
--
--   what did you do, and why?          -> agent_actions.reason
--   what did it look like before?      -> agent_actions.before_value
--   did it actually work?              -> agent_actions.verified_at / verify_note
--
-- Without the second one there is no undo, and CLAUDE.md's rule for
-- anything touching a CMS is preview -> save previous version ->
-- one-click undo -> opt-out. Without the third, "applied" is a claim
-- rather than a fact, which is the exact failure this codebase keeps
-- producing: a confident number that nobody checked.

CREATE TABLE IF NOT EXISTS agent_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  -- suggest | apply_safe | apply_all — the autonomy level in force for
  -- THIS run, recorded rather than looked up later, because the setting
  -- can change and the history must still explain itself.
  mode TEXT NOT NULL DEFAULT 'suggest',
  -- scheduled | manual — did a human ask for this, or did it wake up?
  trigger TEXT NOT NULL DEFAULT 'scheduled',
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  planned INTEGER NOT NULL DEFAULT 0,
  applied INTEGER NOT NULL DEFAULT 0,
  queued INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  -- Plain-language account of the cycle, for the "what did it do while I
  -- was asleep" panel. Written by the agent, not an LLM.
  summary TEXT,
  error TEXT
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS agent_runs_client_started
  ON agent_runs (client_id, started_at DESC);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS agent_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER REFERENCES agent_runs(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  -- What kind of change. Matches the capability names in
  -- src/lib/agent/capabilities.ts.
  kind TEXT NOT NULL,
  target_url TEXT,
  -- External identifier the change was made against (a WP post id), so a
  -- revert doesn't have to re-resolve the URL and risk hitting a
  -- different page than the one it edited.
  target_ref TEXT,
  -- The exact previous value. This IS the undo. Nullable only for
  -- actions that create rather than replace.
  before_value TEXT,
  after_value TEXT,
  -- Why the agent thought this was worth doing, in plain language.
  reason TEXT,
  -- How confident, and therefore whether apply_safe will touch it:
  -- safe | needs_review. A title that is 102 characters is measurably
  -- too long; whether a rewrite reads better is a judgement call.
  risk TEXT NOT NULL DEFAULT 'needs_review',
  -- proposed  — planned but autonomy level didn't allow acting
  -- queued    — waiting for a human to approve
  -- applied   — written to the live site
  -- verified  — written AND confirmed present on a re-fetch
  -- failed    — the write errored
  -- reverted  — undone
  -- skipped   — a guardrail refused it (cap, cooldown, duplicate)
  status TEXT NOT NULL DEFAULT 'proposed',
  error TEXT,
  applied_at INTEGER,
  verified_at INTEGER,
  verify_note TEXT,
  reverted_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS agent_actions_client_created
  ON agent_actions (client_id, created_at DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS agent_actions_status
  ON agent_actions (status);
--> statement-breakpoint

-- Don't edit the same thing twice in a week just because it still looks
-- improvable. Without this the agent would rewrite a title, decide the
-- new one could also be better, rewrite it again, and thrash a live page
-- indefinitely — each edit individually defensible.
CREATE INDEX IF NOT EXISTS agent_actions_cooldown
  ON agent_actions (client_id, kind, target_url, created_at DESC);
