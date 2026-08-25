-- BCB-MIGRATION-BACKFILL
-- BCB-MIGRATION-VERIFY: SELECT (SELECT count(*) = 27 FROM public.system_settings WHERE scope = 'admin' AND organization_id IS NULL AND key LIKE 'auth_surface_%_enabled') AND NOT EXISTS (SELECT 1 FROM (VALUES ('auth_surface_staff_email_enabled', true), ('auth_surface_staff_sms_enabled', false), ('auth_surface_staff_telegram_enabled', false), ('auth_surface_staff_max_enabled', false), ('auth_surface_staff_oauth_google_enabled', false), ('auth_surface_staff_oauth_yandex_enabled', false), ('auth_surface_staff_oauth_vk_enabled', false), ('auth_surface_staff_oauth_apple_enabled', false), ('auth_surface_staff_passkey_enabled', false), ('auth_surface_platform_admin_email_enabled', true), ('auth_surface_platform_admin_sms_enabled', false), ('auth_surface_platform_admin_telegram_enabled', false), ('auth_surface_platform_admin_max_enabled', false), ('auth_surface_platform_admin_oauth_google_enabled', false), ('auth_surface_platform_admin_oauth_yandex_enabled', false), ('auth_surface_platform_admin_oauth_vk_enabled', false), ('auth_surface_platform_admin_oauth_apple_enabled', false), ('auth_surface_platform_admin_passkey_enabled', false), ('auth_surface_patient_email_enabled', true), ('auth_surface_patient_sms_enabled', false), ('auth_surface_patient_telegram_enabled', true), ('auth_surface_patient_max_enabled', true), ('auth_surface_patient_oauth_google_enabled', false), ('auth_surface_patient_oauth_yandex_enabled', true), ('auth_surface_patient_oauth_vk_enabled', false), ('auth_surface_patient_oauth_apple_enabled', false), ('auth_surface_patient_passkey_enabled', false)) AS expected(key, enabled) LEFT JOIN public.system_settings setting ON setting.key = expected.key AND setting.scope = 'admin' AND setting.organization_id IS NULL WHERE setting.value_json IS DISTINCT FROM jsonb_build_object('value', expected.enabled)) AND to_regclass('public.app_runtime_settings') IS NULL AND to_regclass('public.app_runtime_settings_audit') IS NULL AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE prosrc LIKE '%app_runtime_settings%');
--
-- Track D restores the owner contract from AGENTS.md §4: system_settings is the only settings
-- data-root. Rights analysis: the first statement is data-only under the migration administrator.
-- Each following DO block runs as the existing SECURITY DEFINER function owner and only replaces
-- relation reads with system_settings reads; it therefore needs the same SELECT columns
-- (key, scope, organization_id, value_json, updated_at, updated_by) now declared on system_settings.
-- The new authenticated resolver is owned by app_seam_settings_runtime_owner, executable only by
-- app_patient, and returns only registry-classified public/authenticated keys for the accepted
-- patient organization. The final app_object_owner statements remove the obsolete trigger,
-- trigger functions, mirror and mirror audit. No GRANT, REVOKE, role, policy or table creation is
-- present; privilege declaration/reconcile owns execute and relation access.
WITH desired(key, enabled) AS (
  VALUES
    ('auth_surface_staff_email_enabled', true),
    ('auth_surface_staff_sms_enabled', false),
    ('auth_surface_staff_telegram_enabled', false),
    ('auth_surface_staff_max_enabled', false),
    ('auth_surface_staff_oauth_google_enabled', false),
    ('auth_surface_staff_oauth_yandex_enabled', false),
    ('auth_surface_staff_oauth_vk_enabled', false),
    ('auth_surface_staff_oauth_apple_enabled', false),
    ('auth_surface_staff_passkey_enabled', false),
    ('auth_surface_platform_admin_email_enabled', true),
    ('auth_surface_platform_admin_sms_enabled', false),
    ('auth_surface_platform_admin_telegram_enabled', false),
    ('auth_surface_platform_admin_max_enabled', false),
    ('auth_surface_platform_admin_oauth_google_enabled', false),
    ('auth_surface_platform_admin_oauth_yandex_enabled', false),
    ('auth_surface_platform_admin_oauth_vk_enabled', false),
    ('auth_surface_platform_admin_oauth_apple_enabled', false),
    ('auth_surface_platform_admin_passkey_enabled', false),
    ('auth_surface_patient_email_enabled', true),
    ('auth_surface_patient_sms_enabled', false),
    ('auth_surface_patient_telegram_enabled', true),
    ('auth_surface_patient_max_enabled', true),
    ('auth_surface_patient_oauth_google_enabled', false),
    ('auth_surface_patient_oauth_yandex_enabled', true),
    ('auth_surface_patient_oauth_vk_enabled', false),
    ('auth_surface_patient_oauth_apple_enabled', false),
    ('auth_surface_patient_passkey_enabled', false)
)
INSERT INTO public.system_settings (key, scope, organization_id, value_json, updated_at, updated_by)
SELECT key, 'admin', NULL, jsonb_build_object('value', enabled), now(), NULL
FROM desired
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE
SET value_json = EXCLUDED.value_json,
    updated_at = now();

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_self_actions_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.capture_current_patient_diary_day_snapshot(text,text,integer,integer,boolean,uuid,text,text)
CREATE OR REPLACE FUNCTION app.capture_current_patient_diary_day_snapshot(p_local_date text, p_iana text, p_warmup_slot_limit integer, p_warmup_done_count integer, p_warmup_all_done boolean, p_plan_instance_id uuid, p_plan_item_ids text, p_plan_done_mask text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_plan_item_ids jsonb := p_plan_item_ids::jsonb;
  v_plan_done_mask jsonb := p_plan_done_mask::jsonb;
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_self_actions_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'patient.diary-day.snapshot.capture', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($3))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($4))::app.port_typed_arg, ROW('boolean@1', pg_catalog.boolsend($5))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($6))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($7))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($8))::app.port_typed_arg]), 'app.capture_current_patient_diary_day_snapshot(text,text,integer,integer,boolean,uuid,text,text)'::regprocedure);
  IF v_org IS NULL OR v_patient IS NULL OR p_local_date !~ '^\d{4}-\d{2}-\d{2}$'
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = p_iana)
     OR p_iana IS DISTINCT FROM coalesce(
       (SELECT u.calendar_timezone FROM public.platform_users u WHERE u.id = v_patient),
       (SELECT s.value_json->>'value'
        FROM public.system_settings s
        WHERE s.key = 'app_display_timezone'
          AND s.scope = 'admin'
          AND s.organization_id IS NULL
        LIMIT 1),
       'Europe/Moscow'
     )
     OR p_local_date::date >= (statement_timestamp() AT TIME ZONE p_iana)::date
     OR p_warmup_slot_limit < 0 OR p_warmup_done_count < 0
     OR p_warmup_done_count > p_warmup_slot_limit
     OR jsonb_typeof(v_plan_item_ids) <> 'array'
     OR jsonb_typeof(v_plan_done_mask) <> 'array'
     OR jsonb_array_length(v_plan_item_ids) <> jsonb_array_length(v_plan_done_mask)
     OR (p_plan_instance_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.treatment_program_instances i
       WHERE i.id = p_plan_instance_id
         AND i.organization_id = v_org
         AND i.patient_user_id = v_patient
     ))
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements_text(v_plan_item_ids) WITH ORDINALITY item(item_id, ord)
       LEFT JOIN jsonb_array_elements_text(v_plan_done_mask) WITH ORDINALITY done(done_value, ord)
         USING (ord)
       LEFT JOIN public.treatment_program_instance_stage_items si
         ON si.id = item.item_id::uuid
       LEFT JOIN public.treatment_program_instance_stages s
         ON s.id = si.stage_id
       WHERE p_plan_instance_id IS NULL
          OR si.id IS NULL
          OR si.organization_id <> v_org
          OR s.instance_id <> p_plan_instance_id
          OR (done.done_value::boolean) IS DISTINCT FROM EXISTS (
            SELECT 1
            FROM public.program_action_log l
            WHERE l.organization_id = v_org
              AND l.patient_user_id = v_patient
              AND l.instance_id = p_plan_instance_id
              AND l.instance_stage_item_id = si.id
              AND l.action_type = 'done'
              AND (l.created_at AT TIME ZONE p_iana)::date = p_local_date::date
          )
     )
     OR p_warmup_done_count <> (
       SELECT count(*)::integer
       FROM public.patient_practice_completions c
       WHERE c.organization_id = v_org
         AND c.user_id = v_patient
         AND c.source = 'daily_warmup'
         AND (c.completed_at AT TIME ZONE p_iana)::date = p_local_date::date
     )
     OR p_warmup_all_done IS DISTINCT FROM (p_warmup_done_count >= p_warmup_slot_limit) THEN
    RETURN false;
  END IF;
  INSERT INTO public.patient_diary_day_snapshots (
    organization_id, platform_user_id, local_date, iana, warmup_slot_limit,
    warmup_done_count, warmup_all_done, plan_instance_id, plan_item_ids, plan_done_mask
  ) VALUES (
    v_org, v_patient, p_local_date::date, p_iana, p_warmup_slot_limit,
    p_warmup_done_count, p_warmup_all_done, p_plan_instance_id, v_plan_item_ids, v_plan_done_mask
  ) ON CONFLICT (platform_user_id, local_date) DO NOTHING;
  RETURN FOUND;
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_settings_preauth_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.is_telegram_login_configured()
CREATE OR REPLACE FUNCTION app.is_telegram_login_configured()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE PARALLEL RESTRICTED SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
AS $function$
DECLARE configured boolean;
BEGIN
  PERFORM app.require_accepted_context('app_seam_settings_preauth_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'auth.channel.telegram.configured', app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), 'app.is_telegram_login_configured()'::regprocedure);

  SELECT NULLIF(btrim(setting.value_json #>> '{value}'), '') IS NOT NULL INTO configured
    FROM public.system_settings setting
   WHERE setting.key = 'telegram_login_bot_username'
     AND setting.scope = 'admin'
     AND setting.organization_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'runtime_setting_unavailable:telegram_login_bot_username'; END IF;
  RETURN configured;
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.patient_done_reminder_occurrence(text)
CREATE OR REPLACE FUNCTION app.patient_done_reminder_occurrence(p_integrator_occurrence_id text)
 RETURNS TABLE(done_at timestamp with time zone, first_done_for_occurrence boolean, day_done_count integer, day_sent_total integer, day_fully_done boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_patient_user_id uuid;
  v_integrator_user_id bigint;
  v_org_id uuid;
  v_platform_user_id uuid;
  v_occurred_at timestamptz;
  v_existing_done_at timestamptz;
  v_timezone text;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_reminder_patient_owner'::name, ARRAY['app_integrator_request'::name, 'app_patient'::name]::name[]);

  v_org_id := app.current_org_id();
  IF pg_has_role(session_user, 'app_patient', 'MEMBER')
     AND NOT pg_has_role(session_user, 'app_integrator_request', 'MEMBER') THEN
    v_patient_user_id := app.current_patient_user_id();
  ELSIF pg_has_role(session_user, 'app_integrator_request', 'MEMBER')
        AND NOT pg_has_role(session_user, 'app_patient', 'MEMBER') THEN
    v_integrator_user_id := app.current_integrator_user_id();
  ELSE
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'unambiguous reminder callback login required';
  END IF;

  IF v_org_id IS NULL THEN RETURN; END IF;
  IF v_patient_user_id IS NOT NULL THEN
    v_platform_user_id := v_patient_user_id;
  ELSIF v_integrator_user_id IS NOT NULL THEN
    SELECT patient.id INTO v_platform_user_id
    FROM public.platform_users AS patient
    WHERE patient.integrator_user_id = v_integrator_user_id
      AND EXISTS (
        SELECT 1 FROM public.org_enrollments AS enrollment
        WHERE enrollment.platform_user_id = patient.id
          AND enrollment.organization_id = v_org_id AND enrollment.status = 'active'
      )
    LIMIT 1;
  ELSE RETURN;
  END IF;

  SELECT h.done_at, COALESCE(h.sent_at, h.planned_at)
  INTO v_existing_done_at, v_occurred_at
  FROM public.reminder_occurrence_history AS h
  WHERE h.integrator_occurrence_id = p_integrator_occurrence_id
    AND h.platform_user_id = v_platform_user_id
    AND h.organization_id = v_org_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  first_done_for_occurrence := v_existing_done_at IS NULL;
  IF first_done_for_occurrence THEN
    done_at := statement_timestamp();
    UPDATE public.reminder_occurrence_history
    SET done_at = done_at,
        occurred_at = COALESCE(occurred_at, v_occurred_at),
        updated_at = statement_timestamp()
    WHERE integrator_occurrence_id = p_integrator_occurrence_id
      AND platform_user_id = v_platform_user_id
      AND organization_id = v_org_id;
  ELSE
    done_at := v_existing_done_at;
  END IF;

  SELECT setting.value_json ->> 'value' INTO v_timezone
  FROM public.system_settings AS setting
  WHERE setting.key = 'app_display_timezone' AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1;
  IF v_timezone IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_timezone_names WHERE name = v_timezone
  ) THEN RAISE EXCEPTION 'app_display_timezone_unavailable'; END IF;

  SELECT
    COUNT(*) FILTER (WHERE h2.status = 'sent')::integer,
    COUNT(*) FILTER (WHERE h2.status = 'sent' AND h2.done_at IS NOT NULL)::integer
  INTO day_sent_total, day_done_count
  FROM public.reminder_occurrence_history AS h2
  WHERE h2.platform_user_id = v_platform_user_id
    AND h2.organization_id = v_org_id
    AND (COALESCE(h2.occurred_at, h2.sent_at, h2.planned_at) AT TIME ZONE v_timezone)::date =
        (v_occurred_at AT TIME ZONE v_timezone)::date;
  day_fully_done := first_done_for_occurrence AND day_sent_total > 0
    AND day_done_count = day_sent_total;
  RETURN NEXT;
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.patient_set_reminder_mute(integer,boolean)
CREATE OR REPLACE FUNCTION app.patient_set_reminder_mute(p_minutes integer, p_until_tomorrow boolean)
 RETURNS TABLE(muted_until timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_patient_user_id uuid := app.current_patient_user_id();
  v_integrator_user_id bigint := app.current_integrator_user_id();
  v_org_id uuid := app.current_org_id();
  v_platform_user_id uuid;
  v_timezone text;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_reminder_patient_owner'::name, ARRAY['app_patient'::name]::name[]);

  IF v_org_id IS NULL OR (p_until_tomorrow = (p_minutes IS NOT NULL)) THEN RETURN; END IF;
  IF NOT p_until_tomorrow AND p_minutes NOT BETWEEN 1 AND 1440 THEN RETURN; END IF;
  IF v_patient_user_id IS NOT NULL THEN
    v_platform_user_id := v_patient_user_id;
  ELSIF v_integrator_user_id IS NOT NULL THEN
    SELECT patient.id INTO v_platform_user_id
    FROM public.platform_users AS patient
    WHERE patient.integrator_user_id = v_integrator_user_id
      AND EXISTS (
        SELECT 1 FROM public.org_enrollments AS enrollment
        WHERE enrollment.platform_user_id = patient.id
          AND enrollment.organization_id = v_org_id AND enrollment.status = 'active'
      )
    LIMIT 1;
  ELSE RETURN;
  END IF;
  IF v_platform_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.org_enrollments AS enrollment
    WHERE enrollment.platform_user_id = v_platform_user_id
      AND enrollment.organization_id = v_org_id AND enrollment.status = 'active'
  ) THEN RETURN; END IF;

  IF p_until_tomorrow THEN
    SELECT setting.value_json ->> 'value' INTO v_timezone
    FROM public.system_settings AS setting
    WHERE setting.key = 'app_display_timezone'
      AND setting.scope = 'admin'
      AND setting.organization_id IS NULL
    LIMIT 1;
    IF v_timezone IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_timezone_names WHERE name = v_timezone
    ) THEN RAISE EXCEPTION 'app_display_timezone_unavailable'; END IF;
    muted_until := (
      date_trunc('day', statement_timestamp() AT TIME ZONE v_timezone) + interval '1 day'
    ) AT TIME ZONE v_timezone;
  ELSE
    muted_until := statement_timestamp() + make_interval(mins => p_minutes);
  END IF;

  UPDATE public.platform_users
  SET reminder_muted_until = muted_until
  WHERE id = v_platform_user_id;
  RETURN NEXT;
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_settings_runtime_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.read_clinic_platform_integration_availability()
CREATE OR REPLACE FUNCTION app.read_clinic_platform_integration_availability()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE PARALLEL RESTRICTED SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_settings_runtime_owner'::name,
    'app_staff'::name,
    'staff'::app.port_context_class,
    'config.clinic-platform-integration-availability.read',
    app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]),
    'app.read_clinic_platform_integration_availability()'::regprocedure
  );

  RETURN (
    SELECT setting.value_json
      FROM public.system_settings AS setting
     WHERE setting.key = 'platform_integration_availability'
       AND setting.scope = 'admin'
       AND setting.organization_id IS NULL
     LIMIT 1
  );
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: saas_system_health_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
-- BCB-MIGRATION-REHOME-FUNCTION: app.read_curated_system_health_pre_0196()
CREATE OR REPLACE FUNCTION app.read_curated_system_health_pre_0196()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$SELECT app.require_attested_context_for_roles('saas_system_health_owner'::name, ARRAY['saas_telemetry_operator'::name]::name[]);
WITH
runtime_config AS MATERIALIZED (
  SELECT
    COALESCE(bool_or(
      key = 'video_hls_pipeline_enabled'
      AND lower(COALESCE(value_json->>'value', 'false')) = 'true'
    ), false) AS pipeline_enabled,
    COALESCE(bool_or(
      key = 'video_hls_reconcile_enabled'
      AND lower(COALESCE(value_json->>'value', 'false')) = 'true'
    ), false) AS reconcile_enabled,
    COALESCE(bool_or(
      key = 'video_playback_api_enabled'
      AND lower(COALESCE(value_json->>'value', 'false')) = 'true'
    ), false) AS playback_enabled
  FROM public.system_settings
  WHERE organization_id IS NULL
    AND scope = 'admin'
    AND key IN (
      'video_hls_pipeline_enabled',
      'video_hls_reconcile_enabled',
      'video_playback_api_enabled'
    )
),
restricted_config AS MATERIALIZED (
  SELECT
    COALESCE(bool_or(
      key = 'web_push_vapid'
      AND jsonb_typeof(value_json->'value') = 'object'
      AND length(trim(COALESCE(value_json#>>'{value,publicKey}', ''))) > 0
      AND length(trim(COALESCE(value_json#>>'{value,privateKey}', ''))) > 0
    ), false) AS vapid_configured,
    COALESCE(bool_or(
      key = 'smtp_outbound'
      AND jsonb_typeof(value_json->'value') = 'object'
      AND length(trim(COALESCE(value_json#>>'{value,host}', ''))) > 0
      AND length(trim(COALESCE(value_json#>>'{value,user}', ''))) > 0
      AND length(trim(COALESCE(value_json#>>'{value,password}', ''))) > 0
      AND length(trim(COALESCE(value_json#>>'{value,from}', ''))) > 0
      AND CASE
        WHEN COALESCE(value_json#>>'{value,port}', '') ~ '^[0-9]{1,5}$'
        THEN (value_json#>>'{value,port}')::integer BETWEEN 1 AND 65535
        ELSE false
      END
    ), false) AS smtp_configured
  FROM public.system_settings
  WHERE organization_id IS NULL
    AND scope = 'admin'
    AND key IN ('web_push_vapid', 'smtp_outbound')
),
transcode AS MATERIALIZED (
  SELECT jsonb_build_object(
    'pendingCount', count(*) FILTER (WHERE status = 'pending'),
    'processingCount', count(*) FILTER (WHERE status = 'processing'),
    'doneLastHour', count(*) FILTER (
      WHERE status = 'done' AND finished_at >= now() - interval '1 hour'
    ),
    'failedLastHour', count(*) FILTER (
      WHERE status = 'failed' AND finished_at >= now() - interval '1 hour'
    ),
    'doneLast24h', count(*) FILTER (
      WHERE status = 'done' AND finished_at >= now() - interval '24 hours'
    ),
    'failedLast24h', count(*) FILTER (
      WHERE status = 'failed' AND finished_at >= now() - interval '24 hours'
    ),
    'doneLifetime', count(*) FILTER (WHERE status = 'done' AND finished_at IS NOT NULL),
    'failedLifetime', count(*) FILTER (WHERE status = 'failed' AND finished_at IS NOT NULL),
    'avgProcessingMsDoneLastHour', round(avg(
      extract(epoch FROM (finished_at - processing_started_at)) * 1000
    ) FILTER (
      WHERE status = 'done'
        AND finished_at >= now() - interval '1 hour'
        AND processing_started_at IS NOT NULL
    )),
    'oldestPendingAgeSeconds', floor(extract(epoch FROM (
      now() - min(created_at) FILTER (WHERE status = 'pending')
    )))
  ) AS value
  FROM public.media_transcode_jobs
),
media_readiness AS MATERIALIZED (
  SELECT jsonb_build_object(
    'legacyReconcileCandidateCountWithinSizeCap', count(*) FILTER (
      WHERE m.mime_type ILIKE 'video/%'
        AND (m.status IS NULL OR m.status NOT IN ('pending', 'deleting', 'pending_delete'))
        AND m.s3_key IS NOT NULL AND trim(m.s3_key) <> ''
        AND (m.size_bytes IS NULL OR m.size_bytes <= 3221225472::bigint)
        AND (m.video_processing_status IS NULL OR m.video_processing_status = 'none')
        AND (m.hls_master_playlist_s3_key IS NULL OR trim(m.hls_master_playlist_s3_key) = '')
        AND NOT EXISTS (
          SELECT 1
          FROM public.media_transcode_jobs active_job
          WHERE active_job.media_id = m.id
            AND active_job.status IN ('pending', 'processing')
        )
    ),
    'readableVideoReadyWithHlsCount', count(*) FILTER (
      WHERE m.mime_type ILIKE 'video/%'
        AND (m.status IS NULL OR m.status NOT IN ('pending', 'deleting', 'pending_delete'))
        AND m.video_processing_status = 'ready'
        AND m.hls_master_playlist_s3_key IS NOT NULL
        AND trim(m.hls_master_playlist_s3_key) <> ''
    )
  ) AS value
  FROM public.media_files m
),
safe_jobs AS MATERIALIZED (
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'jobKey', job_key,
      'jobFamily', job_family,
      'lastStatus', CASE WHEN last_status IN ('success', 'failure') THEN last_status ELSE 'unknown' END,
      'lastFinishedAt', last_finished_at,
      'lastSuccessAt', last_success_at,
      'lastFailureAt', last_failure_at,
      'lastDurationMs', last_duration_ms,
      'safeMeta', CASE
        WHEN job_family = 'reminders' AND job_key = 'reminders.web_push_only.tick' THEN
          jsonb_build_object(
            'failed', CASE WHEN COALESCE(meta_json->>'failed', '') ~ '^[0-9]{1,9}$'
              THEN (meta_json->>'failed')::integer ELSE 0 END,
            'consecutiveCronFailures', CASE
              WHEN COALESCE(meta_json->>'consecutiveCronFailures', '') ~ '^[0-9]{1,9}$'
              THEN (meta_json->>'consecutiveCronFailures')::integer ELSE 0 END
          )
        WHEN job_family = 'health' AND job_key = 'health.outbound_probe.run' THEN
          jsonb_build_object(
            'consecutiveFailRuns', CASE
              WHEN COALESCE(meta_json->>'consecutiveFailRuns', '') ~ '^[0-9]{1,9}$'
              THEN (meta_json->>'consecutiveFailRuns')::integer ELSE 0 END,
            'rubitime', CASE WHEN meta_json->>'rubitime' IN ('ok','fail','skipped_not_configured')
              THEN meta_json->>'rubitime' ELSE 'no_data' END,
            'telegram', CASE WHEN meta_json->>'telegram' IN ('ok','fail','skipped_not_configured')
              THEN meta_json->>'telegram' ELSE 'no_data' END,
            'max', CASE WHEN meta_json->>'max' IN ('ok','fail','skipped_not_configured')
              THEN meta_json->>'max' ELSE 'no_data' END,
            'google_calendar', CASE
              WHEN meta_json->>'google_calendar' IN ('ok','fail','skipped_not_configured')
              THEN meta_json->>'google_calendar' ELSE 'no_data' END
          )
        ELSE '{}'::jsonb
      END
    ) ORDER BY job_family, job_key
  ), '[]'::jsonb) AS value
  FROM public.operator_job_status
  WHERE (job_family, job_key) IN (
    ('reminders', 'reminders.web_push_only.tick'),
    ('media', 'media.pending_delete.purge'),
    ('media', 'media.multipart.cleanup'),
    ('media', 'media.preview.process'),
    ('media', 'media_transcode.reconcile'),
    ('health', 'health.system_health_guard.tick'),
    ('health', 'health.operator_health_critical.tick'),
    ('health', 'health.operator_health_digest.tick'),
    ('health', 'health.outbound_probe.run'),
    ('media', 'media.playback_stats.retention'),
    ('media', 'media.hls_proxy_errors.retention'),
    ('analytics', 'analytics.product_analytics.retention'),
    ('specialist_tasks', 'specialist_task_reminders.tick'),
    ('backup', 'backup.hourly'),
    ('backup', 'backup.daily'),
    ('backup', 'backup.weekly'),
    ('backup', 'backup.prune')
  )
),
incident_summary AS MATERIALIZED (
  SELECT jsonb_build_object(
    'openCount', count(*),
    'occurrenceCount', COALESCE(sum(occurrence_count), 0),
    'lastSeenAt', max(last_seen_at)
  ) AS value
  FROM public.operator_incidents
  WHERE resolved_at IS NULL
),
outgoing AS MATERIALIZED (
  SELECT jsonb_build_object(
    'dueBacklog', count(*) FILTER (
      WHERE status IN ('pending','failed_retryable') AND next_retry_at <= now()
    ),
    'deadTotal', count(*) FILTER (
      WHERE status = 'dead' AND (failure_class IS NULL OR failure_class NOT IN ('recipient_blocked_bot', 'reminder_not_dispatched'))
    ),
    'blockedRecipientTotal', count(*) FILTER (
      WHERE status = 'dead' AND failure_class = 'recipient_blocked_bot'
    ),
    'oldestDueAgeSeconds', floor(extract(epoch FROM (
      now() - min(created_at) FILTER (
        WHERE status IN ('pending','failed_retryable') AND next_retry_at <= now()
      )
    ))),
    'dueByChannel', jsonb_build_object(
      'telegram', count(*) FILTER (WHERE channel = 'telegram' AND status IN ('pending','failed_retryable') AND next_retry_at <= now()),
      'max', count(*) FILTER (WHERE channel = 'max' AND status IN ('pending','failed_retryable') AND next_retry_at <= now()),
      'web_push', count(*) FILTER (WHERE channel = 'web_push' AND status IN ('pending','failed_retryable') AND next_retry_at <= now()),
      'email', count(*) FILTER (WHERE channel = 'email' AND status IN ('pending','failed_retryable') AND next_retry_at <= now()),
      'sms', count(*) FILTER (WHERE channel = 'sms' AND status IN ('pending','failed_retryable') AND next_retry_at <= now()),
      'bot_message', count(*) FILTER (WHERE channel = 'bot_message' AND status IN ('pending','failed_retryable') AND next_retry_at <= now())
    ),
    'dueByKind', jsonb_build_object(
      'reminder_dispatch', count(*) FILTER (WHERE kind = 'reminder_dispatch' AND status IN ('pending','failed_retryable') AND next_retry_at <= now())
    ),
    'deadByKind', jsonb_build_object(
      'reminder_dispatch', count(*) FILTER (WHERE kind = 'reminder_dispatch' AND status = 'dead' AND (failure_class IS NULL OR failure_class NOT IN ('recipient_blocked_bot', 'reminder_not_dispatched')))
    ),
    'processingCount', count(*) FILTER (WHERE status = 'processing'),
    'reminderProcessingCount', count(*) FILTER (WHERE kind = 'reminder_dispatch' AND status = 'processing'),
    'lastSentAt', max(sent_at),
    'lastQueueActivityAt', max(updated_at)
  ) AS value
  FROM public.outgoing_delivery_queue
),
reminders AS MATERIALIZED (
  SELECT jsonb_build_object(
    'windowHours', 24,
    'occurrenceHistory', jsonb_build_object(
      'sent', (SELECT count(*) FROM public.reminder_occurrence_history WHERE status = 'sent' AND occurred_at >= now() - interval '24 hours'),
      'failed', (SELECT count(*) FROM public.reminder_occurrence_history WHERE status = 'failed' AND occurred_at >= now() - interval '24 hours')
    ),
    'deliveryEvents', jsonb_build_object(
      'sent', (SELECT count(*) FROM public.outgoing_delivery_queue WHERE kind = 'reminder_dispatch' AND status = 'sent' AND sent_at >= now() - interval '24 hours'),
      'failed', (SELECT count(*) FROM public.outgoing_delivery_queue WHERE kind = 'reminder_dispatch' AND status = 'dead' AND (failure_class IS NULL OR failure_class NOT IN ('recipient_blocked_bot', 'reminder_not_dispatched')) AND dead_at >= now() - interval '24 hours')
    ),
    'patientReminderM2mIdempotencyKeysActive', (
      SELECT count(*) FROM public.idempotency_keys
      WHERE key LIKE 'prn:%:channels' AND expires_at > now()
    )
  ) AS value
),
web_push AS MATERIALIZED (
  SELECT jsonb_build_object(
    'windowHours', 24,
    'activeSubscriptionsCount', count(*),
    'usersWithSubscriptionCount', count(DISTINCT user_id),
    'subscriptionsTouchedLast24h', count(*) FILTER (WHERE updated_at >= now() - interval '24 hours')
  ) AS value
  FROM public.user_web_push_subscriptions
),
notification_counts AS MATERIALIZED (
  SELECT channel, status, count(*) AS count
  FROM public.notification_delivery_attempts
  WHERE created_at >= now() - interval '24 hours'
    AND channel IN ('telegram','max','web_push','email')
    AND status IN ('success','failed','skipped')
  GROUP BY channel, status
),
notification_delivery AS MATERIALIZED (
  SELECT jsonb_build_object(
    'windowHours', 24,
    'totalAttempts24h', COALESCE((SELECT sum(count) FROM notification_counts), 0),
    'byChannel', (
      SELECT jsonb_object_agg(channel, jsonb_build_object(
        'successCount', COALESCE((SELECT count FROM notification_counts c WHERE c.channel = channels.channel AND c.status = 'success'), 0),
        'failedCount', COALESCE((SELECT count FROM notification_counts c WHERE c.channel = channels.channel AND c.status = 'failed'), 0),
        'skippedCount', COALESCE((SELECT count FROM notification_counts c WHERE c.channel = channels.channel AND c.status = 'skipped'), 0),
        'lastAttemptAt', (SELECT max(created_at) FROM public.notification_delivery_attempts a WHERE a.channel = channels.channel AND a.created_at >= now() - interval '24 hours'),
        'lastSuccessAt', (SELECT max(created_at) FROM public.notification_delivery_attempts a WHERE a.channel = channels.channel AND a.status = 'success' AND a.created_at >= now() - interval '24 hours'),
        'lastErrorAt', (SELECT max(created_at) FROM public.notification_delivery_attempts a WHERE a.channel = channels.channel AND a.status IN ('failed','skipped') AND a.created_at >= now() - interval '24 hours'),
        'lastErrorReason', NULL,
        'lastErrorMessage', NULL
      ))
      FROM (VALUES ('telegram'),('max'),('web_push'),('email')) AS channels(channel)
    ),
    'recentIssues', '[]'::jsonb
  ) AS value
),
webhook_status AS MATERIALIZED (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'source', source,
    'receivedAt', received_at,
    'processedOk', processed_ok = 1,
    'httpStatusReturned', http_status_returned
  ) ORDER BY source), '[]'::jsonb) AS value
  FROM public.integration_webhook_last_status
  WHERE source IN ('rubitime','telegram','max')
),
digest AS MATERIALIZED (
  SELECT max(sent_at) FILTER (WHERE dedup_key LIKE 'digest:%') AS last_sent_at
  FROM public.operator_health_alert_sent
)
SELECT jsonb_build_object(
  'schemaVersion', 1,
  'config', jsonb_build_object(
    'pipelineEnabled', runtime_config.pipeline_enabled,
    'reconcileEnabled', runtime_config.reconcile_enabled,
    'playbackEnabled', runtime_config.playback_enabled,
    'vapidConfigured', restricted_config.vapid_configured,
    'smtpConfigured', restricted_config.smtp_configured
  ),
  'videoTranscode', transcode.value || media_readiness.value,
  'operatorJobs', safe_jobs.value,
  'operatorIncidents', incident_summary.value,
  'outgoingDelivery', outgoing.value,
  'remindersPipeline', reminders.value || jsonb_build_object(
    'outgoingReminderDispatch', jsonb_build_object(
      'due', outgoing.value#>'{dueByKind,reminder_dispatch}',
      'dead', outgoing.value#>'{deadByKind,reminder_dispatch}',
      'processing', outgoing.value->'reminderProcessingCount'
    )
  ),
  'webPush', web_push.value,
  'notificationDelivery', notification_delivery.value,
  'integrationWebhookStatus', webhook_status.value,
  'operatorHealthDigestLastSentAt', digest.last_sent_at
)
FROM runtime_config, restricted_config, transcode, media_readiness, safe_jobs,
  incident_summary, outgoing, reminders, web_push, notification_delivery,
  webhook_status, digest
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.read_current_patient_booking_runtime_integer(text)
CREATE OR REPLACE FUNCTION app.read_current_patient_booking_runtime_integer(p_key text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE PARALLEL RESTRICTED SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_value text;
  v_result integer;
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_booking_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'booking.patient-runtime-integer.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.read_current_patient_booking_runtime_integer(text)'::regprocedure);

  IF v_org IS NULL OR v_patient IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_key NOT IN ('booking_min_notice_hours', 'booking_max_consecutive_slot_hours') THEN
    RAISE EXCEPTION 'unsupported patient booking runtime integer: %', p_key
      USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.org_enrollments enrollment
    WHERE enrollment.organization_id = v_org
      AND enrollment.platform_user_id = v_patient
      AND enrollment.status = 'active'
  ) THEN
    RETURN NULL;
  END IF;

  SELECT setting.value_json ->> 'value'
  INTO v_value
  FROM public.system_settings setting
  WHERE setting.key = p_key
    AND setting.scope = 'admin'
    AND (setting.organization_id = v_org OR setting.organization_id IS NULL)
  ORDER BY setting.organization_id IS NULL ASC
  LIMIT 1;

  IF v_value IS NULL OR v_value !~ '^\d+$' THEN
    RAISE EXCEPTION 'patient booking runtime integer is unavailable: %', p_key
      USING ERRCODE = '22023';
  END IF;
  v_result := v_value::integer;
  IF (p_key = 'booking_min_notice_hours' AND (v_result < 0 OR v_result > 168))
     OR (p_key = 'booking_max_consecutive_slot_hours' AND (v_result < 1 OR v_result > 24)) THEN
    RAISE EXCEPTION 'patient booking runtime integer is out of range: %', p_key
      USING ERRCODE = '22023';
  END IF;
  RETURN v_result;
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.read_current_patient_booking_slot_snapshot(uuid,uuid,text,text)
CREATE OR REPLACE FUNCTION app.read_current_patient_booking_slot_snapshot(p_branch_id uuid, p_service_id uuid, p_date_from text, p_date_to text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE PARALLEL RESTRICTED SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_context record;
  v_working_hours jsonb;
  v_working_days jsonb;
  v_busy jsonb;
  v_buffer_minutes integer;
  v_min_notice_text text;
  v_max_consecutive_slot_text text;
  v_min_notice_hours integer;
  v_max_consecutive_slot_hours integer;
  v_date_from date;
  v_date_to date;
BEGIN
  -- Internal helper: only the exact outer creation-snapshot capability may reach this body.
  PERFORM app.require_accepted_context(
    'app_seam_patient_booking_owner'::name,
    'app_patient'::name,
    'patient'::app.port_context_class,
    'booking.patient-creation-snapshot.read',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send(p_branch_id))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send(p_service_id))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_date_from))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend(p_date_to))::app.port_typed_arg
    ]),
    'app.read_current_patient_booking_creation_snapshot(uuid,uuid,text,text)'::regprocedure
  );

  IF v_org IS NULL OR v_patient IS NULL OR p_date_from IS NULL OR p_date_to IS NULL
     OR p_date_from !~ '^\d{4}-\d{2}-\d{2}$'
     OR p_date_to !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RETURN NULL;
  END IF;
  v_date_from := p_date_from::date;
  v_date_to := p_date_to::date;
  IF v_date_from > v_date_to OR v_date_to - v_date_from > 92 THEN RETURN NULL; END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.org_enrollments enrollment
    WHERE enrollment.organization_id = v_org
      AND enrollment.platform_user_id = v_patient
      AND enrollment.status = 'active'
  ) THEN
    RETURN NULL;
  END IF;

  SELECT
    availability.organization_id,
    availability.branch_id,
    availability.specialist_id,
    availability.service_id,
    availability.room_id,
    service.duration_minutes,
    service.buffer_after_minutes,
    branch.timezone
  INTO v_context
  FROM public.be_specialist_service_availability availability
  JOIN public.be_specialists specialist
    ON specialist.id = availability.specialist_id
   AND specialist.organization_id = availability.organization_id
   AND specialist.is_active = TRUE
  JOIN public.be_branches branch
    ON branch.id = availability.branch_id
   AND branch.organization_id = availability.organization_id
   AND branch.is_active = TRUE
  JOIN public.be_clinic_services service
    ON service.id = availability.service_id
   AND service.organization_id = availability.organization_id
   AND service.is_active = TRUE
   AND service.public_widget_visible = TRUE
   AND service.admin_manual_only = FALSE
  WHERE availability.organization_id = v_org
    AND availability.branch_id = p_branch_id
    AND availability.service_id = p_service_id
    AND availability.is_active = TRUE
  ORDER BY availability.created_at DESC, availability.id DESC
  LIMIT 1;

  IF v_context.organization_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'weekday', source.weekday,
    'startMinute', source.start_minute,
    'endMinute', source.end_minute
  ) ORDER BY source.weekday, source.start_minute), '[]'::jsonb)
  INTO v_working_hours
  FROM (
    SELECT hours.weekday, hours.start_minute, hours.end_minute
    FROM public.be_working_hours hours
    WHERE hours.organization_id = v_org
      AND hours.is_active = TRUE
      AND (hours.specialist_id = v_context.specialist_id OR hours.specialist_id IS NULL)
      AND (hours.branch_id = v_context.branch_id OR hours.branch_id IS NULL)
      AND (v_context.room_id IS NULL OR hours.room_id = v_context.room_id OR hours.room_id IS NULL)
  ) source;

  IF jsonb_array_length(v_working_hours) = 0 THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'weekday', hours.weekday,
      'startMinute', hours.start_minute,
      'endMinute', hours.end_minute
    ) ORDER BY hours.weekday, hours.start_minute), '[]'::jsonb)
    INTO v_working_hours
    FROM public.be_working_hours hours
    WHERE hours.organization_id = v_org
      AND hours.is_active = TRUE
      AND hours.specialist_id IS NULL
      AND hours.branch_id IS NULL
      AND hours.room_id IS NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', day.id,
    'organizationId', day.organization_id,
    'specialistId', day.specialist_id,
    'branchId', day.branch_id,
    'roomId', day.room_id,
    'workDate', day.work_date,
    'startMinute', day.start_minute,
    'endMinute', day.end_minute,
    'breaks', COALESCE(day.breaks, '[]'::jsonb),
    'isClosed', day.is_closed
  ) ORDER BY day.work_date), '[]'::jsonb)
  INTO v_working_days
  FROM public.be_working_days day
  WHERE day.organization_id = v_org
    AND day.specialist_id = v_context.specialist_id
    AND day.work_date BETWEEN v_date_from AND v_date_to;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'startAt', interval_row.start_at,
    'endAt', interval_row.end_at
  ) ORDER BY interval_row.start_at), '[]'::jsonb)
  INTO v_busy
  FROM (
    SELECT
      appointment.start_at,
      appointment.end_at
        + (COALESCE(appointment_service.buffer_after_minutes, 0) * interval '1 minute') AS end_at
    FROM public.be_appointments appointment
    LEFT JOIN public.be_clinic_services appointment_service
      ON appointment_service.id = appointment.service_id
     AND appointment_service.organization_id = appointment.organization_id
    WHERE appointment.organization_id = v_org
      AND appointment.specialist_id = v_context.specialist_id
      AND appointment.deleted_at IS NULL
      AND appointment.status IN (
        'created', 'awaiting_payment', 'paid', 'confirmed', 'rescheduled', 'manual_review_required'
      )
      AND appointment.end_at
          + (COALESCE(appointment_service.buffer_after_minutes, 0) * interval '1 minute')
          >= v_date_from::timestamptz
      AND appointment.start_at <= (v_date_to + 1)::timestamptz
    UNION ALL
    SELECT block.start_at, block.end_at
    FROM public.be_schedule_blocks block
    WHERE block.organization_id = v_org
      AND (block.specialist_id = v_context.specialist_id OR block.specialist_id IS NULL)
      AND block.end_at >= v_date_from::timestamptz
      AND block.start_at <= (v_date_to + 1)::timestamptz
  ) interval_row;

  SELECT COALESCE((rule.config ->> 'minutes')::integer, 0)
  INTO v_buffer_minutes
  FROM public.be_availability_rules rule
  WHERE rule.organization_id = v_org
    AND rule.rule_type = 'buffer_minutes'
    AND rule.is_active = TRUE
    AND (rule.specialist_id = v_context.specialist_id OR rule.specialist_id IS NULL)
  ORDER BY rule.specialist_id IS NULL ASC, rule.updated_at DESC
  LIMIT 1;
  v_buffer_minutes := GREATEST(0, COALESCE(v_buffer_minutes, 0));

  SELECT setting.value_json ->> 'value'
  INTO v_min_notice_text
  FROM public.system_settings setting
  WHERE setting.key = 'booking_min_notice_hours'
    AND setting.scope = 'admin'
    AND (setting.organization_id = v_org OR setting.organization_id IS NULL)
  ORDER BY setting.organization_id IS NULL ASC
  LIMIT 1;

  SELECT setting.value_json ->> 'value'
  INTO v_max_consecutive_slot_text
  FROM public.system_settings setting
  WHERE setting.key = 'booking_max_consecutive_slot_hours'
    AND setting.scope = 'admin'
    AND (setting.organization_id = v_org OR setting.organization_id IS NULL)
  ORDER BY setting.organization_id IS NULL ASC
  LIMIT 1;

  IF v_min_notice_text IS NULL OR v_min_notice_text !~ '^\d+$'
     OR v_max_consecutive_slot_text IS NULL OR v_max_consecutive_slot_text !~ '^\d+$' THEN
    RAISE EXCEPTION 'patient booking runtime settings are unavailable'
      USING ERRCODE = '22023';
  END IF;
  v_min_notice_hours := v_min_notice_text::integer;
  v_max_consecutive_slot_hours := v_max_consecutive_slot_text::integer;
  IF v_min_notice_hours < 0 OR v_min_notice_hours > 168
     OR v_max_consecutive_slot_hours < 1 OR v_max_consecutive_slot_hours > 24 THEN
    RAISE EXCEPTION 'patient booking runtime settings are out of range'
      USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'context', jsonb_build_object(
      'organizationId', v_context.organization_id,
      'branchId', v_context.branch_id,
      'specialistId', v_context.specialist_id,
      'serviceId', v_context.service_id,
      'roomId', v_context.room_id,
      'durationMinutes', v_context.duration_minutes,
      'bufferAfterMinutes', v_context.buffer_after_minutes,
      'branchTimezone', v_context.timezone
    ),
    'workingHours', v_working_hours,
    'workingDays', v_working_days,
    'busy', v_busy,
    'bufferMinutes', v_buffer_minutes,
    'minNoticeHours', v_min_notice_hours,
    'maxConsecutiveSlotHours', v_max_consecutive_slot_hours
  );
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_settings_runtime_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
-- BCB-MIGRATION-REHOME-FUNCTION: app.read_global_server_runtime_setting(text)
CREATE OR REPLACE FUNCTION app.read_global_server_runtime_setting(p_key text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$SELECT app.require_attested_context_for_roles('app_seam_settings_runtime_owner'::name, ARRAY['app_integrator_request'::name]::name[]);
SELECT setting.value_json
  FROM public.system_settings AS setting
  WHERE p_key IN ('app_base_url', 'error_tracking_enabled', 'error_tracking_dsn')
    AND setting.key = p_key
    AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_settings_runtime_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
-- BCB-MIGRATION-REHOME-FUNCTION: app.read_media_worker_runtime_setting(text)
CREATE OR REPLACE FUNCTION app.read_media_worker_runtime_setting(p_key text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$SELECT app.require_attested_context_for_roles('app_seam_settings_runtime_owner'::name, ARRAY['app_operational_media_worker'::name]::name[]);
SELECT setting.value_json
  FROM public.system_settings AS setting
  WHERE p_key IN (
      'video_hls_pipeline_enabled', 'video_hls_reconcile_enabled',
      'video_hls_new_uploads_auto_transcode', 'video_watermark_enabled',
      'error_tracking_enabled', 'error_tracking_dsn'
    )
    AND setting.key = p_key
    AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_public_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.read_public_booking_slot_snapshot(uuid,uuid,text,text)
CREATE OR REPLACE FUNCTION app.read_public_booking_slot_snapshot(p_branch_id uuid, p_service_id uuid, p_date_from text, p_date_to text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_context record;
  v_working_hours jsonb;
  v_working_days jsonb;
  v_busy jsonb;
  v_buffer_minutes integer;
  v_min_notice_hours integer;
  v_max_consecutive_slot_hours integer;
  v_date_from date;
  v_date_to date;
BEGIN
  PERFORM app.require_accepted_context('app_seam_public_booking_owner'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'booking.public-slot-snapshot.read', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg]), 'app.read_public_booking_slot_snapshot(uuid,uuid,text,text)'::regprocedure);

  IF v_org IS NULL OR p_branch_id IS NULL OR p_service_id IS NULL
     OR p_date_from IS NULL OR p_date_to IS NULL
     OR p_date_from !~ '^\d{4}-\d{2}-\d{2}$'
     OR p_date_to !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clinic_public_directory_entries directory
    WHERE directory.organization_id = v_org
      AND directory.is_published = true
  ) THEN
    RETURN NULL;
  END IF;
  v_date_from := p_date_from::date;
  v_date_to := p_date_to::date;
  IF v_date_from > v_date_to OR v_date_to - v_date_from > 92 THEN RETURN NULL; END IF;

  SELECT
    availability.organization_id,
    availability.branch_id,
    availability.specialist_id,
    availability.service_id,
    availability.room_id,
    service.duration_minutes,
    service.buffer_after_minutes,
    branch.timezone
  INTO v_context
  FROM public.be_specialist_service_availability availability
  JOIN public.be_specialists specialist
    ON specialist.id = availability.specialist_id
   AND specialist.organization_id = availability.organization_id
   AND specialist.is_active = TRUE
  JOIN public.be_branches branch
    ON branch.id = availability.branch_id
   AND branch.organization_id = availability.organization_id
   AND branch.is_active = TRUE
  JOIN public.be_clinic_services service
    ON service.id = availability.service_id
   AND service.organization_id = availability.organization_id
   AND service.is_active = TRUE
   AND service.public_widget_visible = TRUE
   AND service.admin_manual_only = FALSE
  WHERE availability.organization_id = v_org
    AND availability.branch_id = p_branch_id
    AND availability.service_id = p_service_id
    AND availability.is_active = TRUE
  ORDER BY availability.created_at DESC, availability.id DESC
  LIMIT 1;

  IF v_context.organization_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'weekday', source.weekday,
    'startMinute', source.start_minute,
    'endMinute', source.end_minute
  ) ORDER BY source.weekday, source.start_minute), '[]'::jsonb)
  INTO v_working_hours
  FROM (
    SELECT hours.weekday, hours.start_minute, hours.end_minute
    FROM public.be_working_hours hours
    WHERE hours.organization_id = v_org
      AND hours.is_active = TRUE
      AND (hours.specialist_id = v_context.specialist_id OR hours.specialist_id IS NULL)
      AND (hours.branch_id = v_context.branch_id OR hours.branch_id IS NULL)
      AND (v_context.room_id IS NULL OR hours.room_id = v_context.room_id OR hours.room_id IS NULL)
  ) source;

  IF jsonb_array_length(v_working_hours) = 0 THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'weekday', hours.weekday,
      'startMinute', hours.start_minute,
      'endMinute', hours.end_minute
    ) ORDER BY hours.weekday, hours.start_minute), '[]'::jsonb)
    INTO v_working_hours
    FROM public.be_working_hours hours
    WHERE hours.organization_id = v_org
      AND hours.is_active = TRUE
      AND hours.specialist_id IS NULL
      AND hours.branch_id IS NULL
      AND hours.room_id IS NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', day.id,
    'organizationId', day.organization_id,
    'specialistId', day.specialist_id,
    'branchId', day.branch_id,
    'roomId', day.room_id,
    'workDate', day.work_date,
    'startMinute', day.start_minute,
    'endMinute', day.end_minute,
    'breaks', COALESCE(day.breaks, '[]'::jsonb),
    'isClosed', day.is_closed
  ) ORDER BY day.work_date), '[]'::jsonb)
  INTO v_working_days
  FROM public.be_working_days day
  WHERE day.organization_id = v_org
    AND day.specialist_id = v_context.specialist_id
    AND day.work_date BETWEEN v_date_from AND v_date_to;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'startAt', interval_row.start_at,
    'endAt', interval_row.end_at
  ) ORDER BY interval_row.start_at), '[]'::jsonb)
  INTO v_busy
  FROM (
    SELECT
      appointment.start_at,
      appointment.end_at
        + (COALESCE(appointment_service.buffer_after_minutes, 0) * interval '1 minute') AS end_at
    FROM public.be_appointments appointment
    LEFT JOIN public.be_clinic_services appointment_service
      ON appointment_service.id = appointment.service_id
     AND appointment_service.organization_id = appointment.organization_id
    WHERE appointment.organization_id = v_org
      AND appointment.specialist_id = v_context.specialist_id
      AND appointment.deleted_at IS NULL
      AND appointment.status IN (
        'created', 'awaiting_payment', 'paid', 'confirmed', 'rescheduled', 'manual_review_required'
      )
      AND appointment.end_at
          + (COALESCE(appointment_service.buffer_after_minutes, 0) * interval '1 minute')
          >= v_date_from::timestamptz
      AND appointment.start_at <= (v_date_to + 1)::timestamptz
    UNION ALL
    SELECT block.start_at, block.end_at
    FROM public.be_schedule_blocks block
    WHERE block.organization_id = v_org
      AND (block.specialist_id = v_context.specialist_id OR block.specialist_id IS NULL)
      AND block.end_at >= v_date_from::timestamptz
      AND block.start_at <= (v_date_to + 1)::timestamptz
  ) interval_row;

  SELECT COALESCE((rule.config ->> 'minutes')::integer, 0)
  INTO v_buffer_minutes
  FROM public.be_availability_rules rule
  WHERE rule.organization_id = v_org
    AND rule.rule_type = 'buffer_minutes'
    AND rule.is_active = TRUE
    AND (rule.specialist_id = v_context.specialist_id OR rule.specialist_id IS NULL)
  ORDER BY rule.specialist_id IS NULL ASC, rule.updated_at DESC
  LIMIT 1;
  v_buffer_minutes := GREATEST(0, COALESCE(v_buffer_minutes, 0));

  SELECT GREATEST(0, LEAST(168, COALESCE((setting.value_json ->> 'value')::integer, 0)))
  INTO v_min_notice_hours
  FROM public.system_settings setting
  WHERE setting.key = 'booking_min_notice_hours'
    AND setting.scope = 'admin'
    AND (setting.organization_id = v_org OR setting.organization_id IS NULL)
  ORDER BY setting.organization_id IS NULL ASC
  LIMIT 1;

  SELECT GREATEST(1, LEAST(24, COALESCE((setting.value_json ->> 'value')::integer, 1)))
  INTO v_max_consecutive_slot_hours
  FROM public.system_settings setting
  WHERE setting.key = 'booking_max_consecutive_slot_hours'
    AND setting.scope = 'admin'
    AND (setting.organization_id = v_org OR setting.organization_id IS NULL)
  ORDER BY setting.organization_id IS NULL ASC
  LIMIT 1;

  RETURN jsonb_build_object(
    'context', jsonb_build_object(
      'organizationId', v_context.organization_id,
      'branchId', v_context.branch_id,
      'specialistId', v_context.specialist_id,
      'serviceId', v_context.service_id,
      'roomId', v_context.room_id,
      'durationMinutes', v_context.duration_minutes,
      'bufferAfterMinutes', COALESCE(v_context.buffer_after_minutes, 0),
      'branchTimezone', v_context.timezone
    ),
    'workingHours', v_working_hours,
    'workingDays', v_working_days,
    'busy', v_busy,
    'bufferMinutes', v_buffer_minutes,
    'minNoticeHours', COALESCE(v_min_notice_hours, 0),
    'maxConsecutiveSlotHours', COALESCE(v_max_consecutive_slot_hours, 1)
  );
END;
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_settings_runtime_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.read_public_runtime_setting(text,text)
CREATE OR REPLACE FUNCTION app.read_public_runtime_setting(p_key text, p_scope text)
 RETURNS TABLE(key text, scope text, organization_id uuid, audience text, value_json jsonb)
 LANGUAGE plpgsql
 STABLE PARALLEL RESTRICTED SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM app.require_accepted_context('app_seam_settings_runtime_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'config.runtime.public.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg]), 'app.read_public_runtime_setting(text,text)'::regprocedure);

  RETURN QUERY
  SELECT setting.key, setting.scope, setting.organization_id, 'public'::text AS audience, setting.value_json
    FROM public.system_settings setting
   WHERE setting.key = p_key
     AND setting.scope = p_scope
     AND setting.organization_id IS NULL
     AND (
       setting.key IN (
         'auth_email_enabled', 'auth_sms_enabled', 'auth_telegram_enabled', 'auth_max_enabled',
         'auth_oauth_google_enabled', 'auth_oauth_yandex_enabled', 'auth_oauth_vk_enabled',
         'auth_oauth_apple_enabled', 'auth_passkey_enabled', 'oauth_yandex_enabled',
         'oauth_google_enabled', 'oauth_apple_enabled', 'oauth_vk_enabled',
         'public_sms_fallback_enabled', 'specialist_signup_enabled',
         'patient_unsupported_client_fallback_enabled', 'telegram_login_bot_username',
         'max_login_bot_nickname', 'vk_web_login_url', 'support_contact_url', 'app_display_timezone'
       )
       OR setting.key ~ '^auth_surface_(staff|platform_admin|patient)_(email|sms|telegram|max|oauth_google|oauth_yandex|oauth_vk|oauth_apple|passkey)_enabled$'
     )
   LIMIT 1;
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_settings_runtime_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.read_webapp_server_runtime_setting(text,text)
CREATE OR REPLACE FUNCTION app.read_webapp_server_runtime_setting(p_key text, p_scope text)
 RETURNS TABLE(key text, scope text, organization_id uuid, audience text, value_json jsonb)
 LANGUAGE plpgsql
 STABLE PARALLEL RESTRICTED SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM app.require_accepted_context('app_seam_settings_runtime_owner'::name, 'app_pre_session'::name, 'pre_session'::app.port_context_class, 'config.runtime.server.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg]), 'app.read_webapp_server_runtime_setting(text,text)'::regprocedure);

  RETURN QUERY
  SELECT setting.key, setting.scope, setting.organization_id, 'server'::text AS audience, setting.value_json
    FROM public.system_settings setting
   WHERE setting.key = p_key
     AND setting.scope = p_scope
     AND setting.organization_id IS NULL
     AND setting.key IN (
       'debug_forward_to_admin', 'video_presign_ttl_seconds',
       'material_ratings_enabled',
       'admin_telegram_ids', 'admin_max_ids', 'admin_phones', 'admin_emails',
       'doctor_telegram_ids', 'doctor_max_ids', 'doctor_phones', 'auth_2fa_enabled'
     )
   LIMIT 1;
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_self_actions_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.record_current_patient_content_rating_feedback(uuid,integer,text,text)
CREATE OR REPLACE FUNCTION app.record_current_patient_content_rating_feedback(p_content_page_id uuid, p_rating_value integer, p_reason_codes text, p_comment text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_reason_codes jsonb := p_reason_codes::jsonb;
  v_id uuid;
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_self_actions_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'patient.material-rating.feedback.record', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($2))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg]), 'app.record_current_patient_content_rating_feedback(uuid,integer,text,text)'::regprocedure);
  IF v_org IS NULL OR v_patient IS NULL
     OR p_rating_value IS NULL OR p_rating_value NOT BETWEEN 1 AND 3
     OR coalesce(jsonb_typeof(v_reason_codes), '') <> 'array'
     OR jsonb_array_length(v_reason_codes) > 6
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements_text(v_reason_codes) reason(code)
       WHERE reason.code NOT IN (
         'worse_wellbeing', 'too_hard', 'unclear_explanation', 'disliked_movement',
         'video_quality', 'other'
       )
     )
     OR (jsonb_array_length(v_reason_codes) = 0 AND nullif(btrim(p_comment), '') IS NULL)
     OR length(coalesce(p_comment, '')) > 2000
     OR NOT coalesce((
       SELECT (s.value_json->>'value')::boolean
       FROM public.system_settings s
       WHERE s.key = 'material_ratings_enabled'
         AND s.scope = 'admin'
         AND s.organization_id IS NULL
       LIMIT 1
     ), true)
     OR NOT EXISTS (
       SELECT 1 FROM public.org_enrollments e
       WHERE e.organization_id = v_org AND e.platform_user_id = v_patient AND e.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.content_pages p
       WHERE p.id = p_content_page_id
         AND p.organization_id = v_org
         AND p.is_published
         AND p.archived_at IS NULL
         AND p.deleted_at IS NULL
         AND EXISTS (
           SELECT 1
           FROM public.patient_home_blocks b
           JOIN public.patient_home_block_items bi ON bi.block_code = b.code
           WHERE b.code = 'daily_warmup'
             AND b.organization_id = v_org
             AND b.is_visible
             AND bi.organization_id = v_org
             AND bi.is_visible
             AND bi.target_type = 'content_page'
             AND btrim(bi.target_ref) = p.slug
         )
     ) THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.patient_content_rating_feedback (
    organization_id, user_id, content_page_id, rating_value, reason_codes, comment
  ) VALUES (
    v_org, v_patient, p_content_page_id, p_rating_value, v_reason_codes, nullif(btrim(p_comment), '')
  ) RETURNING id INTO v_id;
  RETURN v_id;
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_self_actions_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.set_current_patient_notification_topic(text,boolean)
CREATE OR REPLACE FUNCTION app.set_current_patient_notification_topic(p_topic_code text, p_is_enabled boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_topic text := btrim(p_topic_code);
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_self_actions_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'patient.notification-topic.set', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('boolean@1', pg_catalog.boolsend($2))::app.port_typed_arg]), 'app.set_current_patient_notification_topic(text,boolean)'::regprocedure);
  IF v_org IS NULL OR v_patient IS NULL OR p_is_enabled IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.org_enrollments e
       WHERE e.organization_id = v_org AND e.platform_user_id = v_patient AND e.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM jsonb_array_elements(coalesce(
         (SELECT s.value_json->'value'
          FROM public.system_settings s
          WHERE s.key = 'notifications_topics'
            AND s.scope = 'admin'
            AND (s.organization_id = v_org OR s.organization_id IS NULL)
          ORDER BY s.organization_id NULLS LAST
          LIMIT 1),
         '[]'::jsonb
       )) topic(value)
       WHERE btrim(topic.value->>'id') = v_topic
     ) THEN
    RETURN false;
  END IF;
  INSERT INTO public.user_notification_topics (user_id, topic_code, is_enabled, updated_at)
  VALUES (v_patient, v_topic, p_is_enabled, statement_timestamp())
  ON CONFLICT (user_id, topic_code) DO UPDATE
  SET is_enabled = EXCLUDED.is_enabled, updated_at = EXCLUDED.updated_at
  WHERE user_notification_topics.user_id = v_patient;
  RETURN FOUND;
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_self_actions_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.set_current_patient_notification_topic_channel(text,text,boolean)
CREATE OR REPLACE FUNCTION app.set_current_patient_notification_topic_channel(p_topic_code text, p_channel_code text, p_is_enabled boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_topic text := btrim(p_topic_code);
  v_channel text := btrim(p_channel_code);
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_self_actions_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'patient.notification-topic-channel.set', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg, ROW('boolean@1', pg_catalog.boolsend($3))::app.port_typed_arg]), 'app.set_current_patient_notification_topic_channel(text,text,boolean)'::regprocedure);
  IF v_org IS NULL OR v_patient IS NULL OR p_is_enabled IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.org_enrollments e
       WHERE e.organization_id = v_org AND e.platform_user_id = v_patient AND e.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM jsonb_array_elements(coalesce(
         (SELECT s.value_json->'value'
          FROM public.system_settings s
          WHERE s.key = 'notifications_topics'
            AND s.scope = 'admin'
            AND (s.organization_id = v_org OR s.organization_id IS NULL)
          ORDER BY s.organization_id NULLS LAST
          LIMIT 1),
         '[]'::jsonb
       )) topic(value)
       WHERE btrim(topic.value->>'id') = v_topic
     )
     OR v_channel NOT IN ('telegram', 'max', 'vk', 'email', 'web_push')
     OR (v_topic IN ('warmup_reminders', 'training_reminders') AND v_channel = 'email') THEN
    RETURN false;
  END IF;
  INSERT INTO public.user_notification_topic_channels (
    user_id, topic_code, channel_code, is_enabled, updated_at
  ) VALUES (
    v_patient, v_topic, v_channel, p_is_enabled, statement_timestamp()
  )
  ON CONFLICT (user_id, topic_code, channel_code) DO UPDATE
  SET is_enabled = EXCLUDED.is_enabled, updated_at = EXCLUDED.updated_at
  WHERE user_notification_topic_channels.user_id = v_patient;
  RETURN FOUND;
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_self_actions_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.upsert_current_patient_material_rating(text,uuid,integer,uuid,uuid)
CREATE OR REPLACE FUNCTION app.upsert_current_patient_material_rating(p_target_kind text, p_target_id uuid, p_stars integer, p_program_instance_id uuid, p_program_stage_item_id uuid)
 RETURNS TABLE(updated boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_self_actions_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'patient.material-rating.upsert', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($2))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($3))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($4))::app.port_typed_arg, ROW('uuid@1', pg_catalog.uuid_send($5))::app.port_typed_arg]), 'app.upsert_current_patient_material_rating(text,uuid,integer,uuid,uuid)'::regprocedure);
  IF v_org IS NULL OR v_patient IS NULL OR p_target_kind NOT IN ('content_page', 'lfk_exercise', 'lfk_complex')
     OR p_stars NOT BETWEEN 1 AND 5
     OR NOT coalesce((
       SELECT (s.value_json->>'value')::boolean
       FROM public.system_settings s
       WHERE s.key = 'material_ratings_enabled'
         AND s.scope = 'admin'
         AND s.organization_id IS NULL
       LIMIT 1
     ), true)
     OR NOT EXISTS (
       SELECT 1 FROM public.org_enrollments e
       WHERE e.organization_id = v_org AND e.platform_user_id = v_patient AND e.status = 'active'
     )
     OR NOT (
       (p_target_kind = 'content_page' AND EXISTS (
         SELECT 1 FROM public.content_pages p
         WHERE p.id = p_target_id AND p.organization_id = v_org
           AND p.is_published AND p.archived_at IS NULL AND p.deleted_at IS NULL
       ) AND (
         (p_program_instance_id IS NULL AND p_program_stage_item_id IS NULL)
         OR EXISTS (
           SELECT 1
           FROM public.treatment_program_instance_stage_items si
           JOIN public.treatment_program_instance_stages s ON s.id = si.stage_id
           JOIN public.treatment_program_instances i ON i.id = s.instance_id
           WHERE i.id = p_program_instance_id
             AND si.id = p_program_stage_item_id
             AND si.item_type = 'lesson'
             AND si.item_ref_id = p_target_id
             AND si.organization_id = v_org
             AND s.organization_id = v_org
             AND i.organization_id = v_org
             AND i.patient_user_id = v_patient
             AND i.status = 'active'
             AND si.status = 'active'
         )
       ))
       OR (p_target_kind IN ('lfk_exercise', 'lfk_complex') AND EXISTS (
         SELECT 1
         FROM public.treatment_program_instance_stage_items si
         JOIN public.treatment_program_instance_stages s ON s.id = si.stage_id
         JOIN public.treatment_program_instances i ON i.id = s.instance_id
         WHERE i.id = p_program_instance_id
           AND si.id = p_program_stage_item_id
           AND si.item_ref_id = p_target_id
           AND (
             (p_target_kind = 'lfk_exercise' AND si.item_type = 'exercise')
             OR (p_target_kind = 'lfk_complex' AND si.item_type = 'lfk_complex')
           )
           AND si.organization_id = v_org
           AND s.organization_id = v_org
           AND i.organization_id = v_org
           AND i.patient_user_id = v_patient
           AND i.status = 'active'
           AND si.status = 'active'
       ))
     ) THEN
    RETURN QUERY SELECT false;
    RETURN;
  END IF;
  INSERT INTO public.material_ratings (
    organization_id, user_id, target_kind, target_id, stars, updated_at
  ) VALUES (v_org, v_patient, p_target_kind, p_target_id, p_stars, statement_timestamp())
  ON CONFLICT (user_id, target_kind, target_id) DO UPDATE
  SET organization_id = EXCLUDED.organization_id,
      stars = EXCLUDED.stars,
      updated_at = EXCLUDED.updated_at
  WHERE material_ratings.user_id = v_patient;
  RETURN QUERY SELECT FOUND;
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_settings_runtime_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.read_authenticated_runtime_setting(
  p_key text,
  p_scope text,
  p_organization_id uuid,
  p_allow_global_fallback boolean
) RETURNS TABLE(key text, scope text, organization_id uuid, audience text, value_json jsonb)
LANGUAGE plpgsql
STABLE SECURITY DEFINER PARALLEL RESTRICTED
SET search_path TO pg_catalog, app, public, pg_temp
AS $function$
DECLARE accepted_org uuid := app.current_org_id();
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_settings_runtime_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );
  IF p_scope NOT IN ('admin', 'doctor')
     OR (p_organization_id IS NOT NULL AND p_organization_id IS DISTINCT FROM accepted_org)
     OR NOT (
       p_key IN (
         'patient_label',
         'doctor_patient_support_comments_without_support_default_enabled',
         'doctor_patient_support_media_without_support_default_enabled',
         'patient_home_daily_practice_target', 'patient_default_promo_treatment_program_template_id',
         'patient_home_daily_warmup_rotation_enabled', 'patient_home_daily_warmup_rotation_times',
         'patient_app_maintenance_enabled', 'patient_app_maintenance_message',
         'patient_program_discussion_doctor_reply_from_log_enabled',
         'patient_program_discussion_ui_enabled',
         'patient_program_discussion_media_submission_enabled',
         'video_playback_api_enabled', 'video_default_delivery', 'patient_booking_url',
         'booking_calendar_show_working_hours', 'booking_calendar_default_window',
         'booking_calendar_default_branch_id', 'booking_calendar_default_service_id',
         'booking_calendar_default_specialist_id', 'booking_payment_enabled',
         'patient_home_daily_warmup_repeat_cooldown_minutes',
         'patient_treatment_plan_item_done_repeat_cooldown_minutes', 'notifications_topics',
         'auth_email_enabled', 'auth_sms_enabled', 'auth_telegram_enabled', 'auth_max_enabled',
         'auth_oauth_google_enabled', 'auth_oauth_yandex_enabled', 'auth_oauth_vk_enabled',
         'auth_oauth_apple_enabled', 'auth_passkey_enabled', 'oauth_yandex_enabled',
         'oauth_google_enabled', 'oauth_apple_enabled', 'oauth_vk_enabled',
         'public_sms_fallback_enabled', 'specialist_signup_enabled',
         'patient_unsupported_client_fallback_enabled', 'telegram_login_bot_username',
         'max_login_bot_nickname', 'vk_web_login_url', 'support_contact_url', 'app_display_timezone'
       )
       OR p_key ~ '^auth_surface_(staff|platform_admin|patient)_(email|sms|telegram|max|oauth_google|oauth_yandex|oauth_vk|oauth_apple|passkey)_enabled$'
     ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT setting.key, setting.scope, setting.organization_id,
         CASE WHEN p_key IN (
           'patient_label',
           'doctor_patient_support_comments_without_support_default_enabled',
           'doctor_patient_support_media_without_support_default_enabled',
           'patient_home_daily_practice_target', 'patient_default_promo_treatment_program_template_id',
           'patient_home_daily_warmup_rotation_enabled', 'patient_home_daily_warmup_rotation_times',
           'patient_app_maintenance_enabled', 'patient_app_maintenance_message',
           'patient_program_discussion_doctor_reply_from_log_enabled',
           'patient_program_discussion_ui_enabled',
           'patient_program_discussion_media_submission_enabled',
           'video_playback_api_enabled', 'video_default_delivery', 'patient_booking_url',
           'booking_calendar_show_working_hours', 'booking_calendar_default_window',
           'booking_calendar_default_branch_id', 'booking_calendar_default_service_id',
           'booking_calendar_default_specialist_id', 'booking_payment_enabled',
           'patient_home_daily_warmup_repeat_cooldown_minutes',
           'patient_treatment_plan_item_done_repeat_cooldown_minutes', 'notifications_topics'
         ) THEN 'authenticated_client'::text ELSE 'public'::text END,
         setting.value_json
  FROM public.system_settings setting
  WHERE setting.key = p_key
    AND setting.scope = p_scope
    AND (
      setting.organization_id = p_organization_id
      OR (p_allow_global_fallback AND setting.organization_id IS NULL)
    )
  ORDER BY setting.organization_id IS NULL ASC
  LIMIT 1;
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
DROP TRIGGER IF EXISTS system_settings_sync_registered_runtime ON public.system_settings;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
DROP FUNCTION IF EXISTS public.sync_registered_app_runtime_setting();

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
DROP TRIGGER IF EXISTS app_runtime_settings_audit_change ON public.app_runtime_settings;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
DROP FUNCTION IF EXISTS public.audit_app_runtime_settings_change();

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
DROP TABLE IF EXISTS public.app_runtime_settings_audit;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
DROP TABLE IF EXISTS public.app_runtime_settings;
