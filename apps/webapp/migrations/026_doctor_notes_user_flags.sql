-- Stage 9: doctor_notes, block/archive flags on platform_users, soft-delete for appointment_records.

CREATE TABLE IF NOT EXISTS doctor_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES platform_users(id),
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doctor_notes_user_created ON doctor_notes(user_id, created_at DESC);

ALTER TABLE platform_users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE platform_users ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;
ALTER TABLE platform_users ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
ALTER TABLE platform_users ADD COLUMN IF NOT EXISTS blocked_by UUID REFERENCES platform_users(id);
ALTER TABLE platform_users ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE appointment_records ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_appointment_records_phone_not_deleted
  ON appointment_records(phone_normalized, record_at DESC)
  WHERE deleted_at IS NULL AND phone_normalized IS NOT NULL;
