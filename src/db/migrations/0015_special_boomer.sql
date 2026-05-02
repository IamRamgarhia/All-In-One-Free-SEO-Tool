CREATE TABLE `ai_suggestions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`type` text NOT NULL,
	`target_url` text,
	`current_value` text,
	`suggested_value` text NOT NULL,
	`rationale` text,
	`source` text DEFAULT 'agent' NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
