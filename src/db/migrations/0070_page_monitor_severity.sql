ALTER TABLE `monitored_pages` ADD `last_status` integer;--> statement-breakpoint
ALTER TABLE `monitored_pages` ADD `last_robots` text;--> statement-breakpoint
ALTER TABLE `monitored_pages` ADD `last_schema_types` text;--> statement-breakpoint
ALTER TABLE `monitored_pages` ADD `last_schema_hash` text;--> statement-breakpoint
ALTER TABLE `page_changes` ADD `severity` text;