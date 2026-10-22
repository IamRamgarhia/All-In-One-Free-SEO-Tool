-- Live SEOmator progress + landing screenshot for audit detail UI.
ALTER TABLE `audits` ADD COLUMN `preview_screenshot_path` text;
ALTER TABLE `audits` ADD COLUMN `progress_json` text;
