-- 015_add_message_feedback.sql
-- Thumbs up/down feedback on assistant messages. NULL = no feedback yet.
-- 1 = thumbs up, -1 = thumbs down. Updated by the learner who owns the
-- conversation; teachers see the aggregate via a future review endpoint.

ALTER TABLE messages
  ADD COLUMN feedback_score smallint NULL,
  ADD COLUMN feedback_at    timestamptz NULL;

ALTER TABLE messages
  ADD CONSTRAINT messages_feedback_score_chk
    CHECK (feedback_score IS NULL OR feedback_score IN (-1, 1));

CREATE INDEX idx_messages_feedback_score
  ON messages (conversation_id, feedback_score)
  WHERE feedback_score IS NOT NULL;
