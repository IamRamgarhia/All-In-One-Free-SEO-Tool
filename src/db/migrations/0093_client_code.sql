-- The site's source code per client, for fixing it with a coding
-- assistant: the local folder, the GitHub repo and base branch, how work
-- comes back (files only, one pull request per task, one per run), and
-- the per-client switch for Claude Code on the host, off by default.
ALTER TABLE `clients` ADD `local_path` text;
--> statement-breakpoint
ALTER TABLE `clients` ADD `github_repo` text;
--> statement-breakpoint
ALTER TABLE `clients` ADD `base_branch` text DEFAULT 'main' NOT NULL;
--> statement-breakpoint
ALTER TABLE `clients` ADD `pr_mode` text DEFAULT 'off' NOT NULL;
--> statement-breakpoint
ALTER TABLE `clients` ADD `code_agent_enabled` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- One Claude Code conversation per task, and what it showed.
CREATE TABLE `task_chats` (
	`task_id` integer PRIMARY KEY NOT NULL,
	`session_id` text,
	`status` text DEFAULT 'idle' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `task_chat_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`kind` text NOT NULL,
	`data` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_chat_events_task_idx` ON `task_chat_events` (`task_id`,`id`);
