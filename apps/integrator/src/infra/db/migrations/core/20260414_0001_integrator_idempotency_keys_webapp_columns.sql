-- Align integrator.idempotency_keys with webapp-style columns (see webapp 072_idempotency_keys_webapp_columns.sql).
-- Gateway tryAcquire inserts request_hash + status + response_body.

ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS request_hash TEXT;
ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS status SMALLINT;
ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS response_body JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE idempotency_keys
SET request_hash = COALESCE(request_hash, ''),
    status = COALESCE(status, 200)
WHERE request_hash IS NULL OR status IS NULL;

ALTER TABLE idempotency_keys ALTER COLUMN request_hash SET NOT NULL;
ALTER TABLE idempotency_keys ALTER COLUMN status SET NOT NULL;
