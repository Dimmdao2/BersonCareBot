-- BCB-MIGRATION-OWNER: app_seam_patient_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql


CREATE OR REPLACE FUNCTION app.read_current_patient_booking_creation_snapshot(
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
  v_snapshot jsonb;
  v_org uuid;
  v_catalog jsonb;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_booking_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );

  v_snapshot := app.read_current_patient_booking_slot_snapshot(
    p_branch_id,
    p_service_id,
    p_date_from,
    p_date_to
  );
  IF v_snapshot IS NULL THEN
    RETURN NULL;
  END IF;
  v_org := (v_snapshot #>> '{context,organizationId}')::uuid;

  SELECT jsonb_build_object(
    'branchTitle', branch.title,
    'branchShortTitle', branch.short_title,
    'branchColor', branch.color,
    'branchCityCode', branch.city_code,
    'branchAddress', branch.address,
    'branchSortOrder', branch.sort_order,
    'serviceTitle', service.title,
    'serviceDescription', service.description,
    'servicePriceMinor', service.price_minor,
    'servicePrepaymentApplicable', service.prepayment_applicable,
    'serviceUsableInPackages', service.usable_in_packages,
    'serviceOnlinePaymentApplicable', service.online_payment_applicable,
    'servicePublicWidgetVisible', service.public_widget_visible,
    'serviceAdminManualOnly', service.admin_manual_only,
    'serviceSortOrder', service.sort_order,
    'specialistReminderAllowedPresetIds', COALESCE(specialist.appointment_reminder_allowed_preset_ids, '[]'::jsonb),
    'specialistReminderDefaultPresetId', specialist.appointment_reminder_default_preset_id
  )
  INTO v_catalog
  FROM public.be_branches branch
  JOIN public.be_clinic_services service
    ON service.id = p_service_id
   AND service.organization_id = v_org
   AND service.is_active = TRUE
   AND service.public_widget_visible = TRUE
   AND service.admin_manual_only = FALSE
  JOIN public.be_specialists specialist
    ON specialist.id = (v_snapshot #>> '{context,specialistId}')::uuid
   AND specialist.organization_id = v_org
   AND specialist.is_active = TRUE
  WHERE branch.id = p_branch_id
    AND branch.organization_id = v_org
    AND branch.is_active = TRUE;

  IF v_catalog IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_set(v_snapshot, '{context,patientCatalogSnapshot}', v_catalog, TRUE);
END
$function$;


CREATE OR REPLACE FUNCTION app.read_current_patient_booking_busy_intervals(
  p_specialist_id uuid,
  p_room_id uuid,
  p_range_start timestamptz,
  p_range_end timestamptz,
  p_exclude_appointment_id uuid
)
RETURNS TABLE(start_at timestamptz, end_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_booking_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );
  IF v_org IS NULL OR v_patient IS NULL OR p_specialist_id IS NULL
     OR p_range_start IS NULL OR p_range_end IS NULL OR p_range_start >= p_range_end THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.org_enrollments enrollment
    WHERE enrollment.organization_id = v_org
      AND enrollment.platform_user_id = v_patient
      AND enrollment.status = 'active'
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT appointment.start_at,
         appointment.end_at + (COALESCE(service.buffer_after_minutes, 0) * interval '1 minute')
  FROM public.be_appointments appointment
  LEFT JOIN public.be_clinic_services service
    ON service.id = appointment.service_id
   AND service.organization_id = appointment.organization_id
  WHERE appointment.organization_id = v_org
    AND appointment.specialist_id = p_specialist_id
    AND appointment.deleted_at IS NULL
    AND appointment.status IN (
      'created', 'awaiting_payment', 'paid', 'confirmed', 'rescheduled', 'manual_review_required'
    )
    AND (p_exclude_appointment_id IS NULL OR appointment.id <> p_exclude_appointment_id)
    AND appointment.end_at + (COALESCE(service.buffer_after_minutes, 0) * interval '1 minute') > p_range_start
    AND appointment.start_at < p_range_end
  UNION ALL
  SELECT block.start_at, block.end_at
  FROM public.be_schedule_blocks block
  WHERE block.organization_id = v_org
    AND (block.specialist_id = p_specialist_id OR block.specialist_id IS NULL)
    AND (p_room_id IS NULL OR block.room_id = p_room_id OR block.room_id IS NULL)
    AND block.end_at > p_range_start
    AND block.start_at < p_range_end;
END
$function$;


CREATE OR REPLACE FUNCTION app.read_current_patient_booking_form_fields()
RETURNS TABLE(
  id uuid,
  organization_id uuid,
  field_key text,
  field_type text,
  label text,
  placeholder text,
  is_required boolean,
  visible_to_patient boolean,
  visible_to_staff boolean,
  sort_order integer,
  is_active boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_booking_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );
  IF v_org IS NULL OR v_patient IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.org_enrollments enrollment
    WHERE enrollment.organization_id = v_org
      AND enrollment.platform_user_id = v_patient
      AND enrollment.status = 'active'
  ) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT field.id, field.organization_id, field.field_key, field.field_type, field.label,
         field.placeholder, field.is_required, field.visible_to_patient, field.visible_to_staff,
         field.sort_order, field.is_active
  FROM public.be_booking_form_fields field
  WHERE field.organization_id = v_org
    AND field.is_active = TRUE
    AND field.visible_to_patient = TRUE
  ORDER BY field.sort_order, field.label;
END
$function$;


CREATE OR REPLACE FUNCTION app.save_current_patient_booking_form_answers(
  p_appointment_id uuid,
  p_answers_json text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  p_answers jsonb := p_answers_json::jsonb;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_booking_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );
  IF v_org IS NULL OR v_patient IS NULL OR p_appointment_id IS NULL
     OR p_answers IS NULL OR jsonb_typeof(p_answers) <> 'array' THEN
    RAISE EXCEPTION 'invalid patient booking form answers' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.be_appointments appointment
    WHERE appointment.id = p_appointment_id
      AND appointment.organization_id = v_org
      AND appointment.platform_user_id = v_patient
      AND appointment.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'patient appointment not found' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.be_booking_form_submissions (
    organization_id, appointment_id, field_id, value_text
  )
  SELECT v_org, p_appointment_id, field.id, answer.value_text
  FROM jsonb_to_recordset(p_answers) AS answer(field_key text, value_text text)
  JOIN public.be_booking_form_fields field
    ON field.organization_id = v_org
   AND field.field_key = answer.field_key
   AND field.is_active = TRUE
   AND field.visible_to_patient = TRUE
  WHERE answer.value_text IS NOT NULL
  ON CONFLICT (appointment_id, field_id)
  DO UPDATE SET value_text = EXCLUDED.value_text;
END
$function$;


CREATE OR REPLACE FUNCTION app.read_current_patient_booking_packages(p_service_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_result jsonb;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_booking_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );
  IF v_org IS NULL OR v_patient IS NULL OR p_service_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.org_enrollments enrollment
    WHERE enrollment.organization_id = v_org
      AND enrollment.platform_user_id = v_patient
      AND enrollment.status = 'active'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.be_clinic_services service
    WHERE service.id = p_service_id
      AND service.organization_id = v_org
      AND service.is_active = TRUE
  ) THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(package_json ORDER BY package_created_at), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT package_row.created_at AS package_created_at,
           jsonb_build_object(
             'id', package_row.id,
             'organizationId', package_row.organization_id,
             'platformUserId', package_row.platform_user_id,
             'subscriptionPackageId', package_row.subscription_package_id,
             'status', package_row.status,
             'displayNumber', package_row.display_number,
             'title', package_row.title,
             'priceMinor', package_row.price_minor,
             'currency', package_row.currency,
             'validityDays', package_row.validity_days,
             'validFrom', package_row.valid_from,
             'validUntil', package_row.valid_until,
             'deductionMode', package_row.deduction_mode,
             'paymentIntentId', package_row.payment_intent_id,
             'paymentRef', package_row.payment_ref,
             'soldAt', package_row.sold_at,
             'paidAmountMinor', package_row.paid_amount_minor,
             'paidCurrency', package_row.paid_currency,
             'createdAt', package_row.created_at,
             'notes', package_row.notes,
             'items', item_summary.items,
             'balance', jsonb_build_object(
               'patientPackageId', package_row.id,
               'status', package_row.status,
               'items', item_summary.balance_items
             )
           ) AS package_json
    FROM public.be_patient_packages package_row
    CROSS JOIN LATERAL (
      SELECT
        COALESCE(jsonb_agg(jsonb_build_object(
          'id', balance.patient_package_item_id,
          'serviceId', balance.service_id,
          'quantityInitial', balance.quantity_initial,
          'sortOrder', balance.sort_order
        ) ORDER BY balance.sort_order), '[]'::jsonb) AS items,
        COALESCE(jsonb_agg(jsonb_build_object(
          'patientPackageItemId', balance.patient_package_item_id,
          'serviceId', balance.service_id,
          'serviceTitle', balance.service_title,
          'quantityInitial', balance.quantity_initial,
          'reserved', balance.reserved,
          'consumed', balance.consumed,
          'released', balance.released,
          'penalty', balance.penalty,
          'refunded', balance.refunded,
          'remaining', balance.remaining,
          'displayRemaining', balance.display_remaining
        ) ORDER BY balance.sort_order), '[]'::jsonb) AS balance_items,
        bool_or(balance.service_id = p_service_id AND balance.remaining > 0) AS has_service_balance
      FROM (
        SELECT item.id AS patient_package_item_id,
               item.service_id,
               service.title AS service_title,
               item.quantity_initial,
               item.sort_order,
               COALESCE(sum(usage.quantity) FILTER (WHERE usage.usage_kind = 'reserve'), 0)::integer AS reserved,
               COALESCE(sum(usage.quantity) FILTER (WHERE usage.usage_kind IN ('consume', 'manual_adjust')), 0)::integer AS consumed,
               COALESCE(sum(usage.quantity) FILTER (WHERE usage.usage_kind = 'release'), 0)::integer AS released,
               COALESCE(sum(usage.quantity) FILTER (WHERE usage.usage_kind = 'penalty'), 0)::integer AS penalty,
               COALESCE(sum(usage.quantity) FILTER (WHERE usage.usage_kind = 'refund'), 0)::integer AS refunded,
               GREATEST(0, item.quantity_initial
                 - GREATEST(0,
                     COALESCE(sum(usage.quantity) FILTER (WHERE usage.usage_kind IN ('consume', 'manual_adjust')), 0)
                     + COALESCE(sum(usage.quantity) FILTER (WHERE usage.usage_kind = 'penalty'), 0)
                     - COALESCE(sum(usage.quantity) FILTER (WHERE usage.usage_kind = 'refund'), 0))
                 + COALESCE(sum(usage.quantity) FILTER (WHERE usage.usage_kind = 'release'), 0)
                 - COALESCE(sum(usage.quantity) FILTER (WHERE usage.usage_kind = 'reserve'), 0))::integer AS remaining,
               GREATEST(0, item.quantity_initial
                 - GREATEST(0,
                     COALESCE(sum(usage.quantity) FILTER (WHERE usage.usage_kind IN ('consume', 'manual_adjust')), 0)
                     + COALESCE(sum(usage.quantity) FILTER (WHERE usage.usage_kind = 'penalty'), 0)
                     - COALESCE(sum(usage.quantity) FILTER (WHERE usage.usage_kind = 'refund'), 0))
                 + COALESCE(sum(usage.quantity) FILTER (WHERE usage.usage_kind = 'release'), 0))::integer AS display_remaining
        FROM public.be_patient_package_items item
        JOIN public.be_clinic_services service
          ON service.id = item.service_id
         AND service.organization_id = v_org
        LEFT JOIN public.be_package_usages usage
          ON usage.patient_package_id = package_row.id
         AND usage.patient_package_item_id = item.id
         AND usage.organization_id = v_org
        WHERE item.patient_package_id = package_row.id
        GROUP BY item.id, item.service_id, service.title, item.quantity_initial, item.sort_order
      ) balance
    ) item_summary
    WHERE package_row.organization_id = v_org
      AND package_row.platform_user_id = v_patient
      AND package_row.status = 'active'
      AND (package_row.valid_from IS NULL OR package_row.valid_from <= now())
      AND (package_row.valid_until IS NULL OR package_row.valid_until >= now())
      AND item_summary.has_service_balance = TRUE
  ) available_packages;
  RETURN v_result;
END
$function$;


CREATE OR REPLACE FUNCTION app.create_current_patient_booking_pending(p_input_json text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  p_input jsonb := p_input_json::jsonb;
  v_id uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_row public.patient_bookings%ROWTYPE;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_booking_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );
  IF v_org IS NULL OR v_patient IS NULL OR p_input IS NULL THEN
    RAISE EXCEPTION 'patient booking context unavailable' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.org_enrollments enrollment
    WHERE enrollment.organization_id = v_org
      AND enrollment.platform_user_id = v_patient
      AND enrollment.status = 'active'
  ) THEN
    RAISE EXCEPTION 'patient booking enrollment unavailable' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(p_input ->> 'organizationId', '')::uuid IS DISTINCT FROM v_org
     OR NULLIF(p_input ->> 'userId', '')::uuid IS DISTINCT FROM v_patient
     OR p_input ->> 'bookingType' <> 'in_person'
     OR p_input ->> 'category' <> 'general' THEN
    RAISE EXCEPTION 'patient booking pending scope mismatch' USING ERRCODE = '42501';
  END IF;

  v_id := NULLIF(p_input ->> 'id', '')::uuid;
  v_start := NULLIF(p_input ->> 'slotStart', '')::timestamptz;
  v_end := NULLIF(p_input ->> 'slotEnd', '')::timestamptz;
  IF v_id IS NULL OR v_start IS NULL OR v_end IS NULL OR v_end <= v_start
     OR NULLIF(p_input ->> 'contactName', '') IS NULL
     OR NULLIF(p_input ->> 'contactPhone', '') IS NULL THEN
    RAISE EXCEPTION 'invalid patient booking pending payload' USING ERRCODE = '22023';
  END IF;

  UPDATE public.patient_bookings
  SET status = 'failed_sync', updated_at = now()
  WHERE organization_id = v_org
    AND platform_user_id = v_patient
    AND status = 'creating'
    AND canonical_appointment_id IS NULL
    AND (
      tstzrange(slot_start, slot_end, '[)') && tstzrange(v_start, v_end, '[)')
      OR created_at < now() - interval '15 minutes'
    );
  UPDATE public.patient_bookings
  SET status = 'cancelled', cancelled_at = now(), updated_at = now()
  WHERE organization_id = v_org
    AND platform_user_id = v_patient
    AND status = 'cancelling'
    AND updated_at < now() - interval '15 minutes';
  UPDATE public.patient_bookings
  SET status = 'failed_sync', updated_at = now()
  WHERE organization_id = v_org
    AND platform_user_id = v_patient
    AND status = 'cancel_failed'
    AND updated_at < now() - interval '15 minutes';

  INSERT INTO public.patient_bookings (
    id, organization_id, platform_user_id, booking_type, city, category, slot_start, slot_end,
    status, contact_phone, contact_email, contact_name, branch_id, service_id, branch_service_id,
    city_code_snapshot, branch_title_snapshot, service_title_snapshot,
    duration_minutes_snapshot, price_minor_snapshot
  )
  SELECT
    v_id, v_org, v_patient, 'in_person', NULLIF(p_input ->> 'city', ''), 'general', v_start, v_end,
    'creating', p_input ->> 'contactPhone', NULLIF(p_input ->> 'contactEmail', ''),
    p_input ->> 'contactName', NULL, NULL, NULL,
    NULLIF(p_input ->> 'cityCodeSnapshot', ''), NULLIF(p_input ->> 'branchTitleSnapshot', ''),
    NULLIF(p_input ->> 'serviceTitleSnapshot', ''),
    NULLIF(p_input ->> 'durationMinutesSnapshot', '')::integer,
    NULLIF(p_input ->> 'priceMinorSnapshot', '')::integer
  WHERE NOT EXISTS (
    SELECT 1 FROM public.patient_bookings existing
    WHERE existing.organization_id = v_org
      AND existing.platform_user_id = v_patient
      AND existing.status IN (
        'creating', 'awaiting_payment', 'confirmed', 'rescheduled', 'cancelling', 'cancel_failed'
      )
      AND NOT (existing.status = 'creating' AND existing.canonical_appointment_id IS NULL)
      AND tstzrange(existing.slot_start, existing.slot_end, '[)') && tstzrange(v_start, v_end, '[)')
  )
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'slot_overlap' USING ERRCODE = '23P01';
  END IF;
  RETURN to_jsonb(v_row);
END
$function$;


CREATE OR REPLACE FUNCTION app.mutate_current_patient_booking(
  p_booking_id uuid,
  p_action text,
  p_payload_json text DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  p_payload jsonb := p_payload_json::jsonb;
  v_row public.patient_bookings%ROWTYPE;
  v_status text;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_booking_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );
  SELECT booking.* INTO v_row
  FROM public.patient_bookings booking
  WHERE booking.id = p_booking_id
    AND booking.organization_id = v_org
    AND booking.platform_user_id = v_patient
    AND EXISTS (
      SELECT 1 FROM public.org_enrollments enrollment
      WHERE enrollment.organization_id = v_org
        AND enrollment.platform_user_id = v_patient
        AND enrollment.status = 'active'
    )
  FOR UPDATE;
  IF v_row.id IS NULL THEN RETURN NULL; END IF;

  CASE p_action
    WHEN 'confirm' THEN
      UPDATE public.patient_bookings
      SET status = 'confirmed',
          canonical_appointment_id = COALESCE(NULLIF(p_payload ->> 'canonicalAppointmentId', '')::uuid,
                                               canonical_appointment_id),
          updated_at = now()
      WHERE id = p_booking_id RETURNING * INTO v_row;
    WHEN 'await_payment' THEN
      IF NULLIF(p_payload ->> 'canonicalAppointmentId', '') IS NULL THEN
        RAISE EXCEPTION 'canonical appointment required' USING ERRCODE = '22023';
      END IF;
      UPDATE public.patient_bookings
      SET status = 'awaiting_payment',
          canonical_appointment_id = (p_payload ->> 'canonicalAppointmentId')::uuid,
          updated_at = now()
      WHERE id = p_booking_id RETURNING * INTO v_row;
    WHEN 'failed_sync' THEN
      UPDATE public.patient_bookings SET status = 'failed_sync', updated_at = now()
      WHERE id = p_booking_id RETURNING * INTO v_row;
    WHEN 'cancelling' THEN
      UPDATE public.patient_bookings SET status = 'cancelling', updated_at = now()
      WHERE id = p_booking_id RETURNING * INTO v_row;
    WHEN 'cancel' THEN
      v_status := COALESCE(NULLIF(p_payload ->> 'status', ''), 'cancelled');
      IF v_status NOT IN ('cancelled', 'cancel_failed') THEN
        RAISE EXCEPTION 'invalid patient booking cancel status' USING ERRCODE = '22023';
      END IF;
      UPDATE public.patient_bookings
      SET status = v_status,
          cancelled_at = now(),
          cancel_reason = COALESCE(NULLIF(p_payload ->> 'reason', ''), cancel_reason),
          updated_at = now()
      WHERE id = p_booking_id RETURNING * INTO v_row;
    WHEN 'reschedule' THEN
      v_status := COALESCE(NULLIF(p_payload ->> 'status', ''), 'confirmed');
      IF v_status NOT IN ('confirmed', 'awaiting_payment')
         OR NULLIF(p_payload ->> 'slotStart', '')::timestamptz IS NULL
         OR NULLIF(p_payload ->> 'slotEnd', '')::timestamptz IS NULL
         OR (p_payload ->> 'slotEnd')::timestamptz <= (p_payload ->> 'slotStart')::timestamptz THEN
        RAISE EXCEPTION 'invalid patient booking reschedule payload' USING ERRCODE = '22023';
      END IF;
      UPDATE public.patient_bookings
      SET slot_start = (p_payload ->> 'slotStart')::timestamptz,
          slot_end = (p_payload ->> 'slotEnd')::timestamptz,
          status = v_status,
          updated_at = now()
      WHERE id = p_booking_id RETURNING * INTO v_row;
    ELSE
      RAISE EXCEPTION 'unsupported patient booking mutation' USING ERRCODE = '22023';
  END CASE;
  RETURN to_jsonb(v_row);
END
$function$;


CREATE OR REPLACE FUNCTION app.create_current_patient_booking_appointments(p_inputs_json text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
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
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_booking_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );
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
    IF NULLIF(v_input ->> 'organizationId', '')::uuid IS DISTINCT FROM v_org
       OR NULLIF(v_input ->> 'platformUserId', '')::uuid IS DISTINCT FROM v_patient
       OR v_input ->> 'source' <> 'native'
       OR v_status NOT IN ('confirmed', 'awaiting_payment')
       OR v_start IS NULL OR v_end IS NULL OR v_end <= v_start
       OR v_duration IS NULL OR v_duration < 1
       OR extract(epoch FROM (v_end - v_start))::integer <> v_duration * 60
       OR v_branch IS NULL OR v_specialist IS NULL OR v_service IS NULL THEN
      RAISE EXCEPTION 'invalid current patient appointment payload' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1
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
        AND availability.branch_id = v_branch
        AND availability.specialist_id = v_specialist
        AND availability.service_id = v_service
        AND availability.room_id IS NOT DISTINCT FROM v_room
        AND availability.is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'patient appointment catalog mismatch' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.patient_specialist_links (
      organization_id, patient_user_id, specialist_id, status, created_via
    ) VALUES (v_org, v_patient, v_specialist, 'active', 'first_appointment')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.be_appointments (
      organization_id, branch_id, room_id, specialist_id, service_id, platform_user_id,
      start_at, end_at, duration_minutes, chain_id, chain_position, source, status,
      original_start_at, reschedule_count, phone_normalized, attribution_json,
      appointment_reminder_allowed_preset_ids, appointment_reminder_preset_id,
      appointment_reminder_selection_source, created_at, updated_at
    ) VALUES (
      v_org, v_branch, v_room, v_specialist, v_service, v_patient,
      v_start, v_end, v_duration, NULLIF(v_input ->> 'chainId', '')::uuid,
      NULLIF(v_input ->> 'chainPosition', '')::integer, 'native', v_status,
      v_start, 0, NULLIF(v_input ->> 'phoneNormalized', ''),
      COALESCE(v_input -> 'attributionJson', '{}'::jsonb),
      COALESCE(v_input -> 'appointmentReminderAllowedPresetIds', '[]'::jsonb),
      NULLIF(v_input ->> 'appointmentReminderPresetId', ''),
      COALESCE(NULLIF(v_input ->> 'appointmentReminderSelectionSource', ''), 'specialist_default'),
      now(), now()
    ) RETURNING * INTO v_row;

    INSERT INTO public.be_appointment_history_events (
      organization_id, appointment_id, event_type, actor_id, payload, occurred_at
    ) VALUES (v_org, v_row.id, 'created', v_patient, jsonb_build_object('status', v_status), now());
    INSERT INTO public.be_patient_timeline_events (
      organization_id, platform_user_id, domain, event_type, linked_object_type,
      linked_object_id, payload, occurred_at
    ) VALUES (
      v_org, v_patient, 'appointment', 'appointment_created', 'appointment', v_row.id::text,
      jsonb_build_object('status', v_status), now()
    );
    v_results := v_results || jsonb_build_array(to_jsonb(v_row));
  END LOOP;
  RETURN v_results;
END
$function$;


CREATE OR REPLACE FUNCTION app.read_current_patient_booking_appointment(p_appointment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_result jsonb;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_booking_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );
  SELECT to_jsonb(appointment) INTO v_result
  FROM public.be_appointments appointment
  WHERE appointment.id = p_appointment_id
    AND appointment.organization_id = v_org
    AND appointment.platform_user_id = v_patient
    AND appointment.deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.org_enrollments enrollment
      WHERE enrollment.organization_id = v_org
        AND enrollment.platform_user_id = v_patient
        AND enrollment.status = 'active'
    );
  RETURN v_result;
END
$function$;


CREATE OR REPLACE FUNCTION app.read_current_patient_booking_row(p_id uuid, p_kind text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_result jsonb;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_booking_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );
  IF p_kind NOT IN ('booking', 'appointment') THEN
    RAISE EXCEPTION 'unsupported patient booking row kind' USING ERRCODE = '22023';
  END IF;
  SELECT to_jsonb(booking) INTO v_result
  FROM public.patient_bookings booking
  WHERE booking.organization_id = v_org
    AND booking.platform_user_id = v_patient
    AND ((p_kind = 'booking' AND booking.id = p_id)
      OR (p_kind = 'appointment' AND booking.canonical_appointment_id = p_id))
    AND EXISTS (
      SELECT 1 FROM public.org_enrollments enrollment
      WHERE enrollment.organization_id = v_org
        AND enrollment.platform_user_id = v_patient
        AND enrollment.status = 'active'
    )
  LIMIT 1;
  RETURN v_result;
END
$function$;


CREATE OR REPLACE FUNCTION app.read_current_patient_booking_policies(p_kind text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_result jsonb;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_booking_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.org_enrollments enrollment
    WHERE enrollment.organization_id = v_org
      AND enrollment.platform_user_id = v_patient
      AND enrollment.status = 'active'
  ) THEN RETURN '[]'::jsonb; END IF;
  IF p_kind = 'cancellation' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(policy) ORDER BY policy.sort_order, policy.title), '[]'::jsonb)
    INTO v_result FROM public.be_cancellation_policies policy
    WHERE policy.organization_id = v_org;
  ELSIF p_kind = 'reschedule' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(policy) ORDER BY policy.sort_order, policy.title), '[]'::jsonb)
    INTO v_result FROM public.be_reschedule_policies policy
    WHERE policy.organization_id = v_org;
  ELSE
    RAISE EXCEPTION 'unsupported patient booking policy kind' USING ERRCODE = '22023';
  END IF;
  RETURN v_result;
END
$function$;


CREATE OR REPLACE FUNCTION app.read_current_patient_booking_reschedules(p_appointment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_result jsonb;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_booking_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.be_appointments appointment
    WHERE appointment.id = p_appointment_id
      AND appointment.organization_id = v_org
      AND appointment.platform_user_id = v_patient
      AND appointment.deleted_at IS NULL
  ) THEN RETURN '[]'::jsonb; END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(reschedule) ORDER BY reschedule.created_at), '[]'::jsonb)
  INTO v_result FROM public.be_appointment_reschedules reschedule
  WHERE reschedule.organization_id = v_org
    AND reschedule.appointment_id = p_appointment_id;
  RETURN v_result;
END
$function$;


CREATE OR REPLACE FUNCTION app.apply_current_patient_booking_reschedule(p_input_json text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  p_input jsonb := p_input_json::jsonb;
  v_id uuid := NULLIF(p_input ->> 'appointmentId', '')::uuid;
  v_start timestamptz := NULLIF(p_input ->> 'newStartAt', '')::timestamptz;
  v_end timestamptz := NULLIF(p_input ->> 'newEndAt', '')::timestamptz;
  v_duration integer := NULLIF(p_input ->> 'durationMinutes', '')::integer;
  v_current public.be_appointments%ROWTYPE;
  v_updated public.be_appointments%ROWTYPE;
  v_original_start timestamptz;
  v_payload jsonb;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_booking_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );
  IF NULLIF(p_input ->> 'organizationId', '')::uuid IS DISTINCT FROM v_org
     OR NULLIF(p_input ->> 'actorId', '')::uuid IS DISTINCT FROM v_patient
     OR p_input ->> 'actorType' <> 'patient'
     OR COALESCE((p_input ->> 'manualOverride')::boolean, FALSE) = TRUE
     OR v_start IS NULL OR v_end IS NULL OR v_end <= v_start OR v_duration < 1
     OR extract(epoch FROM (v_end - v_start))::integer <> v_duration * 60 THEN
    RAISE EXCEPTION 'invalid patient reschedule payload' USING ERRCODE = '22023';
  END IF;
  SELECT appointment.* INTO v_current
  FROM public.be_appointments appointment
  WHERE appointment.id = v_id
    AND appointment.organization_id = v_org
    AND appointment.platform_user_id = v_patient
    AND appointment.deleted_at IS NULL
  FOR UPDATE;
  IF v_current.id IS NULL THEN
    RAISE EXCEPTION 'patient appointment not found' USING ERRCODE = '42501';
  END IF;
  IF v_current.status IN ('cancelled_by_patient', 'cancelled_by_specialist', 'no_show', 'late_cancellation') THEN
    RAISE EXCEPTION 'state_conflict' USING ERRCODE = '55000';
  END IF;
  IF NULLIF(p_input ->> 'branchId', '')::uuid IS DISTINCT FROM v_current.branch_id
     OR NULLIF(p_input ->> 'roomId', '')::uuid IS DISTINCT FROM v_current.room_id
     OR NULLIF(p_input ->> 'specialistId', '')::uuid IS DISTINCT FROM v_current.specialist_id
     OR NULLIF(p_input ->> 'serviceId', '')::uuid IS DISTINCT FROM v_current.service_id THEN
    RAISE EXCEPTION 'patient reschedule catalog change denied' USING ERRCODE = '42501';
  END IF;

  v_original_start := COALESCE(v_current.original_start_at, v_current.start_at);
  UPDATE public.be_appointments
  SET start_at = v_start,
      end_at = v_end,
      duration_minutes = v_duration,
      original_start_at = v_original_start,
      reschedule_count = v_current.reschedule_count + 1,
      status = 'confirmed',
      updated_at = now()
  WHERE id = v_id
  RETURNING * INTO v_updated;

  INSERT INTO public.be_appointment_reschedules (
    organization_id, appointment_id, from_start_at, from_end_at, to_start_at, to_end_at,
    actor_type, actor_id, was_in_free_reschedule_window,
    free_cancellation_available_at_reschedule, free_cancellation_available_after,
    applied_policy_id, applied_policy_snapshot, reason, staff_comment,
    notifications_sent, manual_override, created_at
  ) VALUES (
    v_org, v_id, v_current.start_at, v_current.end_at, v_start, v_end,
    'patient', v_patient, (p_input ->> 'wasInFreeRescheduleWindow')::boolean,
    (p_input ->> 'freeCancellationAvailableAtReschedule')::boolean,
    (p_input ->> 'freeCancellationAvailableAfter')::boolean,
    CASE WHEN p_input -> 'policy' ->> 'id' = 'default' THEN NULL
      ELSE NULLIF(p_input -> 'policy' ->> 'id', '')::uuid END,
    COALESCE(p_input -> 'policy', '{}'::jsonb) || jsonb_build_object(
      'cancellationPolicyId', p_input -> 'cancellationPolicy' ->> 'id'
    ),
    NULLIF(p_input ->> 'reason', ''), NULL, COALESCE(p_input -> 'notificationsSent', '{}'::jsonb),
    FALSE, now()
  );
  v_payload := jsonb_build_object(
    'fromStatus', v_current.status, 'toStatus', 'confirmed',
    'fromStartAt', v_current.start_at, 'toStartAt', v_start, 'manualOverride', FALSE
  );
  INSERT INTO public.be_appointment_history_events (
    organization_id, appointment_id, event_type, actor_id, payload, occurred_at
  ) VALUES (v_org, v_id, 'rescheduled', v_patient, v_payload, now());
  INSERT INTO public.be_patient_timeline_events (
    organization_id, platform_user_id, domain, event_type, linked_object_type,
    linked_object_id, payload, occurred_at
  ) VALUES (
    v_org, v_patient, 'appointment', 'appointment_rescheduled', 'appointment',
    v_id::text, v_payload, now()
  );
  RETURN to_jsonb(v_updated);
END
$function$;


CREATE OR REPLACE FUNCTION app.apply_current_patient_booking_cancellation(p_input_json text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  p_input jsonb := p_input_json::jsonb;
  v_id uuid := NULLIF(p_input ->> 'appointmentId', '')::uuid;
  v_target text := p_input ->> 'targetStatus';
  v_current public.be_appointments%ROWTYPE;
  v_updated public.be_appointments%ROWTYPE;
  v_payload jsonb;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_booking_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );
  IF NULLIF(p_input ->> 'organizationId', '')::uuid IS DISTINCT FROM v_org
     OR NULLIF(p_input ->> 'actorId', '')::uuid IS DISTINCT FROM v_patient
     OR p_input ->> 'actorType' <> 'patient'
     OR COALESCE((p_input ->> 'manualOverride')::boolean, FALSE) = TRUE
     OR v_target NOT IN ('cancelled_by_patient', 'late_cancellation') THEN
    RAISE EXCEPTION 'invalid patient cancellation payload' USING ERRCODE = '22023';
  END IF;
  SELECT appointment.* INTO v_current
  FROM public.be_appointments appointment
  WHERE appointment.id = v_id
    AND appointment.organization_id = v_org
    AND appointment.platform_user_id = v_patient
    AND appointment.deleted_at IS NULL
  FOR UPDATE;
  IF v_current.id IS NULL THEN
    RAISE EXCEPTION 'patient appointment not found' USING ERRCODE = '42501';
  END IF;
  IF v_current.status IN ('cancelled_by_patient', 'late_cancellation') THEN
    RETURN to_jsonb(v_current);
  END IF;
  IF v_current.status IN ('cancelled_by_specialist', 'no_show') THEN
    RAISE EXCEPTION 'state_conflict' USING ERRCODE = '55000';
  END IF;
  UPDATE public.be_appointments SET status = v_target, updated_at = now()
  WHERE id = v_id RETURNING * INTO v_updated;

  INSERT INTO public.be_appointment_cancellations (
    organization_id, appointment_id, actor_type, actor_id, cancellation_type, reason,
    was_free, was_penalized, package_session_charged, prepayment_retained,
    prepayment_refunded, staff_comment, notifications_sent, manual_override,
    applied_policy_id, applied_policy_snapshot, created_at
  ) VALUES (
    v_org, v_id, 'patient', v_patient, p_input ->> 'decisionType', NULLIF(p_input ->> 'reason', ''),
    (p_input ->> 'wasFree')::boolean, (p_input ->> 'wasPenalized')::boolean,
    (p_input ->> 'packageSessionCharged')::boolean, (p_input ->> 'prepaymentRetained')::boolean,
    (p_input ->> 'prepaymentRefunded')::boolean, NULL,
    COALESCE(p_input -> 'notificationsSent', '{}'::jsonb), FALSE,
    CASE WHEN p_input -> 'policy' ->> 'id' = 'default' THEN NULL
      ELSE NULLIF(p_input -> 'policy' ->> 'id', '')::uuid END,
    COALESCE(p_input -> 'policy', '{}'::jsonb), now()
  );
  v_payload := jsonb_build_object(
    'fromStatus', v_current.status, 'toStatus', v_target,
    'decisionType', p_input ->> 'decisionType',
    'wasFree', (p_input ->> 'wasFree')::boolean, 'manualOverride', FALSE
  );
  INSERT INTO public.be_appointment_history_events (
    organization_id, appointment_id, event_type, actor_id, payload, occurred_at
  ) VALUES (v_org, v_id, 'cancelled', v_patient, v_payload, now());
  INSERT INTO public.be_patient_timeline_events (
    organization_id, platform_user_id, domain, event_type, linked_object_type,
    linked_object_id, payload, occurred_at
  ) VALUES (
    v_org, v_patient, 'appointment', 'appointment_cancelled', 'appointment',
    v_id::text, v_payload, now()
  );
  RETURN to_jsonb(v_updated);
END
$function$;


CREATE OR REPLACE FUNCTION app.patch_current_patient_booking_notifications(
  p_appointment_id uuid,
  p_kind text,
  p_notifications_json text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  v_notifications jsonb := p_notifications_json::jsonb;
  v_event_id uuid;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_booking_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.be_appointments appointment
    WHERE appointment.id = p_appointment_id
      AND appointment.organization_id = v_org
      AND appointment.platform_user_id = v_patient
      AND appointment.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'patient appointment not found' USING ERRCODE = '42501';
  END IF;
  IF p_kind = 'reschedule' THEN
    SELECT event.id INTO v_event_id FROM public.be_appointment_reschedules event
    WHERE event.organization_id = v_org AND event.appointment_id = p_appointment_id
    ORDER BY event.created_at DESC LIMIT 1;
    IF v_event_id IS NOT NULL THEN
      UPDATE public.be_appointment_reschedules SET notifications_sent = v_notifications
      WHERE id = v_event_id;
    END IF;
  ELSIF p_kind = 'cancellation' THEN
    SELECT event.id INTO v_event_id FROM public.be_appointment_cancellations event
    WHERE event.organization_id = v_org AND event.appointment_id = p_appointment_id
    ORDER BY event.created_at DESC LIMIT 1;
    IF v_event_id IS NOT NULL THEN
      UPDATE public.be_appointment_cancellations SET notifications_sent = v_notifications
      WHERE id = v_event_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'unsupported notification patch kind' USING ERRCODE = '22023';
  END IF;
END
$function$;


CREATE OR REPLACE FUNCTION app.reserve_current_patient_booking_package(p_input_json text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_patient uuid := app.current_patient_user_id();
  p_input jsonb := p_input_json::jsonb;
  v_package uuid := NULLIF(p_input ->> 'patientPackageId', '')::uuid;
  v_service uuid := NULLIF(p_input ->> 'serviceId', '')::uuid;
  v_appointment uuid := NULLIF(p_input ->> 'appointmentId', '')::uuid;
  v_item uuid;
  v_usage public.be_package_usages%ROWTYPE;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_patient_booking_owner'::name,
    ARRAY['app_patient'::name]::name[]
  );
  IF NULLIF(p_input ->> 'organizationId', '')::uuid IS DISTINCT FROM v_org
     OR NULLIF(p_input ->> 'platformUserId', '')::uuid IS DISTINCT FROM v_patient THEN
    RAISE EXCEPTION 'patient package booking scope mismatch' USING ERRCODE = '42501';
  END IF;
  PERFORM package_row.id FROM public.be_patient_packages package_row
  WHERE package_row.id = v_package
    AND package_row.organization_id = v_org
    AND package_row.platform_user_id = v_patient
    AND package_row.status = 'active'
    AND (package_row.valid_from IS NULL OR package_row.valid_from <= now())
    AND (package_row.valid_until IS NULL OR package_row.valid_until >= now())
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'package_not_found' USING ERRCODE = 'P0001'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.be_appointments appointment
    WHERE appointment.id = v_appointment
      AND appointment.organization_id = v_org
      AND appointment.platform_user_id = v_patient
      AND appointment.service_id = v_service
      AND appointment.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'patient package appointment mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT usage.* INTO v_usage FROM public.be_package_usages usage
  WHERE usage.organization_id = v_org
    AND usage.patient_package_id = v_package
    AND usage.appointment_id = v_appointment
    AND usage.usage_kind = 'reserve'
  ORDER BY usage.occurred_at DESC LIMIT 1;
  IF v_usage.id IS NOT NULL THEN RETURN to_jsonb(v_usage); END IF;

  SELECT item.id INTO v_item
  FROM public.be_patient_package_items item
  LEFT JOIN public.be_package_usages usage
    ON usage.organization_id = v_org
   AND usage.patient_package_id = v_package
   AND usage.patient_package_item_id = item.id
  WHERE item.patient_package_id = v_package
    AND item.service_id = v_service
  GROUP BY item.id, item.quantity_initial, item.sort_order
  HAVING item.quantity_initial
    - GREATEST(0,
        COALESCE(sum(usage.quantity) FILTER (WHERE usage.usage_kind IN ('consume', 'manual_adjust')), 0)
        + COALESCE(sum(usage.quantity) FILTER (WHERE usage.usage_kind = 'penalty'), 0)
        - COALESCE(sum(usage.quantity) FILTER (WHERE usage.usage_kind = 'refund'), 0))
    + COALESCE(sum(usage.quantity) FILTER (WHERE usage.usage_kind = 'release'), 0)
    - COALESCE(sum(usage.quantity) FILTER (WHERE usage.usage_kind = 'reserve'), 0) > 0
  ORDER BY item.sort_order, item.id
  LIMIT 1;
  IF v_item IS NULL THEN RAISE EXCEPTION 'package_no_balance' USING ERRCODE = 'P0001'; END IF;

  INSERT INTO public.be_package_usages (
    organization_id, patient_package_id, patient_package_item_id, appointment_id,
    usage_kind, quantity, created_by_platform_user_id, occurred_at, created_at
  ) VALUES (
    v_org, v_package, v_item, v_appointment, 'reserve', 1, v_patient, now(), now()
  ) RETURNING * INTO v_usage;
  UPDATE public.be_appointments SET package_usage_ref = v_usage.id::text, updated_at = now()
  WHERE id = v_appointment;
  INSERT INTO public.be_package_history_events (
    organization_id, patient_package_id, event_type, payload_json, occurred_at
  ) VALUES (
    v_org, v_package, 'reserved_for_appointment',
    jsonb_build_object('appointmentId', v_appointment, 'usageId', v_usage.id), now()
  );
  RETURN to_jsonb(v_usage);
END
$function$;
