-- BCB-MIGRATION-OWNER: app_seam_patient_self_actions_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- Patient reads one aggregate snapshot and its own value without receiving row-level access to
-- another patient's rating. The exact context gate binds both requested target fields.
CREATE OR REPLACE FUNCTION app.read_current_patient_material_rating_snapshot(
  p_target_kind text,
  p_target_id uuid
)
RETURNS TABLE(
  rating_count bigint,
  avg_stars numeric,
  c1 bigint,
  c2 bigint,
  c3 bigint,
  c4 bigint,
  c5 bigint,
  my_stars integer
)
LANGUAGE plpgsql SECURITY DEFINER STABLE PARALLEL RESTRICTED
SET search_path = pg_catalog, app, public, pg_temp
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_self_actions_owner', 'app_patient', 'patient',
    'patient.material-rating.snapshot.read',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', textsend(p_target_kind))::app.port_typed_arg,
      ROW('uuid@1', uuid_send(p_target_id))::app.port_typed_arg
    ]),
    'app.read_current_patient_material_rating_snapshot(text,uuid)'::regprocedure
  );
  IF p_target_kind <> ALL (ARRAY['content_page', 'lfk_exercise', 'lfk_complex']) THEN
    RAISE EXCEPTION 'unsupported material rating target kind' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    count(*)::bigint,
    avg(rating.stars)::numeric,
    count(*) FILTER (WHERE rating.stars = 1)::bigint,
    count(*) FILTER (WHERE rating.stars = 2)::bigint,
    count(*) FILTER (WHERE rating.stars = 3)::bigint,
    count(*) FILTER (WHERE rating.stars = 4)::bigint,
    count(*) FILTER (WHERE rating.stars = 5)::bigint,
    max(rating.stars) FILTER (
      WHERE rating.user_id = app.current_patient_user_id()
    )::integer
  FROM public.material_ratings AS rating
  WHERE rating.organization_id = app.current_org_id()
    AND rating.target_kind = p_target_kind
    AND rating.target_id = p_target_id;
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- The trigger is the sole audit writer. Runtime principals can mutate only the source setting row;
-- the trigger owner writes the immutable audit record through its generated exact relation surface.
CREATE OR REPLACE FUNCTION public.audit_app_runtime_settings_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  INSERT INTO public.app_runtime_settings_audit (
    key, scope, organization_id, audience, old_value_json, new_value_json, updated_by, source
  ) VALUES (
    NEW.key,
    NEW.scope,
    NEW.organization_id,
    NEW.audience,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.value_json ELSE NULL END,
    NEW.value_json,
    NEW.updated_by,
    COALESCE(NULLIF(current_setting('app.runtime_settings_audit_source', true), ''), 'runtime_store_write')
  );
  RETURN NEW;
END
$function$;
