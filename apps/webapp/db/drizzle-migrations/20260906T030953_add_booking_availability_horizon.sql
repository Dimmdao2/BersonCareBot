-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.pg_get_functiondef('app.read_public_booking_slot_snapshot(uuid,uuid,text,text)'::regprocedure) LIKE '%availabilityHorizonDays%' AND pg_catalog.pg_get_functiondef('app.read_current_patient_booking_runtime_integer(text)'::regprocedure) LIKE '%booking_availability_horizon_days%' AND pg_catalog.pg_get_functiondef('app.provision_specialist_owner(uuid)'::regprocedure) LIKE '%booking_availability_horizon_days%'
--
-- BAH-01…03: один клинический горизонт управляет публичной и пациентской выдачей
-- доступности. Без per-org строки definer-функции деградируют к реестровому дефолту 30 дней;
-- новая клиника получает собственную строку в том же атомарном провижининге владельца.
-- Глобальная scope=admin строка не создаётся: она неисполнима под FORCE RLS (A1).
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
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
  IF p_key NOT IN (
    'booking_min_notice_hours',
    'booking_availability_horizon_days',
    'booking_max_consecutive_slot_hours',
    'booking_prepayment_wait_minutes'
  ) THEN
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

  IF v_value IS NULL AND p_key = 'booking_prepayment_wait_minutes' THEN
    RETURN 20;
  END IF;
  -- BAH-01/F2: клиника без per-org строки получает реестровый дефолт; сломанное сохранённое
  -- значение по-прежнему падает громко (ERRCODE 22023) ниже.
  IF v_value IS NULL AND p_key = 'booking_availability_horizon_days' THEN
    RETURN 30;
  END IF;
  IF v_value IS NULL OR v_value !~ '^\d+$' THEN
    RAISE EXCEPTION 'patient booking runtime integer is unavailable: %', p_key
      USING ERRCODE = '22023';
  END IF;
  v_result := v_value::integer;
  IF (p_key = 'booking_min_notice_hours' AND (v_result < 0 OR v_result > 168))
     OR (p_key = 'booking_availability_horizon_days' AND (v_result < 1 OR v_result > 92))
     OR (p_key = 'booking_max_consecutive_slot_hours' AND (v_result < 1 OR v_result > 24))
     OR (p_key = 'booking_prepayment_wait_minutes' AND (v_result < 1 OR v_result > 525600)) THEN
    RAISE EXCEPTION 'patient booking runtime integer is out of range: %', p_key
      USING ERRCODE = '22023';
  END IF;
  RETURN v_result;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_specialist_provision_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.provision_specialist_owner(uuid)
CREATE OR REPLACE FUNCTION app.provision_specialist_owner(p_challenge_id uuid)
 RETURNS TABLE(ok boolean, code text, organization_id uuid, specialist_id uuid, membership_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
DECLARE
  v_intent record;
  v_user record;
  v_platform_user_id uuid;
  v_organization_id uuid;
  v_membership_id uuid;
  v_specialist_id uuid;
  v_unique_constraint_name text;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_specialist_provision_owner'::name, ARRAY['app_patient'::name]::name[]);

  v_platform_user_id := app.require_staff_security_self_user_id();

  SELECT i.*
  INTO v_intent
  FROM public.specialist_signup_intents AS i
  WHERE i.user_id = v_platform_user_id
    AND i.challenge_id = p_challenge_id
    AND i.status = 'pending'
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT i.*
    INTO v_intent
    FROM public.specialist_signup_intents AS i
    WHERE i.user_id = v_platform_user_id
      AND i.challenge_id = p_challenge_id
      AND i.status = 'provisioned'
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND
      OR v_intent.provisioned_organization_id IS NULL
      OR v_intent.provisioned_membership_id IS NULL THEN
      RETURN QUERY SELECT false, 'specialist_signup_intent_not_found'::text, NULL::uuid, NULL::uuid, NULL::uuid;
      RETURN;
    END IF;

    v_organization_id := v_intent.provisioned_organization_id;
    v_membership_id := v_intent.provisioned_membership_id;
    v_specialist_id := v_intent.provisioned_specialist_id;
  END IF;

  IF v_organization_id IS NULL THEN
    SELECT u.id
    INTO v_user
    FROM public.platform_users AS u
    WHERE u.id = v_platform_user_id
      AND u.merged_into_id IS NULL
      AND EXISTS (
        SELECT 1 FROM public.user_contacts AS contact
        WHERE contact.platform_user_id = u.id
          AND contact.contact_kind = 'email'
          AND contact.confirmed_at IS NOT NULL
      )
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN QUERY SELECT false, 'specialist_signup_user_not_verified'::text, NULL::uuid, NULL::uuid, NULL::uuid;
      RETURN;
    END IF;

    IF v_intent.organization_slug IS NULL THEN
      RETURN QUERY SELECT false, 'specialist_signup_slug_reservation_not_found'::text, NULL::uuid, NULL::uuid, NULL::uuid;
      RETURN;
    END IF;

    PERFORM 1
    FROM public.be_organization_members AS m
    WHERE m.platform_user_id = v_user.id
      AND m.status = 'active'
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      RETURN QUERY SELECT false, 'specialist_signup_active_membership_exists'::text, NULL::uuid, NULL::uuid, NULL::uuid;
      RETURN;
    END IF;

    UPDATE public.platform_users AS u
    SET role = 'doctor',
        display_name = v_intent.specialist_full_name,
        updated_at = now()
    WHERE u.id = v_user.id;

    v_organization_id := gen_random_uuid();

    BEGIN
      INSERT INTO public.be_organizations (
        id,
        title,
        is_active,
        sort_order,
        created_at,
        updated_at
      )
      VALUES (
        v_organization_id,
        v_intent.organization_title,
        true,
        0,
        now(),
        now()
      );

      INSERT INTO public.organization_slug_claims (
        slug,
        kind,
        organization_id,
        created_by_platform_user_id,
        created_at,
        updated_at
      )
      VALUES (
        lower(v_intent.organization_slug),
        'current',
        v_organization_id,
        v_user.id,
        now(),
        now()
      );
    EXCEPTION
      WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_unique_constraint_name = CONSTRAINT_NAME;
        IF v_unique_constraint_name = 'uq_organization_slug_claims_slug' THEN
          RETURN QUERY SELECT false, 'slug_unavailable'::text, NULL::uuid, NULL::uuid, NULL::uuid;
          RETURN;
        END IF;
        RAISE;
    END;

    INSERT INTO public.clinic_public_directory_entries (
      organization_id,
      slug,
      display_name,
      is_published,
      published_at,
      created_at,
      updated_at
    )
    VALUES (
      v_organization_id,
      lower(v_intent.organization_slug),
      v_intent.organization_title,
      true,
      now(),
      now(),
      now()
    );

    INSERT INTO public.system_settings (
      key,
      scope,
      organization_id,
      value_json,
      updated_at,
      updated_by
    )
    VALUES (
      'booking_availability_horizon_days',
      'admin',
      v_organization_id,
      pg_catalog.jsonb_build_object('value', 30),
      pg_catalog.now(),
      v_user.id
    );

    INSERT INTO public.be_organization_members (
      organization_id,
      platform_user_id,
      role,
      specialist_id,
      status,
      created_at,
      updated_at
    )
    VALUES (
      v_organization_id,
      v_user.id,
      'owner',
      NULL,
      'active',
      now(),
      now()
    )
    RETURNING id INTO v_membership_id;

    PERFORM app.start_provisioned_organization_trial();
    PERFORM app.seed_reference_catalog_snapshot(v_organization_id);
  END IF;

  IF v_specialist_id IS NULL THEN
    INSERT INTO public.be_specialists (
      organization_id,
      full_name,
      is_active,
      sort_order,
      created_at,
      updated_at
    )
    VALUES (
      v_organization_id,
      v_intent.specialist_full_name,
      true,
      0,
      now(),
      now()
    )
    RETURNING id INTO v_specialist_id;

    UPDATE public.be_organization_members
    SET specialist_id = v_specialist_id,
        updated_at = now()
    WHERE id = v_membership_id
      AND specialist_id IS NULL;
  END IF;

  UPDATE public.specialist_signup_intents AS i
  SET status = 'provisioned',
      provisioned_organization_id = v_organization_id,
      provisioned_membership_id = v_membership_id,
      provisioned_specialist_id = v_specialist_id,
      provisioned_at = now()
  WHERE i.id = v_intent.id;

  RETURN QUERY SELECT true, NULL::text, v_organization_id, v_specialist_id, v_membership_id;
END
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
  v_availability_horizon_text text;
  v_availability_horizon_days integer;
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

  SELECT setting.value_json ->> 'value'
  INTO v_availability_horizon_text
  FROM public.system_settings setting
  WHERE setting.key = 'booking_availability_horizon_days'
    AND setting.scope = 'admin'
    AND (setting.organization_id = v_org OR setting.organization_id IS NULL)
  ORDER BY setting.organization_id IS NULL ASC
  LIMIT 1;

  -- BAH-01/F2: отсутствие per-org строки (NULL) деградирует к реестровому дефолту.
  -- Сохранённое, но сломанное значение остаётся loud (ERRCODE 22023).
  IF v_availability_horizon_text IS NULL THEN
    v_availability_horizon_days := 30;
  ELSIF v_availability_horizon_text !~ '^\d+$' THEN
    RAISE EXCEPTION 'booking availability horizon is unavailable'
      USING ERRCODE = '22023';
  ELSE
    v_availability_horizon_days := v_availability_horizon_text::integer;
    IF v_availability_horizon_days < 1 OR v_availability_horizon_days > 92 THEN
      RAISE EXCEPTION 'booking availability horizon is out of range'
        USING ERRCODE = '22023';
    END IF;
  END IF;

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
    'availabilityHorizonDays', v_availability_horizon_days,
    'maxConsecutiveSlotHours', COALESCE(v_max_consecutive_slot_hours, 1)
  );
END;
$function$;
