-- Client approval of drafts, through the portal (/portal/<token>).
-- The agency reads a draft first, then sends it to the client, who
-- approves it or asks for changes with a comment. Null decision: not
-- answered yet. Sending again after an edit clears the decision.
-- Queue items: client_shared_at marks the sending. Articles keep using
-- content_posts.review_shared_at for that.
ALTER TABLE `publish_queue` ADD `client_shared_at` integer;
--> statement-breakpoint
ALTER TABLE `publish_queue` ADD `client_decision` text;
--> statement-breakpoint
ALTER TABLE `publish_queue` ADD `client_comment` text;
--> statement-breakpoint
ALTER TABLE `publish_queue` ADD `client_decided_at` integer;
--> statement-breakpoint
ALTER TABLE `content_posts` ADD `client_decision` text;
--> statement-breakpoint
ALTER TABLE `content_posts` ADD `client_comment` text;
--> statement-breakpoint
ALTER TABLE `content_posts` ADD `client_decided_at` integer;
