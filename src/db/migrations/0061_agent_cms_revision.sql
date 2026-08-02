-- The CMS's own revision id for an agent change, when the CMS keeps one.
--
-- Undo has always worked by replaying `before_value`: read the field
-- before writing, put it back on request. That is fine for a title or a
-- description, where the previous value is one short string.
--
-- Internal-link insertion breaks it. The change is to the article body,
-- so the "previous value" is the entire post content — potentially tens
-- of kilobytes, and keeping a second copy of every edited article in
-- this table to support a button nobody may press is the wrong trade.
--
-- The WordPress plugin already keeps that body: every write records a
-- revision, and `/undo/{rev_id}` restores it exactly. So for those
-- actions we store the handle instead of the value, and undo asks the
-- CMS to do what it already knows how to do.
--
-- Nullable, because it's null for every other kind and for any CMS that
-- doesn't version writes.

ALTER TABLE `agent_actions` ADD `cms_revision_id` integer;