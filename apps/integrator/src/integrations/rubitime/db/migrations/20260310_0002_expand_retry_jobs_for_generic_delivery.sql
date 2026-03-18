ALTER TABLE IF EXISTS rubitime_create_retry_jobs
  ALTER COLUMN phone_normalized DROP NOT NULL;

ALTER TABLE IF EXISTS rubitime_create_retry_jobs
  ALTER COLUMN message_text DROP NOT NULL;

ALTER TABLE IF EXISTS rubitime_create_retry_jobs
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'message.deliver';

ALTER TABLE IF EXISTS rubitime_create_retry_jobs
  ADD COLUMN IF NOT EXISTS payload_json jsonb;
