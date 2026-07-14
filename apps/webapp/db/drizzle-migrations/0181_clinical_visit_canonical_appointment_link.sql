-- Rubitime retirement R2/R7 prep: move doctor clinical visit links toward canonical appointments.
-- The legacy appointment_record_id column stays for compatibility until the archive/drop phase.

ALTER TABLE clinical_visit
  ADD COLUMN IF NOT EXISTS canonical_appointment_id uuid;
--> statement-breakpoint

UPDATE clinical_visit cv
SET canonical_appointment_id = resolved.be_appointment_id
FROM (
  SELECT
    cv_inner.id AS visit_id,
    COALESCE(be_from_id.id, be_from_map.id) AS be_appointment_id
  FROM clinical_visit cv_inner
  JOIN appointment_records ar ON ar.id = cv_inner.appointment_record_id
  LEFT JOIN be_external_entity_mappings appt_map
    ON appt_map.entity_type = 'appointment'
   AND appt_map.external_system = 'rubitime'
   AND appt_map.external_id = ar.integrator_record_id
  LEFT JOIN be_appointments be_from_map ON be_from_map.id = appt_map.canonical_id
  LEFT JOIN be_appointments be_from_id ON be_from_id.id = CASE
    WHEN ar.integrator_record_id ~ '^be:[0-9a-fA-F-]{36}$'
      THEN (substring(ar.integrator_record_id from 4))::uuid
    ELSE NULL
  END
  WHERE cv_inner.appointment_record_id IS NOT NULL
) resolved
WHERE cv.id = resolved.visit_id
  AND cv.canonical_appointment_id IS NULL
  AND resolved.be_appointment_id IS NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_clinical_visit_canonical_appointment_id
  ON clinical_visit USING btree (canonical_appointment_id);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'clinical_visit_canonical_appointment_id_fkey'
      AND conrelid = 'clinical_visit'::regclass
  ) THEN
    ALTER TABLE clinical_visit
      ADD CONSTRAINT clinical_visit_canonical_appointment_id_fkey
      FOREIGN KEY (canonical_appointment_id)
      REFERENCES be_appointments(id)
      ON DELETE SET NULL;
  END IF;
END $$;
