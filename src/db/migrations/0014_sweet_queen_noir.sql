CREATE TABLE `report_schedules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`template` text DEFAULT 'detailed' NOT NULL,
	`frequency` text DEFAULT 'monthly' NOT NULL,
	`day_of_month` integer DEFAULT 1,
	`day_of_week` integer DEFAULT 1,
	`hour_of_day` integer DEFAULT 9 NOT NULL,
	`recipients` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_sent_at` integer,
	`next_send_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
