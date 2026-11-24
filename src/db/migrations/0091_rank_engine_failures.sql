-- Rank checks: which engine really answered, how many results were read,
-- and the checks that produced no answer.
--
-- Before this, a DuckDuckGo reading (its first page, about ten results)
-- was stored as source "scrape" like a Google one, and a null position
-- read as "not ranking" whatever the engine and however few results it
-- covered. Failures left no trace at all. Additive only: old rows keep
-- engine and results_scanned at NULL, which the interface shows as
-- "engine not recorded".
ALTER TABLE `keyword_rankings` ADD `engine` text;
--> statement-breakpoint
ALTER TABLE `keyword_rankings` ADD `results_scanned` integer;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `keyword_rank_failures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`keyword_id` integer NOT NULL REFERENCES `keywords`(`id`) ON DELETE cascade,
	`device` text DEFAULT 'desktop' NOT NULL,
	`failures` text NOT NULL,
	`checked_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `keyword_rank_failures_keyword_idx` ON `keyword_rank_failures` (`keyword_id`, `checked_at`);
