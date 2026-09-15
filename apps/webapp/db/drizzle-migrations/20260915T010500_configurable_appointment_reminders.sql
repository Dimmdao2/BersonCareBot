-- BCB-MIGRATION-BACKFILL
-- BCB-MIGRATION-VERIFY: SELECT NOT EXISTS (SELECT 1 FROM public.be_appointments WHERE appointment_reminder_preset_id IN ('day_and_two_hours', 'day_before', 'two_hours_before')) AND NOT EXISTS (SELECT 1 FROM public.be_appointments WHERE appointment_reminder_allowed_preset_ids ?| ARRAY['day_and_two_hours', 'day_before', 'two_hours_before']) AND NOT EXISTS (SELECT 1 FROM public.be_organizations AS organization WHERE NOT EXISTS (SELECT 1 FROM public.system_settings AS setting WHERE setting.organization_id = organization.id AND setting.key = 'doctor_appointment_reminder_offsets_minutes' AND setting.scope = 'doctor'))
-- N-5 (owner, 2026-09-15): existing organizations keep the actual schedule selected in the old
-- specialist form. The org row is persisted; absence never acquires a runtime default.
WITH ranked_specialists AS (
  SELECT specialist.organization_id,
         specialist.appointment_reminder_default_preset_id,
         row_number() OVER (
           PARTITION BY specialist.organization_id
           ORDER BY specialist.is_active DESC, specialist.sort_order ASC, specialist.id ASC
         ) AS position
  FROM public.be_specialists AS specialist
), migrated AS (
  SELECT organization.id AS organization_id,
         CASE selected.appointment_reminder_default_preset_id
           WHEN 'day_and_two_hours' THEN '[1440,120]'::jsonb
           WHEN 'day_before' THEN '[1440]'::jsonb
           WHEN 'two_hours_before' THEN '[120]'::jsonb
           ELSE '[]'::jsonb
         END AS offsets
  FROM public.be_organizations AS organization
  LEFT JOIN ranked_specialists AS selected
    ON selected.organization_id = organization.id
   AND selected.position = 1
)
INSERT INTO public.system_settings (
  key, scope, organization_id, value_json, updated_at, updated_by
)
SELECT 'doctor_appointment_reminder_offsets_minutes',
       'doctor',
       migrated.organization_id,
       pg_catalog.jsonb_build_object('value', migrated.offsets),
       pg_catalog.now(),
       NULL
FROM migrated
ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL
DO UPDATE SET value_json = EXCLUDED.value_json,
              updated_at = EXCLUDED.updated_at,
              updated_by = NULL;
--> statement-breakpoint
-- BCB-MIGRATION-BACKFILL
-- Appointment rows are immutable schedule snapshots. Translate both the available choices and the
-- patient's current choice in place, so queued/rescheduled visits keep the same minute offsets.
UPDATE public.be_appointments AS appointment
SET appointment_reminder_allowed_preset_ids =
      CASE
        WHEN appointment.appointment_reminder_allowed_preset_ids ? 'day_and_two_hours'
          THEN '[1440,120]'::jsonb
        WHEN appointment.appointment_reminder_allowed_preset_ids ? 'day_before'
         AND appointment.appointment_reminder_allowed_preset_ids ? 'two_hours_before'
          THEN '[1440,120]'::jsonb
        WHEN appointment.appointment_reminder_allowed_preset_ids ? 'day_before'
          THEN '[1440]'::jsonb
        WHEN appointment.appointment_reminder_allowed_preset_ids ? 'two_hours_before'
          THEN '[120]'::jsonb
        ELSE '[]'::jsonb
      END,
    appointment_reminder_preset_id =
      CASE appointment.appointment_reminder_preset_id
        WHEN 'day_and_two_hours' THEN '[1440,120]'
        WHEN 'day_before' THEN '[1440]'
        WHEN 'two_hours_before' THEN '[120]'
        ELSE appointment.appointment_reminder_preset_id
      END,
    updated_at = pg_catalog.now()
WHERE appointment.appointment_reminder_preset_id IN (
        'day_and_two_hours', 'day_before', 'two_hours_before'
      )
   OR appointment.appointment_reminder_allowed_preset_ids ?| ARRAY[
        'day_and_two_hours', 'day_before', 'two_hours_before'
      ];
--> statement-breakpoint
-- BCB-MIGRATION-BACKFILL
-- Empty offsets now express disabled reminders; the boolean neighbor no longer has a reader.
DELETE FROM public.system_settings
WHERE key = 'doctor_appointment_reminder_enabled'
  AND scope = 'doctor';
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_specialist_provision_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.seed_reference_catalog_after_organization_insert()
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.strpos(p.prosrc, 'doctor_appointment_reminder_offsets_minutes') > 0 FROM pg_catalog.pg_proc AS p WHERE p.oid = pg_catalog.to_regprocedure('app.seed_reference_catalog_after_organization_insert()')
-- New organizations receive the owner-selected two periods as a real per-org row in the existing
-- creation trigger. ON CONFLICT preserves an explicitly seeded value in setup/import flows.
CREATE OR REPLACE FUNCTION app.seed_reference_catalog_after_organization_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  INSERT INTO public.system_settings (
    key, scope, organization_id, value_json, updated_at, updated_by
  ) VALUES (
    'doctor_appointment_reminder_offsets_minutes',
    'doctor',
    NEW.id,
    '{"value":[1440,120]}'::jsonb,
    pg_catalog.now(),
    NULL
  )
  ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL DO NOTHING;

  PERFORM app.seed_reference_catalog_snapshot(NEW.id);
  RETURN NEW;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_settings_runtime_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.read_current_patient_ui_setting(text,text)
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.strpos(p.prosrc, 'doctor_appointment_reminder_offsets_minutes') > 0 FROM pg_catalog.pg_proc AS p WHERE p.oid = pg_catalog.to_regprocedure('app.read_current_patient_ui_setting(text,text)')
-- The existing fixed-key patient settings door gains exactly the schedule key needed while the
-- patient creates an appointment. Enrollment remains the tenant boundary.
CREATE OR REPLACE FUNCTION app.read_current_patient_ui_setting(p_key text, p_scope text)
RETURNS TABLE(
  key text,
  scope text,
  organization_id uuid,
  value_json jsonb,
  updated_at timestamptz,
  updated_by uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_organization_id uuid;
  v_patient_user_id uuid;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_settings_runtime_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );

  v_organization_id := app.current_org_id();
  v_patient_user_id := app.current_patient_user_id();
  IF v_patient_user_id IS NULL THEN
    RETURN;
  END IF;
  IF NOT (
    (
      p_scope = 'admin'
      AND p_key IN (
        'patient_home_mood_icons',
        'patient_home_daily_warmup_repeat_cooldown_minutes',
        'patient_home_daily_warmup_rotation_enabled',
        'patient_home_daily_warmup_rotation_times',
        'patient_home_daily_practice_target',
        'notifications_topics',
        'patient_default_promo_treatment_program_template_id',
        'booking_lifecycle_notifications'
      )
    )
    OR (
      p_scope = 'doctor'
      AND p_key IN (
        'doctor_workspace_composition',
        'doctor_workspace_client_defaults',
        'doctor_patient_support_comments_without_support_default_enabled',
        'doctor_patient_support_media_without_support_default_enabled',
        'doctor_appointment_reminder_offsets_minutes',
        'patient_label'
      )
    )
  ) THEN
    RETURN;
  END IF;
  IF v_organization_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.org_enrollments AS enrollment
    WHERE enrollment.organization_id = v_organization_id
      AND enrollment.platform_user_id = v_patient_user_id
      AND enrollment.status = 'active'
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT setting.key,
         setting.scope,
         setting.organization_id,
         setting.value_json,
         setting.updated_at,
         setting.updated_by
  FROM public.system_settings AS setting
  WHERE setting.key = p_key
    AND setting.scope = p_scope
    AND (
      setting.organization_id IS NULL
      OR (v_organization_id IS NOT NULL AND setting.organization_id = v_organization_id)
    )
  ORDER BY setting.organization_id IS NULL ASC
  LIMIT 1;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_booking_owner
DROP FUNCTION IF EXISTS app.set_current_patient_booking_reminder_preset(uuid,text);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT p.prosecdef AND pg_catalog.strpos(p.prosrc, 'booking.patient-reminder-offsets.set') > 0 FROM pg_catalog.pg_proc AS p WHERE p.oid = pg_catalog.to_regprocedure('app.set_current_patient_booking_reminder_offsets(uuid,text)')
CREATE OR REPLACE FUNCTION app.set_current_patient_booking_reminder_offsets(
  p_appointment_id uuid,
  p_offsets_token text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
PARALLEL RESTRICTED
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_offsets jsonb;
  v_updated boolean := false;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_booking_owner'::name,
    'app_patient'::name,
    'patient'::app.port_context_class,
    'booking.patient-reminder-offsets.set',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg
    ]),
    'app.set_current_patient_booking_reminder_offsets(uuid,text)'::regprocedure
  );
  IF v_org IS NULL OR v_patient IS NULL THEN
    RETURN false;
  END IF;

  BEGIN
    v_offsets := COALESCE(p_offsets_token::jsonb, '[]'::jsonb);
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;
  IF pg_catalog.jsonb_typeof(v_offsets) <> 'array'
     OR pg_catalog.jsonb_array_length(v_offsets) > 3
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(v_offsets) AS item(value)
       WHERE pg_catalog.jsonb_typeof(item.value) <> 'number'
          OR (item.value #>> '{}') !~ '^[1-9][0-9]*$'
     )
     OR (
       SELECT pg_catalog.count(*)
       FROM pg_catalog.jsonb_array_elements(v_offsets)
     ) <> (
       SELECT pg_catalog.count(DISTINCT item.value)
       FROM pg_catalog.jsonb_array_elements(v_offsets) AS item(value)
     )
  THEN
    RETURN false;
  END IF;

  UPDATE public.be_appointments AS appointment
  SET appointment_reminder_preset_id =
        CASE WHEN v_offsets = '[]'::jsonb THEN NULL ELSE v_offsets::text END,
      appointment_reminder_selection_source = 'patient',
      updated_at = pg_catalog.now()
  WHERE appointment.id = p_appointment_id
    AND appointment.organization_id = v_org
    AND appointment.platform_user_id = v_patient
    AND appointment.deleted_at IS NULL
    AND appointment.status IN ('confirmed', 'rescheduled')
    AND appointment.appointment_reminder_allowed_preset_ids @> v_offsets
    AND EXISTS (
      SELECT 1
      FROM public.org_enrollments AS enrollment
      WHERE enrollment.organization_id = v_org
        AND enrollment.platform_user_id = v_patient
        AND enrollment.status = 'active'
    )
  RETURNING true INTO v_updated;

  RETURN COALESCE(v_updated, false);
END
$function$;
