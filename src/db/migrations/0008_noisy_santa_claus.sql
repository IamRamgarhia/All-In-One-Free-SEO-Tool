CREATE TABLE `activity_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`client_id` integer,
	`entity_type` text,
	`entity_id` integer,
	`level` text DEFAULT 'info' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `outreach_contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`website` text,
	`status` text DEFAULT 'prospect' NOT NULL,
	`notes` text,
	`last_contacted_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `serp_screenshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`keyword_id` integer NOT NULL,
	`position` integer,
	`file_path` text NOT NULL,
	`captured_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`keyword_id`) REFERENCES `keywords`(`id`) ON UPDATE no action ON DELETE cascade
);
