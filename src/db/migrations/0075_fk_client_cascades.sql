-- Hand-added above the generated rebuild: retire the rows that already
-- point at a parent which no longer exists.
--
-- These six columns had no foreign key, so nothing ever stopped a row
-- outliving its client (or keyword) and nothing cleaned it up on delete.
-- Seven such rows were found on the install this was written against.
-- Adding the constraint does not fix them: the migration re-checks every
-- copied row at the end, so a single survivor rolls the whole thing back
-- and, because predev/prebuild run the migrator, the app then will not
-- start.
--
-- Each statement does retroactively what the new constraint would have
-- done at delete time. ai_calls is the spend ledger, so its rows are
-- kept and merely detached; the rest are per-client records that cascade
-- would have removed, and nulling them instead would be wrong — a
-- redirect_rules row with no client_id is a global rule, not an orphan.
UPDATE `ai_calls` SET `client_id` = NULL WHERE `client_id` IS NOT NULL AND `client_id` NOT IN (SELECT `id` FROM `clients`);--> statement-breakpoint
DELETE FROM `robots_snapshots` WHERE `client_id` IS NOT NULL AND `client_id` NOT IN (SELECT `id` FROM `clients`);--> statement-breakpoint
DELETE FROM `uptime_targets` WHERE `client_id` IS NOT NULL AND `client_id` NOT IN (SELECT `id` FROM `clients`);--> statement-breakpoint
DELETE FROM `redirect_rules` WHERE `client_id` IS NOT NULL AND `client_id` NOT IN (SELECT `id` FROM `clients`);--> statement-breakpoint
DELETE FROM `not_found_log` WHERE `client_id` IS NOT NULL AND `client_id` NOT IN (SELECT `id` FROM `clients`);--> statement-breakpoint
DELETE FROM `serp_feature_snapshots` WHERE `keyword_id` IS NOT NULL AND `keyword_id` NOT IN (SELECT `id` FROM `keywords`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_ai_calls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`feature` text NOT NULL,
	`provider` text NOT NULL,
	`model` text,
	`prompt_tokens` integer DEFAULT 0 NOT NULL,
	`completion_tokens` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`cost_micros` integer DEFAULT 0 NOT NULL,
	`latency_ms` integer,
	`client_id` integer,
	`status` text DEFAULT 'ok' NOT NULL,
	`error_msg` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_ai_calls`("id", "feature", "provider", "model", "prompt_tokens", "completion_tokens", "total_tokens", "cost_micros", "latency_ms", "client_id", "status", "error_msg", "created_at") SELECT "id", "feature", "provider", "model", "prompt_tokens", "completion_tokens", "total_tokens", "cost_micros", "latency_ms", "client_id", "status", "error_msg", "created_at" FROM `ai_calls`;--> statement-breakpoint
DROP TABLE `ai_calls`;--> statement-breakpoint
ALTER TABLE `__new_ai_calls` RENAME TO `ai_calls`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_not_found_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer,
	`source_path` text NOT NULL,
	`hits` integer DEFAULT 1 NOT NULL,
	`first_seen` integer DEFAULT (unixepoch()) NOT NULL,
	`last_seen` integer DEFAULT (unixepoch()) NOT NULL,
	`resolved` integer DEFAULT false NOT NULL,
	`resolved_to_url` text,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_not_found_log`("id", "client_id", "source_path", "hits", "first_seen", "last_seen", "resolved", "resolved_to_url") SELECT "id", "client_id", "source_path", "hits", "first_seen", "last_seen", "resolved", "resolved_to_url" FROM `not_found_log`;--> statement-breakpoint
DROP TABLE `not_found_log`;--> statement-breakpoint
ALTER TABLE `__new_not_found_log` RENAME TO `not_found_log`;--> statement-breakpoint
CREATE TABLE `__new_redirect_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer,
	`source_path` text NOT NULL,
	`target_url` text NOT NULL,
	`status_code` integer DEFAULT 301 NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_redirect_rules`("id", "client_id", "source_path", "target_url", "status_code", "note", "created_at", "updated_at") SELECT "id", "client_id", "source_path", "target_url", "status_code", "note", "created_at", "updated_at" FROM `redirect_rules`;--> statement-breakpoint
DROP TABLE `redirect_rules`;--> statement-breakpoint
ALTER TABLE `__new_redirect_rules` RENAME TO `redirect_rules`;--> statement-breakpoint
CREATE TABLE `__new_robots_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer,
	`hostname` text NOT NULL,
	`content` text NOT NULL,
	`content_hash` text NOT NULL,
	`status` integer,
	`fetched_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_robots_snapshots`("id", "client_id", "hostname", "content", "content_hash", "status", "fetched_at") SELECT "id", "client_id", "hostname", "content", "content_hash", "status", "fetched_at" FROM `robots_snapshots`;--> statement-breakpoint
DROP TABLE `robots_snapshots`;--> statement-breakpoint
ALTER TABLE `__new_robots_snapshots` RENAME TO `robots_snapshots`;--> statement-breakpoint
CREATE TABLE `__new_serp_feature_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`keyword_id` integer,
	`query` text NOT NULL,
	`country` text DEFAULT 'US' NOT NULL,
	`our_domain` text,
	`our_position` integer,
	`our_url` text,
	`has_aio` integer DEFAULT false NOT NULL,
	`aio_sources` text,
	`aio_includes_us` integer DEFAULT false NOT NULL,
	`has_featured_snippet` integer DEFAULT false NOT NULL,
	`featured_url` text,
	`featured_owned_by_us` integer DEFAULT false NOT NULL,
	`paa_questions` text,
	`top_results` text,
	`captured_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`keyword_id`) REFERENCES `keywords`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_serp_feature_snapshots`("id", "keyword_id", "query", "country", "our_domain", "our_position", "our_url", "has_aio", "aio_sources", "aio_includes_us", "has_featured_snippet", "featured_url", "featured_owned_by_us", "paa_questions", "top_results", "captured_at") SELECT "id", "keyword_id", "query", "country", "our_domain", "our_position", "our_url", "has_aio", "aio_sources", "aio_includes_us", "has_featured_snippet", "featured_url", "featured_owned_by_us", "paa_questions", "top_results", "captured_at" FROM `serp_feature_snapshots`;--> statement-breakpoint
DROP TABLE `serp_feature_snapshots`;--> statement-breakpoint
ALTER TABLE `__new_serp_feature_snapshots` RENAME TO `serp_feature_snapshots`;--> statement-breakpoint
CREATE TABLE `__new_uptime_targets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer,
	`url` text NOT NULL,
	`label` text,
	`enabled` integer DEFAULT true NOT NULL,
	`expected_status` integer DEFAULT 200 NOT NULL,
	`expected_text` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_uptime_targets`("id", "client_id", "url", "label", "enabled", "expected_status", "expected_text", "created_at") SELECT "id", "client_id", "url", "label", "enabled", "expected_status", "expected_text", "created_at" FROM `uptime_targets`;--> statement-breakpoint
DROP TABLE `uptime_targets`;--> statement-breakpoint
ALTER TABLE `__new_uptime_targets` RENAME TO `uptime_targets`;--> statement-breakpoint
-- Hand-added below the generated rebuild: put the indexes back.
--
-- DROP TABLE takes a table's indexes with it, and drizzle-kit cannot
-- re-create these because they exist only in hand-written migration SQL,
-- never in schema.ts — so it does not know they are there. Nothing would
-- have failed; the pages reading these tables would just have gone
-- quietly back to full scans. migration-indexes.test.ts caught all seven
-- and is the reason this block exists.
CREATE INDEX `ai_calls_created_at_idx` ON `ai_calls` (`created_at`);--> statement-breakpoint
CREATE INDEX `ai_calls_feature_idx` ON `ai_calls` (`feature`);--> statement-breakpoint
CREATE INDEX `serp_feature_snapshots_keyword_idx` ON `serp_feature_snapshots` (`keyword_id`);--> statement-breakpoint
CREATE INDEX `serp_feature_snapshots_captured_at_idx` ON `serp_feature_snapshots` (`captured_at`);--> statement-breakpoint
CREATE INDEX `robots_snapshots_hostname_idx` ON `robots_snapshots` (`hostname`);--> statement-breakpoint
CREATE INDEX `robots_snapshots_fetched_at_idx` ON `robots_snapshots` (`fetched_at`);--> statement-breakpoint
CREATE INDEX `not_found_log_client_idx` ON `not_found_log` (`client_id`);