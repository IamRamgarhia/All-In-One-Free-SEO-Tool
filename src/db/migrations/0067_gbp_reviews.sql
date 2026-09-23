-- Reviews on a client's Google Business Profile, kept.
--
-- They were fetched live on every page load and never stored. That
-- looked fine and quietly cost four things: no durable queue of what
-- still needs answering, no record that we answered it, nothing for a
-- report or the agent to read, and a reply drafted but not yet sent was
-- lost the moment the page reloaded.
--
-- reply_comment and sent_at stay separate on purpose. The first is
-- whatever reply is live on Google now, which may have been typed by the
-- owner in Google's own interface; the second is set only when this tool
-- sent it.

CREATE TABLE `gbp_reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`location_name` text NOT NULL,
	`review_id` text NOT NULL,
	`reviewer_name` text,
	`reviewer_photo_url` text,
	`star_rating` integer,
	`comment` text,
	`create_time` integer,
	`update_time` integer,
	`reply_comment` text,
	`reply_update_time` integer,
	`draft_reply` text,
	`drafted_at` integer,
	`sent_at` integer,
	`removed_at` integer,
	`first_seen_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_synced_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gbp_reviews_client_review_idx` ON `gbp_reviews` (`client_id`,`review_id`);