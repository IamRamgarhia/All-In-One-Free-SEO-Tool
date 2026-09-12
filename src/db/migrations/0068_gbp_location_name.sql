-- Which Business Profile location a client is, once somebody has chosen.
--
-- The connected path resolved "the first location on the first account"
-- on every call. That is right for the common case of one business with
-- one listing and silently wrong for anyone with two — replies would go
-- to whichever Google listed first, which is not a stable order.
--
-- Stored rather than passed around because the review sync runs from a
-- schedule, where there is no page to carry a selection.
ALTER TABLE `clients` ADD `gbp_location_name` text;
