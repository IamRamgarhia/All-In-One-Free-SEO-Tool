CREATE TABLE `tool_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`note` text,
	`data` text NOT NULL,
	`primary_metric` integer,
	`primary_metric_label` text,
	`captured_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
