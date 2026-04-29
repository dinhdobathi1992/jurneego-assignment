-- 016_add_regenerated_status.sql
-- Allow status='regenerated' so the regenerate flow can mark superseded
-- assistant messages without violating the existing CHECK constraint. The
-- previous constraint only allowed pending/streaming/completed/cancelled/failed.

ALTER TABLE messages
  DROP CONSTRAINT messages_status_check;

ALTER TABLE messages
  ADD CONSTRAINT messages_status_check
    CHECK (status = ANY (ARRAY[
      'pending'::text,
      'streaming'::text,
      'completed'::text,
      'cancelled'::text,
      'failed'::text,
      'regenerated'::text
    ]));
