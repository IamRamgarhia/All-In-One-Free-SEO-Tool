CREATE TABLE `monitored_pages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`url` text NOT NULL,
	`label` text,
	`status` text DEFAULT 'active' NOT NULL,
	`last_title` text,
	`last_description` text,
	`last_h1` text,
	`last_canonical` text,
	`last_content_hash` text,
	`last_checked_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `page_changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`monitored_page_id` integer NOT NULL,
	`field` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`detected_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`monitored_page_id`) REFERENCES `monitored_pages`(`id`) ON UPDATE no action ON DELETE cascade
);
