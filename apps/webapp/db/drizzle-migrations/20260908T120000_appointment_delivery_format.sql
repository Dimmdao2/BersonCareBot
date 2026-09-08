-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'be_appointments' AND column_name = 'delivery_format' AND is_nullable = 'NO')
--
-- The delivery format is canonical on the appointment. Existing rows are classified from the
-- same durable facts used by creation: the built-in Online branch or its linked patient booking.
ALTER TABLE public.be_appointments
  ADD COLUMN IF NOT EXISTS delivery_format text;
--> statement-breakpoint
-- BCB-MIGRATION-BACKFILL
UPDATE public.be_appointments AS appointment
SET delivery_format = CASE
  WHEN EXISTS (
    SELECT 1
    FROM public.be_branches AS branch
    WHERE branch.id = appointment.branch_id
      AND branch.organization_id = appointment.organization_id
      AND (lower(branch.city_code) = 'online' OR lower(branch.title) = lower('Онлайн'))
  )
  OR EXISTS (
    SELECT 1
    FROM public.patient_bookings AS booking
    WHERE booking.canonical_appointment_id = appointment.id
      AND booking.booking_type = 'online'
  ) THEN 'online'
  ELSE 'in_person'
END
WHERE appointment.delivery_format IS NULL;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.be_appointments
  ALTER COLUMN delivery_format SET DEFAULT 'in_person';
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.be_appointments
  ALTER COLUMN delivery_format SET NOT NULL;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_booking_owner
-- BCB-MIGRATION-REHOME-FUNCTION: app.create_current_patient_booking_appointments(text)
CREATE OR REPLACE FUNCTION app.create_current_patient_booking_appointments(p_inputs_json text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  p_inputs jsonb := p_inputs_json::jsonb;
  v_input jsonb;
  v_row public.be_appointments%ROWTYPE;
  v_results jsonb := '[]'::jsonb;
  v_start timestamptz;
  v_end timestamptz;
  v_duration integer;
  v_status text;
  v_branch uuid;
  v_room uuid;
  v_specialist uuid;
  v_service uuid;
  v_price_minor integer;
  v_prepayment_mode text;
  v_prepayment_percent_bps integer;
  v_prepayment_amount_minor integer;
  v_prepayment_required_minor integer;
  v_payment_deadline_at timestamptz;
  v_delivery_format text;
BEGIN
  PERFORM app.require_accepted_context('app_seam_patient_booking_owner'::name, 'app_patient'::name, 'patient'::app.port_context_class, 'booking.patient-appointments.create', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.create_current_patient_booking_appointments(text)'::regprocedure);
  IF v_org IS NULL OR v_patient IS NULL OR jsonb_typeof(p_inputs) <> 'array'
     OR jsonb_array_length(p_inputs) < 1 OR jsonb_array_length(p_inputs) > 8
     OR NOT EXISTS (
       SELECT 1 FROM public.org_enrollments enrollment
       WHERE enrollment.organization_id = v_org
         AND enrollment.platform_user_id = v_patient
         AND enrollment.status = 'active'
     ) THEN
    RAISE EXCEPTION 'patient appointment context unavailable' USING ERRCODE = '42501';
  END IF;

  FOR v_input IN SELECT value FROM jsonb_array_elements(p_inputs)
  LOOP
    v_start := NULLIF(v_input ->> 'startAt', '')::timestamptz;
    v_end := NULLIF(v_input ->> 'endAt', '')::timestamptz;
    v_duration := NULLIF(v_input ->> 'durationMinutes', '')::integer;
    v_status := v_input ->> 'status';
    v_branch := NULLIF(v_input ->> 'branchId', '')::uuid;
    v_room := NULLIF(v_input ->> 'roomId', '')::uuid;
    v_specialist := NULLIF(v_input ->> 'specialistId', '')::uuid;
    v_service := NULLIF(v_input ->> 'serviceId', '')::uuid;
    v_delivery_format := COALESCE(NULLIF(v_input ->> 'deliveryFormat', ''), 'in_person');
    v_prepayment_mode := COALESCE(NULLIF(v_input ->> 'prepaymentMode', ''), 'disabled');
    v_prepayment_percent_bps := NULLIF(v_input ->> 'prepaymentPercentBps', '')::integer;
    v_prepayment_amount_minor := NULLIF(v_input ->> 'prepaymentAmountMinor', '')::integer;
    v_prepayment_required_minor := COALESCE(NULLIF(v_input ->> 'prepaymentRequiredMinor', '')::integer, 0);
    v_payment_deadline_at := NULLIF(v_input ->> 'paymentDeadlineAt', '')::timestamptz;
    IF NULLIF(v_input ->> 'organizationId', '')::uuid IS DISTINCT FROM v_org
       OR NULLIF(v_input ->> 'platformUserId', '')::uuid IS DISTINCT FROM v_patient
       OR v_input ->> 'source' NOT IN ('native', 'public_widget')
       OR v_status NOT IN ('confirmed', 'awaiting_payment')
       OR v_start IS NULL OR v_end IS NULL OR v_end <= v_start
       OR v_duration IS NULL OR v_duration < 1
       OR extract(epoch FROM (v_end - v_start))::integer <> v_duration * 60
       OR (v_delivery_format = 'in_person' AND (v_branch IS NULL OR v_specialist IS NULL OR v_service IS NULL))
       OR v_delivery_format NOT IN ('in_person', 'online')
       OR v_prepayment_mode NOT IN ('disabled', 'fixed_minor', 'percent', 'full_price')
       OR v_prepayment_required_minor < 0
       OR (v_prepayment_percent_bps IS NOT NULL AND (v_prepayment_percent_bps < 0 OR v_prepayment_percent_bps > 10000))
       OR (v_prepayment_amount_minor IS NOT NULL AND v_prepayment_amount_minor < 0) THEN
      RAISE EXCEPTION 'invalid current patient appointment payload' USING ERRCODE = '22023';
    END IF;
    IF v_status = 'awaiting_payment'
       AND (v_prepayment_required_minor <= 0 OR v_payment_deadline_at IS NULL) THEN
      RAISE EXCEPTION 'invalid current patient appointment payload' USING ERRCODE = '22023';
    END IF;
    IF v_delivery_format = 'in_person' AND NOT EXISTS (
      SELECT 1
      FROM public.be_specialist_service_availability availability
      JOIN public.be_specialists specialist ON specialist.id = availability.specialist_id AND specialist.organization_id = availability.organization_id AND specialist.is_active = TRUE
      JOIN public.be_branches branch ON branch.id = availability.branch_id AND branch.organization_id = availability.organization_id AND branch.is_active = TRUE
      JOIN public.be_clinic_services service ON service.id = availability.service_id AND service.organization_id = availability.organization_id AND service.is_active = TRUE AND service.public_widget_visible = TRUE AND service.admin_manual_only = FALSE
      WHERE availability.organization_id = v_org
        AND availability.branch_id = v_branch
        AND availability.specialist_id = v_specialist
        AND availability.service_id = v_service
        AND availability.room_id IS NOT DISTINCT FROM v_room
        AND availability.is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'patient appointment catalog mismatch' USING ERRCODE = '42501';
    END IF;
    SELECT service.price_minor INTO v_price_minor
      FROM public.be_clinic_services service
     WHERE service.id = v_service AND service.organization_id = v_org;
    IF v_price_minor IS NOT NULL AND v_prepayment_required_minor > v_price_minor THEN
      RAISE EXCEPTION 'invalid current patient appointment payload' USING ERRCODE = '22023';
    END IF;
    IF v_specialist IS NOT NULL THEN
      INSERT INTO public.patient_specialist_links (organization_id, patient_user_id, specialist_id, status, created_via)
      VALUES (v_org, v_patient, v_specialist, 'active', 'first_appointment') ON CONFLICT DO NOTHING;
    END IF;
    INSERT INTO public.be_appointments (
      organization_id, branch_id, room_id, specialist_id, service_id, platform_user_id,
      start_at, end_at, duration_minutes, chain_id, chain_position, source, status, delivery_format,
      original_start_at, reschedule_count, phone_normalized, attribution_json,
      appointment_reminder_allowed_preset_ids, appointment_reminder_preset_id, appointment_reminder_selection_source,
      price_minor, price_currency, prepayment_mode, prepayment_percent_bps, prepayment_amount_minor,
      prepayment_required_minor, prepayment_paid_minor, payment_deadline_at, created_at, updated_at
    ) VALUES (
      v_org, v_branch, v_room, v_specialist, v_service, v_patient,
      v_start, v_end, v_duration, NULLIF(v_input ->> 'chainId', '')::uuid,
      NULLIF(v_input ->> 'chainPosition', '')::integer, v_input ->> 'source', v_status, v_delivery_format,
      v_start, 0, NULLIF(v_input ->> 'phoneNormalized', ''), COALESCE(v_input -> 'attributionJson', '{}'::jsonb),
      COALESCE(v_input -> 'appointmentReminderAllowedPresetIds', '[]'::jsonb), NULLIF(v_input ->> 'appointmentReminderPresetId', ''),
      COALESCE(NULLIF(v_input ->> 'appointmentReminderSelectionSource', ''), 'specialist_default'),
      v_price_minor, COALESCE(NULLIF(v_input ->> 'priceCurrency', ''), 'RUB'), v_prepayment_mode,
      v_prepayment_percent_bps, v_prepayment_amount_minor, v_prepayment_required_minor, 0,
      v_payment_deadline_at, now(), now()
    ) RETURNING * INTO v_row;
    INSERT INTO public.be_appointment_history_events (organization_id, appointment_id, event_type, actor_id, payload, occurred_at)
    VALUES (v_org, v_row.id, 'created', v_patient, jsonb_build_object('status', v_status), now());
    INSERT INTO public.be_patient_timeline_events (organization_id, platform_user_id, domain, event_type, linked_object_type, linked_object_id, payload, occurred_at)
    VALUES (v_org, v_patient, 'appointment', 'appointment_created', 'appointment', v_row.id::text, jsonb_build_object('status', v_status), now());
    v_results := v_results || jsonb_build_array(to_jsonb(v_row));
  END LOOP;
  RETURN v_results;
END
$function$;
