-- BCB-MIGRATION-OWNER: app_seam_patient_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.read_current_patient_booking_slot_snapshot(
  p_branch_id uuid,
  p_service_id uuid,
  p_date_from text,
  p_date_to text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
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
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_booking_owner'::name,
    ARRAY['app_patient'::name]::name[]
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
  FROM public.app_runtime_settings setting
  WHERE setting.key = 'booking_min_notice_hours'
    AND setting.scope = 'admin'
    AND setting.audience = 'server'
    AND (setting.organization_id = v_org OR setting.organization_id IS NULL)
  ORDER BY setting.organization_id IS NULL ASC
  LIMIT 1;

  SELECT setting.value_json ->> 'value'
  INTO v_max_consecutive_slot_text
  FROM public.app_runtime_settings setting
  WHERE setting.key = 'booking_max_consecutive_slot_hours'
    AND setting.scope = 'admin'
    AND setting.audience = 'server'
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
