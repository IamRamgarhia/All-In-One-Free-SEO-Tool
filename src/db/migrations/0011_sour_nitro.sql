CREATE TABLE `ai_visibility_checks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`keyword_id` integer NOT NULL,
	`provider` text NOT NULL,
	`prompt` text NOT NULL,
	`response` text NOT NULL,
	`citations` text,
	`mentions_domain` integer DEFAULT false NOT NULL,
	`citations_for_domain` integer DEFAULT 0 NOT NULL,
	`error` text,
	`checked_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`keyword_id`) REFERENCES `keywords`(`id`) ON UPDATE no action ON DELETE cascade
);
