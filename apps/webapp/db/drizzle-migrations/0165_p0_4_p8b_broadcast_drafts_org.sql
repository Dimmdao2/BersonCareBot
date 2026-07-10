-- 0165: P0.4.P8B — broadcast_drafts organization_id materialization (SCOPED, tenant-owned draft state).
-- Follow-up to P0.4.P8 (0153_p0_4_p8_catalog_content_audit_org.sql), which covered
-- broadcast_audit/broadcast_audit_recipients but not the separate WIP broadcast_drafts table
-- (one draft per doctor, last-write-wins — see apps/webapp/migrations/089_broadcast_drafts.sql and
-- 0134_broadcast_drafts_add_media.sql). Tracked in docs/_TODO/SAAS_FOUNDATION/LOG.md (taskdb #648).

ALTER TABLE broadcast_drafts
  ADD COLUMN IF NOT EXISTS organization_id uuid;

CREATE INDEX IF NOT EXISTS idx_broadcast_drafts_organization_id
  ON broadcast_drafts USING btree (organization_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'broadcast_drafts_organization_id_fkey'
      AND conrelid = 'broadcast_drafts'::regclass
  ) THEN
    ALTER TABLE broadcast_drafts
      ADD CONSTRAINT broadcast_drafts_organization_id_fkey
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
    RAISE EXCEPTION 'P0.4.P8B expected default organization %, found %', v_default_org_id, v_org_count;
  END IF;

  WITH user_org AS (
    SELECT platform_user_id, (array_agg(DISTINCT organization_id))[1] AS organization_id
    FROM (
      SELECT platform_user_id, organization_id FROM org_enrollments WHERE status = 'active'
      UNION ALL
      SELECT platform_user_id, organization_id FROM be_organization_members WHERE status = 'active'
    ) orgs
    GROUP BY platform_user_id
    HAVING count(DISTINCT organization_id) = 1
  )
  UPDATE broadcast_drafts target
  SET organization_id = COALESCE(user_org.organization_id, v_default_org_id)
  FROM broadcast_drafts source
  LEFT JOIN user_org
    ON user_org.platform_user_id = source.doctor_user_id
  WHERE target.organization_id IS NULL
    AND target.id = source.id;
END $$;

DO $$
DECLARE
  v_null_count bigint;
BEGIN
  SELECT count(*) FILTER (WHERE organization_id IS NULL)
  INTO v_null_count
  FROM broadcast_drafts;

  IF v_null_count <> 0 THEN
    RAISE EXCEPTION 'P0.4.P8B expected no NULL organization_id rows, found %', v_null_count;
  END IF;
END $$;
