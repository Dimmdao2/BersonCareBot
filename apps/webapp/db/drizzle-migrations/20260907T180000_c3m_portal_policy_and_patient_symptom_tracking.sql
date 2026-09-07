-- BCB-MIGRATION-OWNER: app_object_owner
-- C3M-10: portal deny remains a per-organization nullable override; patient symptom visibility is independent of is_active.
-- BCB-MIGRATION-VERIFY: EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'doctor_patient_support' AND column_name = 'portal_enabled' AND is_nullable = 'YES')
ALTER TABLE public.doctor_patient_support ADD COLUMN portal_enabled boolean;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'symptom_trackings' AND column_name = 'patient_tracking_enabled' AND is_nullable = 'NO' AND column_default IS NOT NULL)
ALTER TABLE public.symptom_trackings ADD COLUMN patient_tracking_enabled boolean NOT NULL DEFAULT true;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_symptom_trackings_patient_visible')
CREATE INDEX IF NOT EXISTS idx_symptom_trackings_patient_visible
  ON public.symptom_trackings (platform_user_id, updated_at DESC)
  WHERE deleted_at IS NULL AND is_active = true AND patient_tracking_enabled = true;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_self_actions_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.record_current_patient_symptom_entry(uuid,integer,text,timestamp with time zone,text)
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.strpos(p.prosrc, 'patient_tracking_enabled = true') > 0 FROM pg_catalog.pg_proc p WHERE p.oid = pg_catalog.to_regprocedure('app.record_current_patient_symptom_entry(uuid,integer,text,timestamp with time zone,text)')
-- Rights analysis: the existing patient action seam and its two declared diary relations are unchanged; this only narrows its tracking predicate.
CREATE OR REPLACE FUNCTION app.record_current_patient_symptom_entry(p_tracking_id uuid, p_value integer, p_entry_type text, p_recorded_at timestamp with time zone, p_notes text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog' AS $function$
DECLARE v_org uuid := app.current_org_id(); v_patient uuid := app.current_patient_user_id(); v_row public.symptom_entries%ROWTYPE;
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_self_actions_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'patient.symptom-entry.record', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg, ROW('timestamptz@1', pg_catalog.timestamptz_send($4))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($5))::app.port_typed_arg]), 'app.record_current_patient_symptom_entry(uuid,integer,text,timestamp with time zone,text)'::regprocedure);
  IF p_value < 0 OR p_value > 10 OR p_entry_type NOT IN ('instant', 'daily') OR p_recorded_at > statement_timestamp() + interval '1 minute'
     OR NOT EXISTS (SELECT 1 FROM public.symptom_trackings t WHERE t.id = p_tracking_id AND t.organization_id = v_org AND t.platform_user_id = v_patient AND t.deleted_at IS NULL AND t.is_active AND t.patient_tracking_enabled = true) THEN
    RAISE EXCEPTION 'current_patient_symptom_entry_rejected' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.symptom_entries (organization_id, user_id, platform_user_id, tracking_id, value_0_10, entry_type, recorded_at, source, notes)
  VALUES (v_org, v_patient::text, v_patient, p_tracking_id, p_value, p_entry_type, p_recorded_at, 'webapp', left(p_notes, 2000)) RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_self_actions_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.update_current_patient_symptom_entry(uuid,integer,text,timestamp with time zone,text)
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.strpos(p.prosrc, 'patient_tracking_enabled = true') > 0 FROM pg_catalog.pg_proc p WHERE p.oid = pg_catalog.to_regprocedure('app.update_current_patient_symptom_entry(uuid,integer,text,timestamp with time zone,text)')
CREATE OR REPLACE FUNCTION app.update_current_patient_symptom_entry(p_entry_id uuid, p_value integer, p_entry_type text, p_recorded_at timestamp with time zone, p_notes text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog' AS $function$
DECLARE v_row public.symptom_entries%ROWTYPE;
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_self_actions_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'patient.symptom-entry.update', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg, ROW('timestamptz@1', pg_catalog.timestamptz_send($4))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($5))::app.port_typed_arg]), 'app.update_current_patient_symptom_entry(uuid,integer,text,timestamp with time zone,text)'::regprocedure);
  IF p_value < 0 OR p_value > 10 OR p_entry_type NOT IN ('instant', 'daily') THEN RAISE EXCEPTION 'current_patient_symptom_entry_rejected' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.symptom_entries e SET value_0_10 = p_value, entry_type = p_entry_type, recorded_at = p_recorded_at, notes = left(p_notes, 2000)
  FROM public.symptom_trackings t
  WHERE e.id = p_entry_id AND e.tracking_id = t.id AND e.organization_id = app.current_org_id() AND e.platform_user_id = app.current_patient_user_id()
    AND t.organization_id = app.current_org_id() AND t.platform_user_id = app.current_patient_user_id() AND t.deleted_at IS NULL AND t.patient_tracking_enabled = true
    AND e.recorded_at >= statement_timestamp() - interval '24 hours' RETURNING e.* INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'current_patient_symptom_entry_not_editable' USING ERRCODE = 'P0001'; END IF;
  RETURN to_jsonb(v_row);
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_self_actions_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.delete_current_patient_symptom_entry(uuid)
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.strpos(p.prosrc, 'patient_tracking_enabled = true') > 0 FROM pg_catalog.pg_proc p WHERE p.oid = pg_catalog.to_regprocedure('app.delete_current_patient_symptom_entry(uuid)')
CREATE OR REPLACE FUNCTION app.delete_current_patient_symptom_entry(p_entry_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog' AS $function$
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_self_actions_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'patient.symptom-entry.delete', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg]), 'app.delete_current_patient_symptom_entry(uuid)'::regprocedure);
  DELETE FROM public.symptom_entries e USING public.symptom_trackings t
  WHERE e.id = p_entry_id AND e.tracking_id = t.id AND e.organization_id = app.current_org_id() AND e.platform_user_id = app.current_patient_user_id()
    AND t.organization_id = app.current_org_id() AND t.platform_user_id = app.current_patient_user_id() AND t.deleted_at IS NULL AND t.patient_tracking_enabled = true
    AND t.symptom_key IS DISTINCT FROM 'general_wellbeing' AND e.recorded_at >= statement_timestamp() - interval '24 hours';
  RETURN FOUND;
END
$function$;
