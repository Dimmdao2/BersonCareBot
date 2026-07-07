ALTER TABLE clinical_visit
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE clinical_complaint
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE clinical_complaint_update
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE clinical_diagnosis
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE clinical_diagnosis_status_history
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE clinical_diagnosis_update
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE clinical_anamnesis_trauma
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE clinical_anamnesis_illness
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE clinical_anamnesis_lifestyle
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE patient_comorbidity
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE patient_files
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE patient_payment
  ADD COLUMN IF NOT EXISTS organization_id uuid;

CREATE INDEX IF NOT EXISTS idx_clinical_visit_organization_id
  ON clinical_visit USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_clinical_complaint_organization_id
  ON clinical_complaint USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_clinical_complaint_update_organization_id
  ON clinical_complaint_update USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_clinical_diagnosis_organization_id
  ON clinical_diagnosis USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_clinical_diagnosis_status_history_organization_id
  ON clinical_diagnosis_status_history USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_clinical_diagnosis_update_organization_id
  ON clinical_diagnosis_update USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_clinical_anamnesis_trauma_organization_id
  ON clinical_anamnesis_trauma USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_clinical_anamnesis_illness_organization_id
  ON clinical_anamnesis_illness USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_clinical_anamnesis_lifestyle_organization_id
  ON clinical_anamnesis_lifestyle USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_patient_comorbidity_organization_id
  ON patient_comorbidity USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_patient_files_organization_id
  ON patient_files USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_patient_payment_organization_id
  ON patient_payment USING btree (organization_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinical_visit_organization_id_fkey') THEN
    ALTER TABLE clinical_visit
      ADD CONSTRAINT clinical_visit_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinical_complaint_organization_id_fkey') THEN
    ALTER TABLE clinical_complaint
      ADD CONSTRAINT clinical_complaint_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinical_complaint_update_organization_id_fkey') THEN
    ALTER TABLE clinical_complaint_update
      ADD CONSTRAINT clinical_complaint_update_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinical_diagnosis_organization_id_fkey') THEN
    ALTER TABLE clinical_diagnosis
      ADD CONSTRAINT clinical_diagnosis_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinical_diagnosis_status_history_organization_id_fkey') THEN
    ALTER TABLE clinical_diagnosis_status_history
      ADD CONSTRAINT clinical_diagnosis_status_history_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinical_diagnosis_update_organization_id_fkey') THEN
    ALTER TABLE clinical_diagnosis_update
      ADD CONSTRAINT clinical_diagnosis_update_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinical_anamnesis_trauma_organization_id_fkey') THEN
    ALTER TABLE clinical_anamnesis_trauma
      ADD CONSTRAINT clinical_anamnesis_trauma_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinical_anamnesis_illness_organization_id_fkey') THEN
    ALTER TABLE clinical_anamnesis_illness
      ADD CONSTRAINT clinical_anamnesis_illness_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinical_anamnesis_lifestyle_organization_id_fkey') THEN
    ALTER TABLE clinical_anamnesis_lifestyle
      ADD CONSTRAINT clinical_anamnesis_lifestyle_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patient_comorbidity_organization_id_fkey') THEN
    ALTER TABLE patient_comorbidity
      ADD CONSTRAINT patient_comorbidity_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patient_files_organization_id_fkey') THEN
    ALTER TABLE patient_files
      ADD CONSTRAINT patient_files_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patient_payment_organization_id_fkey') THEN
    ALTER TABLE patient_payment
      ADD CONSTRAINT patient_payment_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

WITH resolved_patient_org AS (
  SELECT
    platform_user_id,
    (array_agg(DISTINCT organization_id))[1] AS organization_id
  FROM org_enrollments
  WHERE status = 'active'
  GROUP BY platform_user_id
  HAVING count(DISTINCT organization_id) = 1
)
UPDATE clinical_visit target
SET organization_id = resolved_patient_org.organization_id
FROM resolved_patient_org
WHERE target.organization_id IS NULL
  AND target.patient_user_id = resolved_patient_org.platform_user_id;

WITH resolved_patient_org AS (
  SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
  FROM org_enrollments
  WHERE status = 'active'
  GROUP BY platform_user_id
  HAVING count(DISTINCT organization_id) = 1
)
UPDATE clinical_complaint target
SET organization_id = resolved_patient_org.organization_id
FROM resolved_patient_org
WHERE target.organization_id IS NULL
  AND target.patient_user_id = resolved_patient_org.platform_user_id;

UPDATE clinical_complaint_update target
SET organization_id = parent.organization_id
FROM clinical_complaint parent
WHERE target.organization_id IS NULL
  AND target.complaint_id = parent.id
  AND parent.organization_id IS NOT NULL;

WITH resolved_patient_org AS (
  SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
  FROM org_enrollments
  WHERE status = 'active'
  GROUP BY platform_user_id
  HAVING count(DISTINCT organization_id) = 1
)
UPDATE clinical_diagnosis target
SET organization_id = resolved_patient_org.organization_id
FROM resolved_patient_org
WHERE target.organization_id IS NULL
  AND target.patient_user_id = resolved_patient_org.platform_user_id;

UPDATE clinical_diagnosis_status_history target
SET organization_id = parent.organization_id
FROM clinical_diagnosis parent
WHERE target.organization_id IS NULL
  AND target.diagnosis_id = parent.id
  AND parent.organization_id IS NOT NULL;

UPDATE clinical_diagnosis_update target
SET organization_id = parent.organization_id
FROM clinical_diagnosis parent
WHERE target.organization_id IS NULL
  AND target.diagnosis_id = parent.id
  AND parent.organization_id IS NOT NULL;

WITH resolved_patient_org AS (
  SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
  FROM org_enrollments
  WHERE status = 'active'
  GROUP BY platform_user_id
  HAVING count(DISTINCT organization_id) = 1
)
UPDATE clinical_anamnesis_trauma target
SET organization_id = resolved_patient_org.organization_id
FROM resolved_patient_org
WHERE target.organization_id IS NULL
  AND target.patient_user_id = resolved_patient_org.platform_user_id;

WITH resolved_patient_org AS (
  SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
  FROM org_enrollments
  WHERE status = 'active'
  GROUP BY platform_user_id
  HAVING count(DISTINCT organization_id) = 1
)
UPDATE clinical_anamnesis_illness target
SET organization_id = resolved_patient_org.organization_id
FROM resolved_patient_org
WHERE target.organization_id IS NULL
  AND target.patient_user_id = resolved_patient_org.platform_user_id;

WITH resolved_patient_org AS (
  SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
  FROM org_enrollments
  WHERE status = 'active'
  GROUP BY platform_user_id
  HAVING count(DISTINCT organization_id) = 1
)
UPDATE clinical_anamnesis_lifestyle target
SET organization_id = resolved_patient_org.organization_id
FROM resolved_patient_org
WHERE target.organization_id IS NULL
  AND target.patient_user_id = resolved_patient_org.platform_user_id;

WITH resolved_patient_org AS (
  SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
  FROM org_enrollments
  WHERE status = 'active'
  GROUP BY platform_user_id
  HAVING count(DISTINCT organization_id) = 1
)
UPDATE patient_comorbidity target
SET organization_id = resolved_patient_org.organization_id
FROM resolved_patient_org
WHERE target.organization_id IS NULL
  AND target.patient_user_id = resolved_patient_org.platform_user_id;

WITH resolved_patient_org AS (
  SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
  FROM org_enrollments
  WHERE status = 'active'
  GROUP BY platform_user_id
  HAVING count(DISTINCT organization_id) = 1
)
UPDATE patient_files target
SET organization_id = resolved_patient_org.organization_id
FROM resolved_patient_org
WHERE target.organization_id IS NULL
  AND target.patient_user_id = resolved_patient_org.platform_user_id;

WITH resolved_patient_org AS (
  SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
  FROM org_enrollments
  WHERE status = 'active'
  GROUP BY platform_user_id
  HAVING count(DISTINCT organization_id) = 1
)
UPDATE patient_payment target
SET organization_id = resolved_patient_org.organization_id
FROM resolved_patient_org
WHERE target.organization_id IS NULL
  AND target.patient_user_id = resolved_patient_org.platform_user_id;

DO $$
DECLARE
  v_null_count bigint;
BEGIN
  SELECT sum(null_rows)
  INTO v_null_count
  FROM (
    SELECT count(*) FILTER (WHERE organization_id IS NULL) AS null_rows FROM clinical_visit
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM clinical_complaint
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM clinical_complaint_update
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM clinical_diagnosis
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM clinical_diagnosis_status_history
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM clinical_diagnosis_update
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM clinical_anamnesis_trauma
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM clinical_anamnesis_illness
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM clinical_anamnesis_lifestyle
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM patient_comorbidity
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM patient_files
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM patient_payment
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM patient_merge_candidates
  ) checks;

  IF v_null_count <> 0 THEN
    RAISE EXCEPTION 'P0.4.P1 expected no NULL organization_id rows, found %', v_null_count;
  END IF;
END $$;
