-- BCB-MIGRATION-OWNER: app_seam_patient_self_actions_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.record_current_patient_practice_completion(
  p_content_page_id uuid,
  p_source text,
  p_feeling integer
)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );
  IF v_org IS NULL OR v_patient IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.org_enrollments
    WHERE organization_id = v_org AND platform_user_id = v_patient AND status = 'active'
  ) THEN
    RETURN;
  END IF;
  RETURN QUERY
  INSERT INTO public.patient_practice_completions (
    organization_id, user_id, content_page_id, source, feeling, notes
  ) VALUES (v_org, v_patient, p_content_page_id, p_source, p_feeling, '')
  RETURNING patient_practice_completions.id;
END
$function$;

CREATE OR REPLACE FUNCTION app.upsert_current_patient_material_rating(
  p_target_kind text,
  p_target_id uuid,
  p_stars integer
)
RETURNS TABLE(updated boolean)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );
  IF v_org IS NULL OR v_patient IS NULL OR p_target_kind NOT IN ('content_page', 'lfk_exercise', 'lfk_complex')
     OR p_stars NOT BETWEEN 1 AND 5 OR NOT EXISTS (
       SELECT 1 FROM public.org_enrollments
       WHERE organization_id = v_org AND platform_user_id = v_patient AND status = 'active'
     ) THEN
    RETURN QUERY SELECT false;
    RETURN;
  END IF;
  INSERT INTO public.material_ratings (
    organization_id, user_id, target_kind, target_id, stars, updated_at
  ) VALUES (v_org, v_patient, p_target_kind, p_target_id, p_stars, now())
  ON CONFLICT (user_id, target_kind, target_id) DO UPDATE
  SET stars = EXCLUDED.stars, updated_at = EXCLUDED.updated_at
  WHERE material_ratings.organization_id = v_org;
  RETURN QUERY SELECT true;
END
$function$;
