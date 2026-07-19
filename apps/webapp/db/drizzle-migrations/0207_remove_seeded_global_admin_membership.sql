-- C2 identity repair. Migration 0143 historically enrolled the platform-global
-- administrator into the default clinic. Invites cannot produce this shape: accept
-- normalizes the platform account to `doctor`, and clinic admins live in the
-- membership role. Remove only that legacy seed row, never the platform identity.
DO $$
DECLARE
  v_default_org_id constant uuid := 'a0000000-0000-4000-8000-000000000001';
  v_remaining_count integer;
BEGIN
  DELETE FROM be_organization_members AS m
  USING platform_users AS pu
  WHERE m.organization_id = v_default_org_id
    AND m.platform_user_id = pu.id
    AND m.role = 'admin'
    AND m.specialist_id IS NULL
    AND m.status = 'active'
    AND pu.role = 'admin'
    AND pu.merged_into_id IS NULL
    AND pu.is_archived IS FALSE;

  SELECT count(*)::integer
  INTO v_remaining_count
  FROM be_organization_members AS m
  JOIN platform_users AS pu ON pu.id = m.platform_user_id
  WHERE m.organization_id = v_default_org_id
    AND m.role = 'admin'
    AND m.specialist_id IS NULL
    AND m.status = 'active'
    AND pu.role = 'admin'
    AND pu.merged_into_id IS NULL
    AND pu.is_archived IS FALSE;

  IF v_remaining_count <> 0 THEN
    RAISE EXCEPTION 'C2 global-admin membership repair left seeded rows=%', v_remaining_count;
  END IF;
END $$;
