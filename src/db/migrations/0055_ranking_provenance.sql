-- Where a ranking number came from.
--
-- Every rank in this app has been a scraped SERP position: launch a
-- headless browser, count results, hope Google didn't serve a captcha.
-- That is the most fragile data path in the codebase and the one most
-- likely to be silently wrong — the audit found it returning "not
-- ranking" for months because a redirect wrapper was being filtered out.
--
-- Search Console has the same numbers, for free, from Google itself, for
-- every query the site actually appeared for. It is strictly better data
-- where it exists. But it is NOT the same measurement, and pretending
-- otherwise would be its own kind of lying:
--
--   scrape — "the position right now, as our IP sees it"
--   gsc    — "the average position real users saw on a given day"
--
-- GSC averages across every impression that day, lags 2-3 days, and only
-- exists for queries the site got impressions for. A chart mixing the
-- two without saying which is which would show phantom movement whenever
-- the source changed. Hence this column, and hence the badge next to
-- every number in the UI.

ALTER TABLE keyword_rankings ADD COLUMN source TEXT NOT NULL DEFAULT 'scrape';
--> statement-breakpoint

-- How many impressions that average is built on. A position averaged
-- over 3 impressions is noise; over 3,000 it is solid. Null for scraped
-- rows, where the concept does not apply.
ALTER TABLE keyword_rankings ADD COLUMN impressions INTEGER;
--> statement-breakpoint

-- The day the GSC figure describes (YYYY-MM-DD), which is not the day we
-- fetched it. Without this the freshness badge would report "checked 2
-- minutes ago" for data that is three days old — technically true about
-- the fetch, actively misleading about the number.
ALTER TABLE keyword_rankings ADD COLUMN data_date TEXT;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS keyword_rankings_keyword_checked
  ON keyword_rankings (keyword_id, checked_at DESC);
