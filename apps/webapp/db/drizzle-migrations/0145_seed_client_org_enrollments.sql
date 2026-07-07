DO $$
DECLARE
  v_default_org_id constant uuid := 'a0000000-0000-4000-8000-000000000001';
  v_org_count integer;
  v_client_count integer;
  v_enrolled_count integer;
BEGIN
  SELECT count(*)::integer
  INTO v_org_count
  FROM be_organizations
  WHERE id = v_default_org_id;

  IF v_org_count <> 1 THEN
    RAISE EXCEPTION 'P0.3.2 seed expected default organization %, found %', v_default_org_id, v_org_count;
  END IF;

  SELECT count(*)::integer
  INTO v_client_count
  FROM platform_users
  WHERE role = 'client'
    AND merged_into_id IS NULL
    AND is_archived IS FALSE;

  INSERT INTO org_enrollments (
    organization_id,
    platform_user_id,
    status
  )
  SELECT
    v_default_org_id,
    pu.id,
    'active'
  FROM platform_users pu
  WHERE pu.role = 'client'
    AND pu.merged_into_id IS NULL
    AND pu.is_archived IS FALSE
  ON CONFLICT (organization_id, platform_user_id) DO UPDATE
    SET status = EXCLUDED.status;

  SELECT count(*)::integer
  INTO v_enrolled_count
  FROM org_enrollments oe
  JOIN platform_users pu ON pu.id = oe.platform_user_id
  WHERE oe.organization_id = v_default_org_id
    AND oe.status = 'active'
    AND pu.role = 'client'
    AND pu.merged_into_id IS NULL
    AND pu.is_archived IS FALSE;

  IF v_enrolled_count <> v_client_count THEN
    RAISE EXCEPTION 'P0.3.2 seed expected current client enrollments %, found %', v_client_count, v_enrolled_count;
  END IF;
END $$;
