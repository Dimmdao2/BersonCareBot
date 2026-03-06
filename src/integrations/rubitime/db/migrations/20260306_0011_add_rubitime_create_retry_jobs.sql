CREATE TABLE IF NOT EXISTS rubitime_create_retry_jobs (
  id bigserial PRIMARY KEY,
  phone_normalized text NOT NULL,
  message_text text NOT NULL,
  next_try_at timestamptz NOT NULL,
  attempts_done integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 2,
  status text NOT NULL DEFAULT 'pending',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rubitime_create_retry_jobs_due
  ON rubitime_create_retry_jobs (status, next_try_at);
