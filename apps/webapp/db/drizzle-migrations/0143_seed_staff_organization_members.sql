DO $$
DECLARE
  v_default_org_id constant uuid := 'a0000000-0000-4000-8000-000000000001';
  v_primary_specialist_id constant uuid := '518ea988-9b5e-4ad8-8194-a2d98f43bd7b';
  v_org_count integer;
  v_specialist_org_id uuid;
  v_specialist_active boolean;
  v_primary_appt_count integer;
  v_doctor_count integer;
  v_seeded_doctor_count integer;
BEGIN
  SELECT count(*)::integer
  INTO v_org_count
  FROM be_organizations
  WHERE id = v_default_org_id;

  IF v_org_count <> 1 THEN
    RAISE EXCEPTION 'P0.1.2 seed expected default organization %, found %', v_default_org_id, v_org_count;
  END IF;

  SELECT organization_id, is_active
  INTO v_specialist_org_id, v_specialist_active
  FROM be_specialists
  WHERE id = v_primary_specialist_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'P0.1.2 seed expected primary specialist % to exist', v_primary_specialist_id;
  END IF;

  IF v_specialist_org_id <> v_default_org_id OR v_specialist_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'P0.1.2 seed expected specialist % to be active in default organization %', v_primary_specialist_id, v_default_org_id;
  END IF;

  SELECT count(*)::integer
  INTO v_primary_appt_count
  FROM be_appointments
  WHERE specialist_id = v_primary_specialist_id;

  IF v_primary_appt_count <= 0 THEN
    RAISE EXCEPTION 'P0.1.2 seed expected primary specialist % to have appointments; inactive duplicate must not be selected', v_primary_specialist_id;
  END IF;

  SELECT count(*)::integer
  INTO v_doctor_count
  FROM platform_users
  WHERE role = 'doctor'
    AND merged_into_id IS NULL
    AND is_archived IS FALSE;

  IF v_doctor_count <> 1 THEN
    RAISE EXCEPTION 'P0.1.2 seed expected 1 doctor, found doctors=%', v_doctor_count;
  END IF;

  INSERT INTO be_organization_members (
    organization_id,
    platform_user_id,
    role,
    specialist_id,
    status
  )
  SELECT
    v_default_org_id,
    pu.id,
    pu.role,
    CASE WHEN pu.role = 'doctor' THEN v_primary_specialist_id ELSE NULL END,
    'active'
  FROM platform_users pu
  WHERE pu.role = 'doctor'
    AND pu.merged_into_id IS NULL
    AND pu.is_archived IS FALSE
  ON CONFLICT (organization_id, platform_user_id) DO UPDATE
    SET role = EXCLUDED.role,
        specialist_id = EXCLUDED.specialist_id,
        status = EXCLUDED.status,
        updated_at = now();

  SELECT count(*)::integer
  INTO v_seeded_doctor_count
  FROM be_organization_members
  WHERE organization_id = v_default_org_id
    AND role = 'doctor'
    AND specialist_id = v_primary_specialist_id
    AND status = 'active';

  IF v_seeded_doctor_count <> 1 THEN
    RAISE EXCEPTION 'P0.1.2 seed expected membership rows doctor=1, found doctor=%', v_seeded_doctor_count;
  END IF;
END $$;
