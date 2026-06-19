-- Sentiment classification on AI visibility checks.
-- When an LLM mentions a brand, the EMOTIONAL TONE of that mention
-- matters as much as the citation itself: "ChatGPT calls Acme
-- innovative" vs "ChatGPT calls Acme overpriced" both count as a
-- mention, but the brand-perception implications are opposite.
--
-- Otterly.AI tracks this on their premium tier. We compute it
-- locally — same LLM call that the user already configured. Free
-- providers (Gemini, Groq) handle this fine.
--
-- Fields:
--   sentiment       — "positive" | "neutral" | "negative" | "mixed"
--                     null when no mention OR classification failed
--   sentiment_score — -100 (very negative) to +100 (very positive)
--                     null when no mention. Centered at 0 = neutral.
--   sentiment_reason — short LLM-written rationale (~20 words). Helps
--                      the user audit why this row was classified
--                      that way without re-reading the full response.

ALTER TABLE ai_visibility_checks ADD COLUMN sentiment TEXT;
--> statement-breakpoint
ALTER TABLE ai_visibility_checks ADD COLUMN sentiment_score INTEGER;
--> statement-breakpoint
ALTER TABLE ai_visibility_checks ADD COLUMN sentiment_reason TEXT;
