-- Stage 9: Product appointment records (projection from integrator rubitime_records).
-- Keyed by integrator_record_id for idempotency and reconciliation.

CREATE TABLE IF NOT EXISTS appointment_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrator_record_id TEXT NOT NULL UNIQUE,
  phone_normalized TEXT NULL,
  record_at TIMESTAMPTZ NULL,
  status TEXT NOT NULL CHECK (status IN ('created', 'updated', 'canceled')),
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_event TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointment_records_integrator_record_id
  ON appointment_records (integrator_record_id);
CREATE INDEX IF NOT EXISTS idx_appointment_records_phone_normalized
  ON appointment_records (phone_normalized) WHERE phone_normalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointment_records_record_at
  ON appointment_records (record_at) WHERE record_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointment_records_status
  ON appointment_records (status);
