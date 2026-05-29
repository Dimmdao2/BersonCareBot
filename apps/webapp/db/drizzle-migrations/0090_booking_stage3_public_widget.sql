-- Stage 3: public widget attribution + patient merge candidates

ALTER TABLE be_appointments
  ADD COLUMN IF NOT EXISTS attribution_json jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_be_appointments_attribution_gin
  ON be_appointments USING gin (attribution_json);

CREATE TABLE IF NOT EXISTS patient_merge_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES be_organizations(id) ON DELETE CASCADE,
  anchor_user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  candidate_user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  trigger_appointment_id uuid REFERENCES be_appointments(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES platform_users(id) ON DELETE SET NULL,
  CONSTRAINT patient_merge_candidates_status_check CHECK (
    status = ANY (ARRAY['pending'::text, 'resolved'::text, 'dismissed'::text])
  ),
  CONSTRAINT patient_merge_candidates_distinct_users CHECK (anchor_user_id <> candidate_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_merge_candidates_pending_pair
  ON patient_merge_candidates (anchor_user_id, candidate_user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_patient_merge_candidates_org_status
  ON patient_merge_candidates (organization_id, status, created_at DESC);
