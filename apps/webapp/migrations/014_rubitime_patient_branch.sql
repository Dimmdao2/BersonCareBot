-- Rubitime patient profile + branch: platform_users profile fields, branches table, appointment_records.branch_id

-- Platform users: add first_name, last_name, email (from Rubitime / booking payload)
ALTER TABLE platform_users
  ADD COLUMN IF NOT EXISTS first_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS last_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS email TEXT NULL;

-- Branches: integrator_branch_id from Rubitime; name/meta for display and future enrichment
CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrator_branch_id BIGINT NOT NULL UNIQUE,
  name TEXT NULL,
  meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_integrator_branch_id
  ON branches (integrator_branch_id);

-- Appointment records: link to branch
ALTER TABLE appointment_records
  ADD COLUMN IF NOT EXISTS branch_id UUID NULL REFERENCES branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointment_records_branch_id
  ON appointment_records (branch_id) WHERE branch_id IS NOT NULL;
