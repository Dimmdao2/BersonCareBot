DO $$
DECLARE
  v_default_org_id constant uuid := 'a0000000-0000-4000-8000-000000000001';
  v_legacy_owner_phone constant text := '+79643805480';
  v_candidate_count integer;
  v_owner_count integer;
BEGIN
  SELECT count(*)::integer
  INTO v_candidate_count
  FROM be_organization_members m
  JOIN platform_users pu ON pu.id = m.platform_user_id
  WHERE m.organization_id = v_default_org_id
    AND m.status = 'active'
    AND m.role IN ('doctor', 'owner')
    AND pu.role = 'doctor'
    AND pu.phone_normalized = v_legacy_owner_phone
    AND pu.merged_into_id IS NULL
    AND pu.is_archived IS FALSE;

  IF v_candidate_count <> 1 THEN
    RAISE EXCEPTION 'legacy solo owner promotion expected exactly 1 active doctor/owner membership, found %',
      v_candidate_count;
  END IF;

  UPDATE be_organization_members m
  SET role = 'owner',
      updated_at = now()
  FROM platform_users pu
  WHERE pu.id = m.platform_user_id
    AND m.organization_id = v_default_org_id
    AND m.status = 'active'
    AND m.role = 'doctor'
    AND pu.role = 'doctor'
    AND pu.phone_normalized = v_legacy_owner_phone
    AND pu.merged_into_id IS NULL
    AND pu.is_archived IS FALSE;

  SELECT count(*)::integer
  INTO v_owner_count
  FROM be_organization_members m
  JOIN platform_users pu ON pu.id = m.platform_user_id
  WHERE m.organization_id = v_default_org_id
    AND m.status = 'active'
    AND m.role = 'owner'
    AND pu.role = 'doctor'
    AND pu.phone_normalized = v_legacy_owner_phone
    AND pu.merged_into_id IS NULL
    AND pu.is_archived IS FALSE;

  IF v_owner_count <> 1 THEN
    RAISE EXCEPTION 'legacy solo owner promotion did not produce exactly 1 owner membership, found %',
      v_owner_count;
  END IF;
END $$;
