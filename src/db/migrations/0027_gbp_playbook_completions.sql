CREATE TABLE `gbp_playbook_completions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`item_id` text NOT NULL,
	`completed_at` integer DEFAULT (unixepoch()) NOT NULL,
	`occurrence` text,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gbp_completions_client_idx` ON `gbp_playbook_completions` (`client_id`, `item_id`);
