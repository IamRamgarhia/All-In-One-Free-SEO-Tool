CREATE TABLE `backlinks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`source_url` text NOT NULL,
	`source_domain` text NOT NULL,
	`target_url` text,
	`anchor_text` text,
	`domain_authority` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`notes` text,
	`first_seen` integer DEFAULT (unixepoch()) NOT NULL,
	`last_seen` integer DEFAULT (unixepoch()) NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
