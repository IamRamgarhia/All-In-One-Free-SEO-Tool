CREATE TABLE `competitor_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer,
	`competitor_url` text NOT NULL,
	`page_count` integer DEFAULT 0 NOT NULL,
	`silos` text,
	`schema_types` text,
	`backlink_domains` text,
	`captured_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `competitor_snapshots_idx` ON `competitor_snapshots` (`competitor_url`, `captured_at`);
--> statement-breakpoint
ALTER TABLE `client_metric_snapshots` ADD `ga4_conversions` integer;--> statement-breakpoint
ALTER TABLE `client_metric_snapshots` ADD `ga4_revenue_x100` integer;
