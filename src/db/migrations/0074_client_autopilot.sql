ALTER TABLE `clients` ADD `autopilot_level` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `autopilot_engine` text DEFAULT 'auto' NOT NULL;