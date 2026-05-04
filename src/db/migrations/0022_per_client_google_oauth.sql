ALTER TABLE `clients` ADD `google_refresh_token` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `google_access_token` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `google_access_token_expires_at` integer;--> statement-breakpoint
ALTER TABLE `clients` ADD `google_connected_email` text;
