-- BCB-MIGRATION-BACKFILL
-- BCB-MIGRATION-VERIFY: SELECT NOT EXISTS (SELECT 1 FROM public.be_organizations AS organization WHERE NOT EXISTS (SELECT 1 FROM public.system_settings AS setting WHERE setting.organization_id = organization.id AND setting.key = 'doctor_appointment_reminder_offsets_minutes' AND setting.scope = 'doctor')) AND EXISTS (SELECT 1 FROM pg_catalog.pg_attribute AS attribute JOIN pg_catalog.pg_class AS relation ON relation.oid = attribute.attrelid JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace WHERE namespace.nspname = 'public' AND relation.relname = 'be_appointments' AND attribute.attname = 'appointment_reminder_available_offsets_minutes' AND attribute.atttypid = 'jsonb'::pg_catalog.regtype AND attribute.attnotnull AND NOT attribute.attisdropped) AND EXISTS (SELECT 1 FROM pg_catalog.pg_attribute AS attribute JOIN pg_catalog.pg_class AS relation ON relation.oid = attribute.attrelid JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace WHERE namespace.nspname = 'public' AND relation.relname = 'be_appointments' AND attribute.attname = 'appointment_reminder_offsets_minutes' AND attribute.atttypid = 'jsonb'::pg_catalog.regtype AND attribute.attnotnull AND NOT attribute.attisdropped) AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute AS attribute JOIN pg_catalog.pg_class AS relation ON relation.oid = attribute.attrelid JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace WHERE namespace.nspname = 'public' AND ((relation.relname = 'be_appointments' AND attribute.attname IN ('appointment_reminder_allowed_preset_ids', 'appointment_reminder_preset_id')) OR (relation.relname = 'be_specialists' AND attribute.attname IN ('appointment_reminder_allowed_preset_ids', 'appointment_reminder_default_preset_id'))) AND NOT attribute.attisdropped)
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
        ELSE '[]'
      END,
    updated_at = pg_catalog.now()
WHERE appointment.appointment_reminder_preset_id IN (
        'day_and_two_hours', 'day_before', 'two_hours_before'
      )
   OR appointment.appointment_reminder_allowed_preset_ids ?| ARRAY[
        'day_and_two_hours', 'day_before', 'two_hours_before'
      ];
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.be_appointments
  RENAME COLUMN appointment_reminder_allowed_preset_ids
  TO appointment_reminder_available_offsets_minutes;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.be_appointments
  RENAME COLUMN appointment_reminder_preset_id
  TO appointment_reminder_offsets_minutes;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.be_appointments
  ALTER COLUMN appointment_reminder_offsets_minutes TYPE jsonb
    USING COALESCE(NULLIF(appointment_reminder_offsets_minutes, '')::jsonb, '[]'::jsonb),
  ALTER COLUMN appointment_reminder_offsets_minutes SET DEFAULT '[]'::jsonb,
  ALTER COLUMN appointment_reminder_offsets_minutes SET NOT NULL;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.be_specialists
  DROP COLUMN appointment_reminder_allowed_preset_ids,
  DROP COLUMN appointment_reminder_default_preset_id;
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
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.read_current_patient_booking_creation_snapshot(uuid,uuid,text,text)
-- BCB-MIGRATION-VERIFY: SELECT p.prosecdef FROM pg_catalog.pg_proc AS p WHERE p.oid = pg_catalog.to_regprocedure('app.read_current_patient_booking_creation_snapshot(uuid,uuid,text,text)')
-- Reminder periods are organization settings now. The booking catalog snapshot no longer reads
-- the deleted specialist preset columns.
CREATE OR REPLACE FUNCTION app.read_current_patient_booking_creation_snapshot(
  p_branch_id uuid,
  p_service_id uuid,
  p_date_from text,
  p_date_to text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL RESTRICTED
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_snapshot jsonb;
  v_org uuid;
  v_catalog jsonb;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_booking_owner'::name,
    'app_patient'::name,
    'patient'::app.port_context_class,
    'booking.patient-creation-snapshot.read',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send($2))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg
    ]),
    'app.read_current_patient_booking_creation_snapshot(uuid,uuid,text,text)'::regprocedure
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

  SELECT pg_catalog.jsonb_build_object(
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
    'serviceSortOrder', service.sort_order
  )
  INTO v_catalog
  FROM public.be_branches AS branch
  JOIN public.be_clinic_services AS service
    ON service.id = p_service_id
   AND service.organization_id = v_org
   AND service.is_active = TRUE
   AND service.public_widget_visible = TRUE
   AND service.admin_manual_only = FALSE
  WHERE branch.id = p_branch_id
    AND branch.organization_id = v_org
    AND branch.is_active = TRUE;

  IF v_catalog IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN pg_catalog.jsonb_set(
    v_snapshot,
    '{context,patientCatalogSnapshot}',
    v_catalog,
    TRUE
  );
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_patient_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-REHOME-FUNCTION: app.create_current_patient_booking_appointments(text)
-- BCB-MIGRATION-VERIFY: SELECT p.prosecdef AND pg_catalog.strpos(p.prosrc, 'appointmentReminderAvailableOffsetsMinutes') > 0 FROM pg_catalog.pg_proc AS p WHERE p.oid = pg_catalog.to_regprocedure('app.create_current_patient_booking_appointments(text)')
-- The existing patient creation door persists the validated minute arrays carried by the domain
-- command. It rejects malformed, duplicate, fourth, or non-subset selections at the DB boundary.
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
  v_available_offsets jsonb;
  v_selected_offsets jsonb;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_booking_owner'::name,
    'app_patient'::name,
    'patient'::app.port_context_class,
    'booking.patient-appointments.create',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg
    ]),
    'app.create_current_patient_booking_appointments(text)'::regprocedure
  );
  IF v_org IS NULL OR v_patient IS NULL OR pg_catalog.jsonb_typeof(p_inputs) <> 'array'
     OR pg_catalog.jsonb_array_length(p_inputs) < 1
     OR pg_catalog.jsonb_array_length(p_inputs) > 8
     OR NOT EXISTS (
       SELECT 1
       FROM public.org_enrollments AS enrollment
       WHERE enrollment.organization_id = v_org
         AND enrollment.platform_user_id = v_patient
         AND enrollment.status = 'active'
     ) THEN
    RAISE EXCEPTION 'patient appointment context unavailable' USING ERRCODE = '42501';
  END IF;

  FOR v_input IN SELECT value FROM pg_catalog.jsonb_array_elements(p_inputs)
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
    v_prepayment_required_minor := COALESCE(
      NULLIF(v_input ->> 'prepaymentRequiredMinor', '')::integer,
      0
    );
    v_payment_deadline_at := NULLIF(v_input ->> 'paymentDeadlineAt', '')::timestamptz;
    v_available_offsets := COALESCE(
      v_input -> 'appointmentReminderAvailableOffsetsMinutes',
      '[]'::jsonb
    );
    v_selected_offsets := COALESCE(
      v_input -> 'appointmentReminderOffsetsMinutes',
      '[]'::jsonb
    );

    IF pg_catalog.jsonb_typeof(v_available_offsets) <> 'array'
       OR pg_catalog.jsonb_typeof(v_selected_offsets) <> 'array' THEN
      RAISE EXCEPTION 'invalid current patient appointment payload' USING ERRCODE = '22023';
    END IF;
    IF pg_catalog.jsonb_array_length(v_available_offsets) > 3
       OR pg_catalog.jsonb_array_length(v_selected_offsets) > 3
       OR EXISTS (
         SELECT 1
         FROM pg_catalog.jsonb_array_elements(v_available_offsets) AS item(value)
         WHERE pg_catalog.jsonb_typeof(item.value) <> 'number'
            OR (item.value #>> '{}') !~ '^[1-9][0-9]*$'
       )
       OR EXISTS (
         SELECT 1
         FROM pg_catalog.jsonb_array_elements(v_selected_offsets) AS item(value)
         WHERE pg_catalog.jsonb_typeof(item.value) <> 'number'
            OR (item.value #>> '{}') !~ '^[1-9][0-9]*$'
       )
       OR (
         SELECT pg_catalog.count(*)
         FROM pg_catalog.jsonb_array_elements(v_available_offsets)
       ) <> (
         SELECT pg_catalog.count(DISTINCT item.value)
         FROM pg_catalog.jsonb_array_elements(v_available_offsets) AS item(value)
       )
       OR (
         SELECT pg_catalog.count(*)
         FROM pg_catalog.jsonb_array_elements(v_selected_offsets)
       ) <> (
         SELECT pg_catalog.count(DISTINCT item.value)
         FROM pg_catalog.jsonb_array_elements(v_selected_offsets) AS item(value)
       )
       OR NOT (v_available_offsets @> v_selected_offsets) THEN
      RAISE EXCEPTION 'invalid current patient appointment payload' USING ERRCODE = '22023';
    END IF;

    IF NULLIF(v_input ->> 'organizationId', '')::uuid IS DISTINCT FROM v_org
       OR NULLIF(v_input ->> 'platformUserId', '')::uuid IS DISTINCT FROM v_patient
       OR v_input ->> 'source' NOT IN ('native', 'public_widget')
       OR v_status NOT IN ('confirmed', 'awaiting_payment')
       OR v_start IS NULL OR v_end IS NULL OR v_end <= v_start
       OR v_duration IS NULL OR v_duration < 1
       OR extract(epoch FROM (v_end - v_start))::integer <> v_duration * 60
       OR (v_delivery_format = 'in_person' AND (
         v_branch IS NULL OR v_specialist IS NULL OR v_service IS NULL
       ))
       OR v_delivery_format NOT IN ('in_person', 'online')
       OR v_prepayment_mode NOT IN ('disabled', 'fixed_minor', 'percent', 'full_price')
       OR v_prepayment_required_minor < 0
       OR (v_prepayment_percent_bps IS NOT NULL AND (
         v_prepayment_percent_bps < 0 OR v_prepayment_percent_bps > 10000
       ))
       OR (v_prepayment_amount_minor IS NOT NULL AND v_prepayment_amount_minor < 0) THEN
      RAISE EXCEPTION 'invalid current patient appointment payload' USING ERRCODE = '22023';
    END IF;
    IF v_status = 'awaiting_payment'
       AND (v_prepayment_required_minor <= 0 OR v_payment_deadline_at IS NULL) THEN
      RAISE EXCEPTION 'invalid current patient appointment payload' USING ERRCODE = '22023';
    END IF;
    IF v_delivery_format = 'in_person' AND NOT EXISTS (
      SELECT 1
      FROM public.be_specialist_service_availability AS availability
      JOIN public.be_specialists AS specialist
        ON specialist.id = availability.specialist_id
       AND specialist.organization_id = availability.organization_id
       AND specialist.is_active = TRUE
      JOIN public.be_branches AS branch
        ON branch.id = availability.branch_id
       AND branch.organization_id = availability.organization_id
       AND branch.is_active = TRUE
      JOIN public.be_clinic_services AS service
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
    SELECT service.price_minor
    INTO v_price_minor
    FROM public.be_clinic_services AS service
    WHERE service.id = v_service
      AND service.organization_id = v_org;
    IF v_price_minor IS NOT NULL AND v_prepayment_required_minor > v_price_minor THEN
      RAISE EXCEPTION 'invalid current patient appointment payload' USING ERRCODE = '22023';
    END IF;
    IF v_specialist IS NOT NULL THEN
      INSERT INTO public.patient_specialist_links (
        organization_id, patient_user_id, specialist_id, status, created_via
      ) VALUES (
        v_org, v_patient, v_specialist, 'active', 'first_appointment'
      ) ON CONFLICT DO NOTHING;
    END IF;

    INSERT INTO public.be_appointments (
      organization_id, branch_id, room_id, specialist_id, service_id, platform_user_id,
      start_at, end_at, duration_minutes, chain_id, chain_position, source, status, delivery_format,
      original_start_at, reschedule_count, phone_normalized, attribution_json,
      appointment_reminder_available_offsets_minutes, appointment_reminder_offsets_minutes,
      appointment_reminder_selection_source, price_minor, price_currency, prepayment_mode,
      prepayment_percent_bps, prepayment_amount_minor, prepayment_required_minor,
      prepayment_paid_minor, payment_deadline_at, created_at, updated_at
    ) VALUES (
      v_org, v_branch, v_room, v_specialist, v_service, v_patient,
      v_start, v_end, v_duration, NULLIF(v_input ->> 'chainId', '')::uuid,
      NULLIF(v_input ->> 'chainPosition', '')::integer, v_input ->> 'source', v_status,
      v_delivery_format, v_start, 0, NULLIF(v_input ->> 'phoneNormalized', ''),
      COALESCE(v_input -> 'attributionJson', '{}'::jsonb), v_available_offsets,
      v_selected_offsets,
      COALESCE(
        NULLIF(v_input ->> 'appointmentReminderSelectionSource', ''),
        'specialist_default'
      ),
      v_price_minor, COALESCE(NULLIF(v_input ->> 'priceCurrency', ''), 'RUB'),
      v_prepayment_mode, v_prepayment_percent_bps, v_prepayment_amount_minor,
      v_prepayment_required_minor, 0, v_payment_deadline_at,
      pg_catalog.now(), pg_catalog.now()
    ) RETURNING * INTO v_row;
    INSERT INTO public.be_appointment_history_events (
      organization_id, appointment_id, event_type, actor_id, payload, occurred_at
    ) VALUES (
      v_org, v_row.id, 'created', v_patient,
      pg_catalog.jsonb_build_object('status', v_status), pg_catalog.now()
    );
    INSERT INTO public.be_patient_timeline_events (
      organization_id, platform_user_id, domain, event_type, linked_object_type,
      linked_object_id, payload, occurred_at
    ) VALUES (
      v_org, v_patient, 'appointment', 'appointment_created', 'appointment', v_row.id::text,
      pg_catalog.jsonb_build_object('status', v_status), pg_catalog.now()
    );
    v_results := v_results || pg_catalog.jsonb_build_array(pg_catalog.to_jsonb(v_row));
  END LOOP;
  RETURN v_results;
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
  SET appointment_reminder_offsets_minutes = v_offsets,
      appointment_reminder_selection_source = 'patient',
      updated_at = pg_catalog.now()
  WHERE appointment.id = p_appointment_id
    AND appointment.organization_id = v_org
    AND appointment.platform_user_id = v_patient
    AND appointment.deleted_at IS NULL
    AND appointment.status IN ('confirmed', 'rescheduled')
    AND appointment.appointment_reminder_available_offsets_minutes @> v_offsets
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
