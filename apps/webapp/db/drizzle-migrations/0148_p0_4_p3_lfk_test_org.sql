ALTER TABLE lfk_complex_exercises
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE lfk_complex_template_exercises
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE lfk_complex_templates
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE lfk_complexes
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE lfk_exercise_media
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE lfk_exercise_regions
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE lfk_exercises
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE lfk_sessions
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE patient_lfk_assignments
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE test_attempts
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE test_results
  ADD COLUMN IF NOT EXISTS organization_id uuid;

CREATE INDEX IF NOT EXISTS idx_lfk_complex_exercises_organization_id
  ON lfk_complex_exercises USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_lfk_complex_template_exercises_organization_id
  ON lfk_complex_template_exercises USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_lfk_complex_templates_organization_id
  ON lfk_complex_templates USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_lfk_complexes_organization_id
  ON lfk_complexes USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_lfk_exercise_media_organization_id
  ON lfk_exercise_media USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_lfk_exercise_regions_organization_id
  ON lfk_exercise_regions USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_lfk_exercises_organization_id
  ON lfk_exercises USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_lfk_sessions_organization_id
  ON lfk_sessions USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_patient_lfk_assignments_organization_id
  ON patient_lfk_assignments USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_test_attempts_organization_id
  ON test_attempts USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_test_results_organization_id
  ON test_results USING btree (organization_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lfk_complex_exercises_organization_id_fkey') THEN
    ALTER TABLE lfk_complex_exercises
      ADD CONSTRAINT lfk_complex_exercises_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lfk_complex_template_exercises_organization_id_fkey') THEN
    ALTER TABLE lfk_complex_template_exercises
      ADD CONSTRAINT lfk_complex_template_exercises_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lfk_complex_templates_organization_id_fkey') THEN
    ALTER TABLE lfk_complex_templates
      ADD CONSTRAINT lfk_complex_templates_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lfk_complexes_organization_id_fkey') THEN
    ALTER TABLE lfk_complexes
      ADD CONSTRAINT lfk_complexes_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lfk_exercise_media_organization_id_fkey') THEN
    ALTER TABLE lfk_exercise_media
      ADD CONSTRAINT lfk_exercise_media_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lfk_exercise_regions_organization_id_fkey') THEN
    ALTER TABLE lfk_exercise_regions
      ADD CONSTRAINT lfk_exercise_regions_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lfk_exercises_organization_id_fkey') THEN
    ALTER TABLE lfk_exercises
      ADD CONSTRAINT lfk_exercises_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lfk_sessions_organization_id_fkey') THEN
    ALTER TABLE lfk_sessions
      ADD CONSTRAINT lfk_sessions_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patient_lfk_assignments_organization_id_fkey') THEN
    ALTER TABLE patient_lfk_assignments
      ADD CONSTRAINT patient_lfk_assignments_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'test_attempts_organization_id_fkey') THEN
    ALTER TABLE test_attempts
      ADD CONSTRAINT test_attempts_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'test_results_organization_id_fkey') THEN
    ALTER TABLE test_results
      ADD CONSTRAINT test_results_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
DECLARE
  v_default_org_id constant uuid := 'a0000000-0000-4000-8000-000000000001';
  v_org_count integer;
BEGIN
  SELECT count(*)::integer
  INTO v_org_count
  FROM be_organizations
  WHERE id = v_default_org_id;

  IF v_org_count <> 1 THEN
    RAISE EXCEPTION 'P0.4.P3 expected default organization %, found %', v_default_org_id, v_org_count;
  END IF;

  UPDATE lfk_exercises
  SET organization_id = v_default_org_id
  WHERE organization_id IS NULL;

  UPDATE lfk_complex_templates
  SET organization_id = v_default_org_id
  WHERE organization_id IS NULL;
END $$;

UPDATE lfk_exercise_regions target
SET organization_id = parent.organization_id
FROM lfk_exercises parent
WHERE target.organization_id IS NULL
  AND target.exercise_id = parent.id
  AND parent.organization_id IS NOT NULL;

UPDATE lfk_exercise_media target
SET organization_id = parent.organization_id
FROM lfk_exercises parent
WHERE target.organization_id IS NULL
  AND target.exercise_id = parent.id
  AND parent.organization_id IS NOT NULL;

UPDATE lfk_complex_template_exercises target
SET organization_id = parent.organization_id
FROM lfk_complex_templates parent
WHERE target.organization_id IS NULL
  AND target.template_id = parent.id
  AND parent.organization_id IS NOT NULL;

DO $$
DECLARE
  v_default_org_id constant uuid := 'a0000000-0000-4000-8000-000000000001';
BEGIN
  WITH resolved_patient_org AS (
    SELECT
      platform_user_id,
      (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM org_enrollments
    WHERE status = 'active'
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  )
  UPDATE lfk_complexes target
  SET organization_id = COALESCE(resolved_patient_org.organization_id, v_default_org_id)
  FROM lfk_complexes complex_for_join
  LEFT JOIN resolved_patient_org
    ON resolved_patient_org.platform_user_id = complex_for_join.platform_user_id
  WHERE target.organization_id IS NULL
    AND target.id = complex_for_join.id;
END $$;

UPDATE lfk_complex_exercises target
SET organization_id = parent.organization_id
FROM lfk_complexes parent
WHERE target.organization_id IS NULL
  AND target.complex_id = parent.id
  AND parent.organization_id IS NOT NULL;

DO $$
DECLARE
  v_default_org_id constant uuid := 'a0000000-0000-4000-8000-000000000001';
BEGIN
  WITH resolved_patient_org AS (
    SELECT
      platform_user_id,
      (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM org_enrollments
    WHERE status = 'active'
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  )
  UPDATE patient_lfk_assignments target
  SET organization_id = COALESCE(
    resolved_patient_org.organization_id,
    complex.organization_id,
    template.organization_id,
    v_default_org_id
  )
  FROM patient_lfk_assignments assignment_for_join
  LEFT JOIN resolved_patient_org
    ON resolved_patient_org.platform_user_id = assignment_for_join.patient_user_id
  LEFT JOIN lfk_complexes complex
    ON complex.id = assignment_for_join.complex_id
  LEFT JOIN lfk_complex_templates template
    ON template.id = assignment_for_join.template_id
  WHERE target.organization_id IS NULL
    AND target.id = assignment_for_join.id;
END $$;

DO $$
DECLARE
  v_default_org_id constant uuid := 'a0000000-0000-4000-8000-000000000001';
BEGIN
  WITH resolved_patient_org AS (
    SELECT
      platform_user_id,
      (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM org_enrollments
    WHERE status = 'active'
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  )
  UPDATE lfk_sessions target
  SET organization_id = COALESCE(resolved_patient_org.organization_id, complex.organization_id, v_default_org_id)
  FROM lfk_sessions session_for_join
  LEFT JOIN resolved_patient_org
    ON resolved_patient_org.platform_user_id = session_for_join.user_id
  LEFT JOIN lfk_complexes complex
    ON complex.id = session_for_join.complex_id
  WHERE target.organization_id IS NULL
    AND target.id = session_for_join.id;
END $$;

DO $$
DECLARE
  v_default_org_id constant uuid := 'a0000000-0000-4000-8000-000000000001';
BEGIN
  WITH resolved_patient_org AS (
    SELECT
      platform_user_id,
      (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM org_enrollments
    WHERE status = 'active'
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  )
  UPDATE test_attempts target
  SET organization_id = COALESCE(
    resolved_patient_org.organization_id,
    stage_item.organization_id,
    v_default_org_id
  )
  FROM test_attempts attempt_for_join
  LEFT JOIN resolved_patient_org
    ON resolved_patient_org.platform_user_id = attempt_for_join.patient_user_id
  LEFT JOIN treatment_program_instance_stage_items stage_item
    ON stage_item.id = attempt_for_join.instance_stage_item_id
  WHERE target.organization_id IS NULL
    AND target.id = attempt_for_join.id;
END $$;

UPDATE test_results target
SET organization_id = parent.organization_id
FROM test_attempts parent
WHERE target.organization_id IS NULL
  AND target.attempt_id = parent.id
  AND parent.organization_id IS NOT NULL;

DO $$
DECLARE
  v_null_count bigint;
BEGIN
  SELECT sum(null_rows)
  INTO v_null_count
  FROM (
    SELECT count(*) FILTER (WHERE organization_id IS NULL) AS null_rows FROM lfk_complex_exercises
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM lfk_complex_template_exercises
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM lfk_complex_templates
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM lfk_complexes
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM lfk_exercise_media
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM lfk_exercise_regions
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM lfk_exercises
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM lfk_sessions
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM patient_lfk_assignments
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM test_attempts
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM test_results
  ) checks;

  IF v_null_count <> 0 THEN
    RAISE EXCEPTION 'P0.4.P3 expected no NULL organization_id rows, found %', v_null_count;
  END IF;
END $$;
