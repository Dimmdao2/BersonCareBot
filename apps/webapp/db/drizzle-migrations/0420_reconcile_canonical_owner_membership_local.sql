-- Reconcile existing databases after 0143's fresh-PROD specialist anchor was corrected from the
-- retired duplicate to the owner-approved canonical specialist.
-- RECONCILES-MIGRATION-HASH: 0143_seed_staff_organization_members

DO $canonical_owner_membership$
DECLARE
  v_organization_id constant uuid := 'a0000000-0000-4000-8000-000000000001';
  v_specialist_id constant uuid := 'c9515025-7224-4d9b-86b6-9cb7d26ea503';
  v_doctor_user_id uuid;
  v_count integer;
BEGIN
  SELECT count(*)::integer
  INTO v_count
  FROM public.platform_users
  WHERE role = 'doctor'
    AND merged_into_id IS NULL
    AND is_archived IS FALSE;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'canonical membership reconcile expected one active doctor, found %', v_count;
  END IF;

  SELECT id
  INTO v_doctor_user_id
  FROM public.platform_users
  WHERE role = 'doctor'
    AND merged_into_id IS NULL
    AND is_archived IS FALSE;

  SELECT count(*)::integer
  INTO v_count
  FROM public.be_specialists
  WHERE id = v_specialist_id
    AND organization_id = v_organization_id
    AND is_active IS TRUE;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'canonical membership reconcile expected one active canonical specialist, found %', v_count;
  END IF;

  SELECT count(*)::integer
  INTO v_count
  FROM public.be_appointments
  WHERE specialist_id = v_specialist_id;

  IF v_count <= 0 THEN
    RAISE EXCEPTION 'canonical membership reconcile expected canonical specialist appointments';
  END IF;

  INSERT INTO public.be_organization_members (
    organization_id,
    platform_user_id,
    role,
    specialist_id,
    status
  ) VALUES (
    v_organization_id,
    v_doctor_user_id,
    'doctor',
    v_specialist_id,
    'active'
  )
  ON CONFLICT (organization_id, platform_user_id) DO UPDATE
  SET role = EXCLUDED.role,
      specialist_id = EXCLUDED.specialist_id,
      status = EXCLUDED.status,
      updated_at = now();

  SELECT count(*)::integer
  INTO v_count
  FROM public.be_organization_members
  WHERE organization_id = v_organization_id
    AND platform_user_id = v_doctor_user_id
    AND role = 'doctor'
    AND specialist_id = v_specialist_id
    AND status = 'active';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'canonical membership reconcile did not converge to one exact row';
  END IF;
END
$canonical_owner_membership$;
