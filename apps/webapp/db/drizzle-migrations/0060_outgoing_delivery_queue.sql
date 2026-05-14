CREATE TABLE IF NOT EXISTS public.outgoing_delivery_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  event_id text NOT NULL,
  kind text NOT NULL,
  channel text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 6,
  next_retry_at timestamptz NOT NULL,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  dead_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outgoing_delivery_queue_status_check CHECK (
    status IN ('pending', 'processing', 'sent', 'failed_retryable', 'dead')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_outgoing_delivery_queue_event_id
  ON public.outgoing_delivery_queue (event_id);

CREATE INDEX IF NOT EXISTS idx_outgoing_delivery_queue_due
  ON public.outgoing_delivery_queue (status, next_retry_at);
