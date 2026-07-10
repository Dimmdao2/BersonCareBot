ALTER TABLE online_intake_requests
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE online_intake_answers
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE online_intake_attachments
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE online_intake_status_history
  ADD COLUMN IF NOT EXISTS organization_id uuid;

CREATE INDEX IF NOT EXISTS idx_online_intake_requests_organization_id
  ON online_intake_requests USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_online_intake_answers_organization_id
  ON online_intake_answers USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_online_intake_attachments_organization_id
  ON online_intake_attachments USING btree (organization_id);
CREATE INDEX IF NOT EXISTS idx_online_intake_status_history_organization_id
  ON online_intake_status_history USING btree (organization_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'online_intake_requests_organization_id_fkey'
      AND conrelid = 'online_intake_requests'::regclass
  ) THEN
    ALTER TABLE online_intake_requests
      ADD CONSTRAINT online_intake_requests_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'online_intake_answers_organization_id_fkey'
      AND conrelid = 'online_intake_answers'::regclass
  ) THEN
    ALTER TABLE online_intake_answers
      ADD CONSTRAINT online_intake_answers_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'online_intake_attachments_organization_id_fkey'
      AND conrelid = 'online_intake_attachments'::regclass
  ) THEN
    ALTER TABLE online_intake_attachments
      ADD CONSTRAINT online_intake_attachments_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES be_organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'online_intake_status_history_organization_id_fkey'
      AND conrelid = 'online_intake_status_history'::regclass
  ) THEN
    ALTER TABLE online_intake_status_history
      ADD CONSTRAINT online_intake_status_history_organization_id_fkey
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
    RAISE EXCEPTION 'P0.4.P5 expected default organization %, found %', v_default_org_id, v_org_count;
  END IF;
END $$;

DO $$
DECLARE
  v_multi_org_count bigint;
BEGIN
  WITH active_org_counts AS (
    SELECT
      request.user_id,
      count(DISTINCT enrollment.organization_id) AS organization_count
    FROM online_intake_requests request
    LEFT JOIN org_enrollments enrollment
      ON enrollment.platform_user_id = request.user_id
     AND enrollment.status = 'active'
    GROUP BY request.user_id
  )
  SELECT count(*)::bigint
  INTO v_multi_org_count
  FROM active_org_counts
  WHERE organization_count > 1;

  IF v_multi_org_count <> 0 THEN
    RAISE EXCEPTION 'P0.4.P5 expected no multi-org online intake request users, found % patient keys', v_multi_org_count;
  END IF;
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
  UPDATE online_intake_requests target
  SET organization_id = COALESCE(resolved_patient_org.organization_id, v_default_org_id)
  FROM online_intake_requests request_for_join
  LEFT JOIN resolved_patient_org
    ON resolved_patient_org.platform_user_id = request_for_join.user_id
  WHERE target.organization_id IS NULL
    AND target.id = request_for_join.id;
END $$;

UPDATE online_intake_answers target
SET organization_id = parent.organization_id
FROM online_intake_requests parent
WHERE target.organization_id IS NULL
  AND target.request_id = parent.id
  AND parent.organization_id IS NOT NULL;

UPDATE online_intake_attachments target
SET organization_id = parent.organization_id
FROM online_intake_requests parent
WHERE target.organization_id IS NULL
  AND target.request_id = parent.id
  AND parent.organization_id IS NOT NULL;

UPDATE online_intake_status_history target
SET organization_id = parent.organization_id
FROM online_intake_requests parent
WHERE target.organization_id IS NULL
  AND target.request_id = parent.id
  AND parent.organization_id IS NOT NULL;

DO $$
DECLARE
  v_null_count bigint;
BEGIN
  SELECT sum(null_rows)
  INTO v_null_count
  FROM (
    SELECT count(*) FILTER (WHERE organization_id IS NULL) AS null_rows FROM online_intake_requests
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM online_intake_answers
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM online_intake_attachments
    UNION ALL SELECT count(*) FILTER (WHERE organization_id IS NULL) FROM online_intake_status_history
  ) checks;

  IF v_null_count <> 0 THEN
    RAISE EXCEPTION 'P0.4.P5 expected no NULL organization_id rows, found %', v_null_count;
  END IF;
END $$;
