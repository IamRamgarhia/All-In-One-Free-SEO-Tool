CREATE TABLE `title_tests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`page_url` text NOT NULL,
	`wp_post_id` integer,
	`variants` text NOT NULL,
	`current_variant_idx` integer DEFAULT 0 NOT NULL,
	`variant_duration_days` integer DEFAULT 14 NOT NULL,
	`measurements` text,
	`status` text DEFAULT 'running' NOT NULL,
	`winner_variant_idx` integer,
	`last_rotated_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
