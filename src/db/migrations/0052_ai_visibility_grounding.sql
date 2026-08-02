-- Record whether an AI-visibility answer came from live web retrieval
-- or from the model's training data.
--
-- Without this the two were indistinguishable in storage, and the UI
-- presented them identically — so a plain chat-completion that
-- hallucinated the client's URL scored the same as a real citation from
-- a live search. Existing rows predate grounding and were all made with
-- ungrounded chat calls, so 'memory' is the correct backfill value.
ALTER TABLE ai_visibility_checks ADD COLUMN grounding TEXT NOT NULL DEFAULT 'memory';
