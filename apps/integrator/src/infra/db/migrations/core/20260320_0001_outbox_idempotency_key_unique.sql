-- Deduplicate before adding constraint (webhook replays could enqueue duplicates).
DELETE FROM projection_outbox a
USING projection_outbox b
WHERE a.idempotency_key = b.idempotency_key
  AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_projection_outbox_idempotency_key
  ON projection_outbox (idempotency_key);
