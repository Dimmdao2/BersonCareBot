ALTER TABLE patient_daily_warmup_presentations
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE patient_daily_warmup_video_views
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE patient_diary_day_snapshots
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE patient_home_blocks
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE patient_practice_completions
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE symptom_entries
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE symptom_trackings
  ADD COLUMN IF NOT EXISTS organization_id uuid;

CREATE INDEX IF NOT EXISTS idx_patient_daily_warmup_presentations_organization_id
  ON patient_daily_warmup_presentations USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_patient_daily_warmup_video_views_organization_id
  ON patient_daily_warmup_video_views USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_patient_diary_day_snapshots_organization_id
  ON patient_diary_day_snapshots USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_patient_home_blocks_organization_id
  ON patient_home_blocks USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_patient_practice_completions_organization_id
  ON patient_practice_completions USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_symptom_entries_organization_id
  ON symptom_entries USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_symptom_trackings_organization_id
  ON symptom_trackings USING btree (organization_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'patient_daily_warmup_presentations_organization_id_fkey'
      AND conrelid = 'patient_daily_warmup_presentations'::regclass
  ) THEN
    ALTER TABLE patient_daily_warmup_presentations
      ADD CONSTRAINT patient_daily_warmup_presentations_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'patient_daily_warmup_video_views_organization_id_fkey'
      AND conrelid = 'patient_daily_warmup_video_views'::regclass
  ) THEN
    ALTER TABLE patient_daily_warmup_video_views
      ADD CONSTRAINT patient_daily_warmup_video_views_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'patient_diary_day_snapshots_organization_id_fkey'
      AND conrelid = 'patient_diary_day_snapshots'::regclass
  ) THEN
    ALTER TABLE patient_diary_day_snapshots
      ADD CONSTRAINT patient_diary_day_snapshots_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'patient_home_blocks_organization_id_fkey'
      AND conrelid = 'patient_home_blocks'::regclass
  ) THEN
    ALTER TABLE patient_home_blocks
      ADD CONSTRAINT patient_home_blocks_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'patient_practice_completions_organization_id_fkey'
      AND conrelid = 'patient_practice_completions'::regclass
  ) THEN
    ALTER TABLE patient_practice_completions
      ADD CONSTRAINT patient_practice_completions_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'symptom_entries_organization_id_fkey'
      AND conrelid = 'symptom_entries'::regclass
  ) THEN
    ALTER TABLE symptom_entries
      ADD CONSTRAINT symptom_entries_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'symptom_trackings_organization_id_fkey'
      AND conrelid = 'symptom_trackings'::regclass
  ) THEN
    ALTER TABLE symptom_trackings
      ADD CONSTRAINT symptom_trackings_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
DECLARE
  v_multi_org_count bigint;
BEGIN
  WITH patient_refs(platform_user_id) AS (
    SELECT user_id FROM patient_daily_warmup_presentations
    UNION
    SELECT user_id FROM patient_daily_warmup_video_views
    UNION
    SELECT platform_user_id FROM patient_diary_day_snapshots
    UNION
    SELECT user_id FROM patient_practice_completions
    UNION
    SELECT platform_user_id FROM symptom_entries
    UNION
    SELECT platform_user_id FROM symptom_trackings
  ),
  active_org_counts AS (
    SELECT
      refs.platform_user_id,
      count(DISTINCT enrollments.organization_id) AS organization_count
    FROM patient_refs refs
    LEFT JOIN org_enrollments enrollments
      ON enrollments.platform_user_id = refs.platform_user_id
     AND enrollments.status = 'active'
    GROUP BY refs.platform_user_id
  )
  SELECT count(*)::bigint
  INTO v_multi_org_count
  FROM active_org_counts
  WHERE organization_count > 1;

  IF v_multi_org_count <> 0 THEN
    RAISE EXCEPTION 'P0.4.P4 expected no multi-org patient-owned rows, found % patient keys', v_multi_org_count;
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
    RAISE EXCEPTION 'P0.4.P4 expected default organization %, found %', v_default_org_id, v_org_count;
  END IF;

  UPDATE patient_home_blocks
  SET organization_id = v_default_org_id
  WHERE organization_id IS NULL;
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
  UPDATE patient_daily_warmup_presentations target
  SET organization_id = COALESCE(resolved_patient_org.organization_id, v_default_org_id)
  FROM resolved_patient_org
  WHERE target.organization_id IS NULL
    AND target.user_id = resolved_patient_org.platform_user_id;

  UPDATE patient_daily_warmup_presentations
  SET organization_id = v_default_org_id
  WHERE organization_id IS NULL;
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
  UPDATE patient_practice_completions target
  SET organization_id = COALESCE(resolved_patient_org.organization_id, v_default_org_id)
  FROM resolved_patient_org
  WHERE target.organization_id IS NULL
    AND target.user_id = resolved_patient_org.platform_user_id;

  UPDATE patient_practice_completions
  SET organization_id = v_default_org_id
  WHERE organization_id IS NULL;
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
  UPDATE patient_daily_warmup_video_views target
  SET organization_id = COALESCE(
    presentation.organization_id,
    resolved_patient_org.organization_id,
    v_default_org_id
  )
  FROM patient_daily_warmup_video_views view_for_join
  LEFT JOIN patient_daily_warmup_presentations presentation
    ON presentation.user_id = view_for_join.user_id
  LEFT JOIN resolved_patient_org
    ON resolved_patient_org.platform_user_id = view_for_join.user_id
  WHERE target.organization_id IS NULL
    AND target.id = view_for_join.id;
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
  UPDATE patient_diary_day_snapshots target
  SET organization_id = COALESCE(resolved_patient_org.organization_id, v_default_org_id)
  FROM resolved_patient_org
  WHERE target.organization_id IS NULL
    AND target.platform_user_id = resolved_patient_org.platform_user_id;

  UPDATE patient_diary_day_snapshots
  SET organization_id = v_default_org_id
  WHERE organization_id IS NULL;
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
  UPDATE symptom_trackings target
  SET organization_id = COALESCE(resolved_patient_org.organization_id, v_default_org_id)
  FROM resolved_patient_org
  WHERE target.organization_id IS NULL
    AND target.platform_user_id = resolved_patient_org.platform_user_id;

  UPDATE symptom_trackings
  SET organization_id = v_default_org_id
  WHERE organization_id IS NULL;
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
  UPDATE symptom_entries target
  SET organization_id = COALESCE(
    tracking.organization_id,
    completion.organization_id,
    resolved_patient_org.organization_id,
    v_default_org_id
  )
  FROM symptom_entries entry_for_join
  LEFT JOIN symptom_trackings tracking
    ON tracking.id = entry_for_join.tracking_id
  LEFT JOIN patient_practice_completions completion
    ON completion.id = entry_for_join.patient_practice_completion_id
  LEFT JOIN resolved_patient_org
    ON resolved_patient_org.platform_user_id = entry_for_join.platform_user_id
  WHERE target.organization_id IS NULL
    AND target.id = entry_for_join.id;
END $$;

DO $$
DECLARE
  v_null_count bigint;
BEGIN
  SELECT sum(null_rows)
  INTO v_null_count
  FROM (
    SELECT count(*) FILTER (WHERE organization_id IS NULL) AS null_rows FROM patient_daily_warmup_presentations
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM patient_daily_warmup_video_views
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM patient_diary_day_snapshots
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM patient_home_blocks
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM patient_practice_completions
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM symptom_entries
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM symptom_trackings
  ) checks;

  IF v_null_count <> 0 THEN
    RAISE EXCEPTION 'P0.4.P4 expected no NULL organization_id rows, found %', v_null_count;
  END IF;
END $$;
