ALTER TABLE be_clinic_services
  ADD COLUMN IF NOT EXISTS buffer_after_minutes integer NOT NULL DEFAULT 0;

ALTER TABLE be_clinic_services
  DROP CONSTRAINT IF EXISTS be_clinic_services_buffer_after_check;

ALTER TABLE be_clinic_services
  ADD CONSTRAINT be_clinic_services_buffer_after_check
  CHECK (buffer_after_minutes >= 0 AND buffer_after_minutes % 5 = 0);
