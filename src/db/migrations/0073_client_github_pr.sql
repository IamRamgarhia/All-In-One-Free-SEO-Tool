ALTER TABLE `clients` ADD `github_repo` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `base_branch` text DEFAULT 'main' NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `pr_mode` text DEFAULT 'off' NOT NULL;