-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.patient_cancel_pending_reminder_occurrences(text)
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.strpos(p.prosrc, '''app_staff''::name') > 0 AND pg_catalog.strpos(p.prosrc, 'v_target_role = ''app_staff''::name') > 0 FROM pg_catalog.pg_proc AS p WHERE p.oid = pg_catalog.to_regprocedure('app.patient_cancel_pending_reminder_occurrences(text)')
CREATE OR REPLACE FUNCTION app.patient_cancel_pending_reminder_occurrences(p_rule_id text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_target_role name := pg_catalog.current_setting('role', true)::name;
  v_patient_user_id uuid;
  v_org_id uuid := app.current_org_id();
  v_deleted integer := 0;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_reminder_patient_owner'::name,
    ARRAY['app_patient'::name, 'app_staff'::name]::name[]
  );

  IF v_org_id IS NULL THEN RETURN 0; END IF;
  IF v_target_role = 'app_patient'::name THEN
    v_patient_user_id := app.current_patient_user_id();
    IF v_patient_user_id IS NULL THEN RETURN 0; END IF;
  END IF;

  DELETE FROM public.reminder_occurrence_history AS occurrence
  USING public.reminder_rules AS rule
  WHERE occurrence.integrator_rule_id = p_rule_id
    AND occurrence.integrator_rule_id = rule.integrator_rule_id
    AND occurrence.organization_id = v_org_id
    AND rule.organization_id = v_org_id
    AND (
      v_target_role = 'app_staff'::name
      OR (
        occurrence.platform_user_id = v_patient_user_id
        AND rule.platform_user_id = v_patient_user_id
      )
    )
    AND occurrence.status IN ('planned', 'queued');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END
$function$;
