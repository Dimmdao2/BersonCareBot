-- Stage 2: booking form fields, schedule, canonical appointment overlap, patient_bookings link.

CREATE TABLE IF NOT EXISTS be_booking_form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES be_organizations(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  field_type text NOT NULL,
  label text NOT NULL,
  placeholder text,
  is_required boolean DEFAULT false NOT NULL,
  visible_to_patient boolean DEFAULT true NOT NULL,
  visible_to_staff boolean DEFAULT true NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT be_booking_form_fields_type_check CHECK (field_type = ANY (ARRAY[
    'first_name'::text, 'last_name'::text, 'phone'::text, 'email'::text,
    'comment'::text, 'problem_description'::text, 'complaint'::text,
    'free_text'::text, 'custom'::text
  ])),
  CONSTRAINT uq_be_booking_form_fields_org_key UNIQUE (organization_id, field_key)
);
CREATE INDEX IF NOT EXISTS idx_be_booking_form_fields_org ON be_booking_form_fields (organization_id);

CREATE TABLE IF NOT EXISTS be_booking_form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES be_organizations(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES be_appointments(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES be_booking_form_fields(id) ON DELETE CASCADE,
  value_text text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT uq_be_booking_form_submissions_appt_field UNIQUE (appointment_id, field_id)
);
CREATE INDEX IF NOT EXISTS idx_be_booking_form_submissions_appt ON be_booking_form_submissions (appointment_id);

CREATE TABLE IF NOT EXISTS be_working_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES be_organizations(id) ON DELETE CASCADE,
  specialist_id uuid REFERENCES be_specialists(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES be_branches(id) ON DELETE CASCADE,
  room_id uuid REFERENCES be_rooms(id) ON DELETE CASCADE,
  weekday integer NOT NULL,
  start_minute integer NOT NULL,
  end_minute integer NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT be_working_hours_weekday_check CHECK (weekday >= 0 AND weekday <= 6),
  CONSTRAINT be_working_hours_minutes_check CHECK (start_minute >= 0 AND end_minute <= 1440 AND end_minute > start_minute)
);
CREATE INDEX IF NOT EXISTS idx_be_working_hours_scope ON be_working_hours (organization_id, specialist_id, branch_id);

CREATE TABLE IF NOT EXISTS be_availability_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES be_organizations(id) ON DELETE CASCADE,
  specialist_id uuid REFERENCES be_specialists(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES be_branches(id) ON DELETE CASCADE,
  rule_type text NOT NULL,
  config jsonb DEFAULT '{}'::jsonb NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT be_availability_rules_type_check CHECK (rule_type = ANY (ARRAY['buffer_minutes'::text, 'max_chain_slots'::text]))
);

CREATE TABLE IF NOT EXISTS be_schedule_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES be_organizations(id) ON DELETE CASCADE,
  specialist_id uuid REFERENCES be_specialists(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES be_branches(id) ON DELETE CASCADE,
  room_id uuid REFERENCES be_rooms(id) ON DELETE CASCADE,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  block_type text NOT NULL,
  title text,
  created_by_actor_id uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT be_schedule_blocks_time_check CHECK (end_at > start_at),
  CONSTRAINT be_schedule_blocks_type_check CHECK (block_type = ANY (ARRAY['block'::text, 'absence'::text, 'manual_booking'::text]))
);
CREATE INDEX IF NOT EXISTS idx_be_schedule_blocks_org_start ON be_schedule_blocks (organization_id, start_at);

ALTER TABLE patient_bookings
  ADD COLUMN IF NOT EXISTS canonical_appointment_id uuid REFERENCES be_appointments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_patient_bookings_canonical_appt ON patient_bookings (canonical_appointment_id);

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE be_appointments DROP CONSTRAINT IF EXISTS be_appointments_specialist_no_overlap;
ALTER TABLE be_appointments ADD CONSTRAINT be_appointments_specialist_no_overlap
  EXCLUDE USING gist (
    specialist_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  )
  WHERE (
    specialist_id IS NOT NULL
    AND status NOT IN (
      'cancelled_by_patient',
      'cancelled_by_specialist',
      'late_cancellation',
      'no_show',
      'completed',
      'visit_confirmed'
    )
  );

-- Default org working hours (Mon–Fri 09:00–18:00) when none configured.
INSERT INTO be_working_hours (organization_id, weekday, start_minute, end_minute, is_active)
SELECT 'a0000000-0000-4000-8000-000000000001'::uuid, d, 540, 1080, true
FROM generate_series(1, 5) AS d
WHERE NOT EXISTS (
  SELECT 1 FROM be_working_hours
  WHERE organization_id = 'a0000000-0000-4000-8000-000000000001'::uuid
    AND specialist_id IS NULL AND branch_id IS NULL AND room_id IS NULL
);

-- Seed default booking form fields for default org.
INSERT INTO be_booking_form_fields (organization_id, field_key, field_type, label, is_required, visible_to_patient, sort_order)
SELECT 'a0000000-0000-4000-8000-000000000001'::uuid, v.field_key, v.field_type, v.label, v.is_required, true, v.sort_order
FROM (VALUES
  ('contact_name', 'first_name', 'Имя', true, 10),
  ('contact_phone', 'phone', 'Телефон', true, 20),
  ('contact_email', 'email', 'Email', false, 30),
  ('comment', 'comment', 'Комментарий', false, 40)
) AS v(field_key, field_type, label, is_required, sort_order)
ON CONFLICT ON CONSTRAINT uq_be_booking_form_fields_org_key DO NOTHING;
