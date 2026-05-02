CREATE TABLE `news_feeds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT 'custom' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_fetched_at` integer,
	`last_error` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `news_feeds_url_unique` ON `news_feeds` (`url`);--> statement-breakpoint
CREATE TABLE `news_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`feed_id` integer NOT NULL,
	`guid` text NOT NULL,
	`title` text NOT NULL,
	`link` text NOT NULL,
	`summary` text,
	`author` text,
	`published_at` integer,
	`captured_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`feed_id`) REFERENCES `news_feeds`(`id`) ON UPDATE no action ON DELETE cascade
);
