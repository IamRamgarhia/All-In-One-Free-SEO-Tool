ALTER TABLE `clients` ADD `share_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `clients_share_token_unique` ON `clients` (`share_token`);