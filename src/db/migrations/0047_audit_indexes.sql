-- Audit-driven schema hardening:
--   1. Composite index on activity_log dedup query
--      (kind, message, created_at) — speeds up logActivity dedupe SELECT
--      which fires on every sidebar render via getUpdateAvailable().
--   2. Composite index on audits hot path
--      (status, created_at desc) — used by dashboard + audit list views.
--
-- We can't safely ALTER tool_runs to add ON DELETE CASCADE in SQLite
-- without recreating the table (SQLite doesn't support ALTER CONSTRAINT).
-- Skipping that migration — the application-level delete cascade in
-- the clients.deleteClient action already handles tool_runs cleanup.

CREATE INDEX IF NOT EXISTS activity_log_dedupe_idx
  ON activity_log (kind, message, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS audits_status_created_idx
  ON audits (status, created_at DESC);
