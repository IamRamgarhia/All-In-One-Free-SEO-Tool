CREATE TABLE `serp_scans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`keyword_id` integer NOT NULL,
	`ok` integer DEFAULT true NOT NULL,
	`error` text,
	`ai_overview_present` integer DEFAULT false NOT NULL,
	`ai_overview_text` text,
	`ai_overview_sources` text,
	`paa_questions` text,
	`related_searches` text,
	`top_results` text,
	`featured_snippet` text,
	`local_pack_present` integer DEFAULT false NOT NULL,
	`total_results` integer,
	`scanned_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`keyword_id`) REFERENCES `keywords`(`id`) ON UPDATE no action ON DELETE cascade
);
