CREATE TABLE `invoices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`invoice_number` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`issue_date` integer DEFAULT (unixepoch()) NOT NULL,
	`due_date` integer,
	`paid_at` integer,
	`items` text NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`tax_rate` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `resource_submissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`resource_id` integer NOT NULL,
	`client_id` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`submitted_url` text,
	`notes` text,
	`submitted_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`resource_id`) REFERENCES `seo_resources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `seo_resources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category` text NOT NULL,
	`url` text NOT NULL,
	`domain` text NOT NULL,
	`da` integer,
	`alexa` integer,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
