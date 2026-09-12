-- What we know about a client's business, kept between runs.
--
-- Everything that needs to know what a business sells was working it out
-- again from scratch each time and getting a different answer. The niche
-- dropdown said "local", the site says manufacturer, and the title
-- drafter — seeing only a title tag reading "Home Page" — wrote
-- headlines for a mobile game that shares two words with the company.
--
-- Two halves, kept apart on purpose: the read_* columns are what the
-- site said and get replaced by the next read; the rest is what a person
-- or an agent concluded and a read must never overwrite it.
--
-- Renumbered from the 0065 drizzle-kit emitted, which collided with the
-- hand-written 0065_task_tool_path.sql and sorted before it. The
-- generated file also re-issued that migration's ALTER TABLE, which
-- would have failed with "duplicate column name" on every existing
-- install; that statement is removed here. See README.md.

CREATE TABLE `client_context` (
	`client_id` integer PRIMARY KEY NOT NULL,
	`self_description` text,
	`products` text,
	`pages_read` integer,
	`urls_read` text,
	`read_at` integer,
	`read_note` text,
	`business_overview` text,
	`audience` text,
	`key_pages` text,
	`notes` text,
	`curated_at` integer,
	`curated_by` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `client_research_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`summary` text NOT NULL,
	`source` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
