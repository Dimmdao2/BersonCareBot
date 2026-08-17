-- BCB-MIGRATION-OWNER: app_seam_patient_self_actions_owner
CREATE OR REPLACE FUNCTION app.read_current_patient_fio()
RETURNS TABLE(last_name text, first_name text, patronymic text, display_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_patient uuid := app.current_patient_user_id();
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );
  RETURN QUERY
  SELECT i.last_name, i.first_name, i.patronymic, i.display_name
  FROM public.user_identity i
  JOIN public.platform_users u ON u.id = i.platform_user_id
  WHERE i.platform_user_id = v_patient
    AND u.role = 'client'
    AND u.merged_into_id IS NULL;
END
$function$;

CREATE OR REPLACE FUNCTION app.update_current_patient_fio(
  p_last_name text,
  p_first_name text,
  p_patronymic text
)
RETURNS TABLE(last_name text, first_name text, patronymic text, display_name text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_patient uuid := app.current_patient_user_id();
  v_display text := concat_ws(' ', p_last_name, p_first_name, nullif(p_patronymic, ''));
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );
  IF nullif(btrim(p_last_name), '') IS NULL OR nullif(btrim(p_first_name), '') IS NULL THEN
    RAISE EXCEPTION 'fio_required';
  END IF;

  UPDATE public.platform_users u
  SET last_name = p_last_name,
      first_name = p_first_name,
      patronymic = nullif(p_patronymic, ''),
      display_name = v_display,
      updated_at = now()
  WHERE u.id = v_patient AND u.role = 'client' AND u.merged_into_id IS NULL;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO public.user_identity (
    platform_user_id, last_name, first_name, patronymic, display_name, updated_at
  ) VALUES (
    v_patient, p_last_name, p_first_name, nullif(p_patronymic, ''), v_display, now()
  )
  ON CONFLICT (platform_user_id) DO UPDATE
  SET last_name = EXCLUDED.last_name,
      first_name = EXCLUDED.first_name,
      patronymic = EXCLUDED.patronymic,
      display_name = EXCLUDED.display_name,
      updated_at = now();

  INSERT INTO public.admin_audit_log (organization_id, actor_id, action, target_id, details)
  VALUES (app.current_org_id(), v_patient, 'patient_self_fio_updated', v_patient::text, '{}'::jsonb);

  RETURN QUERY SELECT p_last_name, p_first_name, nullif(p_patronymic, ''), v_display;
END
$function$;
