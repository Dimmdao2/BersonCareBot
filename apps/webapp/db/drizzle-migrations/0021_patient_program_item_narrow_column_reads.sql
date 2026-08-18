-- BCB-MIGRATION-OWNER: app_seam_patient_self_actions_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- TEMPORARY LOCAL MIGRATION NUMBER 0021
--
-- Same class as 0020, this time on the patient program-item seam. Three reads inside two roots owned
-- by app_seam_patient_self_actions_owner pull a whole row (`alias.*` / `RETURNING *` into a %ROWTYPE
-- variable) from a relation on which that owner deliberately holds only column-level SELECT:
--
--   app.touch_current_patient_program_item    -> public.treatment_program_instance_stages       (SELECT s.* / RETURNING *)
--   app.complete_current_patient_program_item -> public.treatment_program_instance_stage_items  (SELECT si.*)
--   app.complete_current_patient_program_item -> public.treatment_program_instance_stages       (SELECT s.*)
--
-- A star expands to every column of the relation at parse time, so the executor demands column
-- privileges the declaration withholds and PostgreSQL answers "permission denied for table ..."
-- (42501). Consequence for a real person: a patient who opens or marks done an item of their own
-- rehabilitation programme gets a failed action, every time.
--
-- Resolution is to stop reading columns the seams do not use, NOT to widen the grants. The withheld
-- columns are the clinician-authored stage narrative (title, description, goals, objectives,
-- skip_reason, local_comment, source_stage_id, expected_duration_days, expected_duration_text) and
-- the item authoring fields (sort_order, comment, local_comment, settings, group_id, created_at);
-- neither root consumes any of them. Every column named below is already inside the declared surface
-- in deploy/postgres/privileges/declaration.ts (PATIENT_PROGRAM_CORE_SURFACES), so this migration adds
-- no GRANT, no REVOKE and no other DDL.
--
-- Consumption that had to be preserved, measured field by field on the shipped bodies:
--   touch:    v_stage.status, v_stage.id, and the returned to_jsonb(v_stage) payload — the caller
--             (apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts) only tests it for
--             truthiness, so the payload is rebuilt from exactly the declared stage surface.
--   complete: v_item.stage_id, v_item.item_type, v_item.completed_at; v_stage.status, v_stage.id.
--             The return value was already a narrow jsonb_build_object and is unchanged.

CREATE OR REPLACE FUNCTION app.touch_current_patient_program_item(
  p_instance_id uuid, p_item_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_stage_id uuid;
  v_stage_organization_id uuid;
  v_stage_instance_id uuid;
  v_stage_sort_order integer;
  v_stage_status text;
  v_stage_started_at timestamp with time zone;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  SELECT s.id, s.organization_id, s.instance_id, s.sort_order, s.status, s.started_at
  INTO v_stage_id, v_stage_organization_id, v_stage_instance_id,
       v_stage_sort_order, v_stage_status, v_stage_started_at
  FROM public.treatment_program_instance_stages s
  JOIN public.treatment_program_instance_stage_items si ON si.stage_id = s.id
  JOIN public.treatment_program_instances i ON i.id = s.instance_id
  WHERE i.id = p_instance_id AND si.id = p_item_id
    AND i.organization_id = v_org AND i.patient_user_id = v_patient AND i.status = 'active'
    AND s.organization_id = v_org AND si.organization_id = v_org
    AND si.status = 'active' AND (s.sort_order = 0 OR s.status NOT IN ('locked', 'skipped'))
  FOR UPDATE OF s;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'current_patient_program_item_not_accessible' USING ERRCODE = 'P0001';
  END IF;
  IF v_stage_status = 'available' THEN
    UPDATE public.treatment_program_instance_stages s
    SET status = 'in_progress', started_at = coalesce(s.started_at, statement_timestamp())
    WHERE s.id = v_stage_id
    RETURNING s.id, s.organization_id, s.instance_id, s.sort_order, s.status, s.started_at
    INTO v_stage_id, v_stage_organization_id, v_stage_instance_id,
         v_stage_sort_order, v_stage_status, v_stage_started_at;
    INSERT INTO public.treatment_program_events (
      organization_id, instance_id, actor_id, event_type, target_type, target_id, payload
    ) VALUES (
      v_org, p_instance_id, v_patient, 'status_changed', 'stage', v_stage_id,
      jsonb_build_object('scope', 'stage', 'from', 'available', 'to', 'in_progress')
    );
  END IF;
  RETURN jsonb_build_object(
    'id', v_stage_id,
    'organization_id', v_stage_organization_id,
    'instance_id', v_stage_instance_id,
    'sort_order', v_stage_sort_order,
    'status', v_stage_status,
    'started_at', v_stage_started_at
  );
END
$function$;

CREATE OR REPLACE FUNCTION app.complete_current_patient_program_item(
  p_instance_id uuid, p_item_id uuid, p_repeat_cooldown_minutes integer, p_metrics_text text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_item_stage_id uuid;
  v_item_item_type text;
  v_item_completed_at timestamp with time zone;
  v_stage_id uuid;
  v_stage_status text;
  v_completion_id uuid;
  v_created_at timestamp with time zone;
  v_now timestamp with time zone := statement_timestamp();
  v_payload jsonb;
  v_metrics jsonb := p_metrics_text::jsonb;
  v_had_completed boolean;
  v_cooldown integer := least(180, greatest(5, p_repeat_cooldown_minutes));
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_self_actions_owner'::name, ARRAY['app_patient'::name]::name[]
  );
  SELECT si.stage_id, si.item_type, si.completed_at
  INTO v_item_stage_id, v_item_item_type, v_item_completed_at
  FROM public.treatment_program_instance_stage_items si
  JOIN public.treatment_program_instance_stages s ON s.id = si.stage_id
  JOIN public.treatment_program_instances i ON i.id = s.instance_id
  WHERE i.id = p_instance_id AND si.id = p_item_id
    AND i.organization_id = v_org AND i.patient_user_id = v_patient AND i.status = 'active'
    AND s.organization_id = v_org AND si.organization_id = v_org
    AND si.status = 'active' AND (s.sort_order = 0 OR s.status NOT IN ('locked', 'skipped'))
    AND si.item_type <> 'clinical_test'
    AND NOT (si.item_type = 'recommendation' AND si.is_actionable = false)
  FOR UPDATE OF si, s;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'current_patient_program_item_not_completable' USING ERRCODE = 'P0001';
  END IF;
  SELECT s.id, s.status INTO STRICT v_stage_id, v_stage_status
  FROM public.treatment_program_instance_stages s
  WHERE s.id = v_item_stage_id;
  IF EXISTS (
    SELECT 1 FROM public.program_action_log l
    WHERE l.organization_id = v_org AND l.patient_user_id = v_patient
      AND l.instance_id = p_instance_id AND l.instance_stage_item_id = p_item_id
      AND l.action_type = 'done' AND l.payload->>'source' = 'simple_item_complete'
      AND l.created_at > v_now - make_interval(mins => v_cooldown)
  ) THEN
    RAISE EXCEPTION 'completion_cooldown_active' USING ERRCODE = 'P0001';
  END IF;
  IF v_metrics ? 'perceivedDifficulty'
     AND v_metrics->>'perceivedDifficulty' NOT IN ('easy', 'medium', 'hard') THEN
    RAISE EXCEPTION 'completion_metrics_invalid' USING ERRCODE = 'P0001';
  END IF;
  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'source', 'simple_item_complete', 'itemType', v_item_item_type,
    'perceivedDifficulty', v_metrics->'perceivedDifficulty',
    'reps', v_metrics->'reps', 'sets', v_metrics->'sets', 'weightKg', v_metrics->'weightKg'
  ));
  v_had_completed := v_item_completed_at IS NOT NULL;
  IF v_stage_status = 'available' THEN
    UPDATE public.treatment_program_instance_stages s
    SET status = 'in_progress', started_at = coalesce(s.started_at, v_now)
    WHERE s.id = v_stage_id;
    INSERT INTO public.treatment_program_events (
      organization_id, instance_id, actor_id, event_type, target_type, target_id, payload
    ) VALUES (
      v_org, p_instance_id, v_patient, 'status_changed', 'stage', v_stage_id,
      jsonb_build_object('scope', 'stage', 'from', 'available', 'to', 'in_progress')
    );
  END IF;
  UPDATE public.treatment_program_instance_stage_items si SET completed_at = v_now
  WHERE si.id = p_item_id;
  UPDATE public.treatment_program_instances i SET updated_at = v_now
  WHERE i.id = p_instance_id AND i.organization_id = v_org AND i.patient_user_id = v_patient;
  INSERT INTO public.program_action_log (
    organization_id, instance_id, instance_stage_item_id, patient_user_id,
    session_id, action_type, payload, note, created_at
  ) VALUES (
    v_org, p_instance_id, p_item_id, v_patient, NULL, 'done', v_payload, NULL, v_now
  ) RETURNING id, created_at INTO v_completion_id, v_created_at;
  IF NOT v_had_completed THEN
    INSERT INTO public.treatment_program_events (
      organization_id, instance_id, actor_id, event_type, target_type, target_id, payload
    ) VALUES (
      v_org, p_instance_id, v_patient, 'status_changed', 'stage_item', p_item_id,
      jsonb_build_object('scope', 'stage_item', 'field', 'completedAt',
                         'value', v_now, 'stageId', v_stage_id)
    );
  END IF;
  RETURN jsonb_build_object('id', v_completion_id, 'createdAt', v_created_at,
                            'payload', v_payload, 'hadCompleted', v_had_completed);
END
$function$;
