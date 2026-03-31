CREATE TABLE IF NOT EXISTS patient_bookings (
  id UUID PRIMARY KEY,
  platform_user_id UUID NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  booking_type TEXT NOT NULL CHECK (booking_type IN ('in_person', 'online')),
  city TEXT,
  category TEXT NOT NULL CHECK (category IN ('rehab_lfk', 'nutrition', 'general')),
  slot_start TIMESTAMPTZ NOT NULL,
  slot_end TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('creating', 'confirmed', 'cancelled', 'rescheduled', 'completed', 'no_show', 'failed_sync')),
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  rubitime_id TEXT UNIQUE,
  gcal_event_id TEXT,
  contact_phone TEXT NOT NULL,
  contact_email TEXT,
  contact_name TEXT NOT NULL,
  reminder_24h_sent BOOLEAN NOT NULL DEFAULT FALSE,
  reminder_2h_sent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (slot_end > slot_start)
);

CREATE INDEX IF NOT EXISTS idx_patient_bookings_user_id ON patient_bookings(platform_user_id);
CREATE INDEX IF NOT EXISTS idx_patient_bookings_status ON patient_bookings(status);
CREATE INDEX IF NOT EXISTS idx_patient_bookings_slot_start ON patient_bookings(slot_start);
CREATE INDEX IF NOT EXISTS idx_patient_bookings_rubitime_id ON patient_bookings(rubitime_id);
