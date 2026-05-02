CREATE TABLE `content_briefs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`target_keyword` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'idea' NOT NULL,
	`target_word_count` integer,
	`outline` text,
	`paa_questions` text,
	`competitor_titles` text,
	`notes` text,
	`published_url` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
