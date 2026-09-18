-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-SCHEMA-CREATE: public
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.to_regclass('public.be_payment_history_retention_uidx') IS NOT NULL
-- S11 F1-F4: business retry identity belongs to the existing generation/ledger/history roots.
-- An appointment can retain a captured payment once; multi-slot payments retain once per appointment.
CREATE UNIQUE INDEX IF NOT EXISTS be_payment_history_retention_uidx
  ON public.be_payment_history_events (organization_id, appointment_id, payment_id)
  WHERE appointment_id IS NOT NULL AND payment_id IS NOT NULL AND event_type = 'prepayment_retained';

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_materialization_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.replace_appointment_reminder_generation(
  p_organization_id uuid,
  p_appointment_id uuid,
  p_generation_start_at timestamp with time zone,
  p_deliveries text,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_deliveries jsonb;
  v_delivery jsonb;
  v_event_ids text[];
  v_event_id text;
  v_kind text;
  v_channel text;
  v_payload jsonb;
  v_max_attempts integer;
  v_next_retry_at timestamp with time zone;
  v_current boolean;
  v_inserted integer := 0;
  v_row_count integer;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_reminder_materialization_owner'::name,
    'app_tenant_service'::name,
    'tenant_service'::app.port_context_class,
    'reminder.appointment-generation.replace',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send($2))::app.port_typed_arg,
      ROW('timestamptz@1', pg_catalog.timestamptz_send($3))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($5))::app.port_typed_arg
    ]),
    'app.replace_appointment_reminder_generation(uuid,uuid,timestamp with time zone,text,text)'::regprocedure
  );

  IF v_org IS NULL OR p_organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'appointment reminder generation organization mismatch' USING ERRCODE = '42501';
  END IF;
  IF p_appointment_id IS NULL OR p_generation_start_at IS NULL THEN
    RAISE EXCEPTION 'appointment_reminder_generation_target_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR pg_catalog.length(pg_catalog.btrim(p_reason)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'appointment_reminder_generation_reason_invalid' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_deliveries := p_deliveries::jsonb;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'appointment_reminder_generation_deliveries_invalid' USING ERRCODE = '22023';
  END;
  -- Read mode never mutates the queue. Its event-id lookup attests the exact generation revision,
  -- while the appointment predicate also rejects cancellation/offset edits before rematerialization.
  IF pg_catalog.jsonb_typeof(v_deliveries) = 'object'
     AND v_deliveries ->> 'operation' = 'read' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.outgoing_delivery_queue AS queue
      JOIN public.be_appointments AS appointment
        ON appointment.organization_id = queue.organization_id
       AND appointment.id = p_appointment_id
      WHERE queue.event_id = 'booking.lifecycle:reminder_due:' || (v_deliveries ->> 'reminderId')
        AND queue.organization_id = v_org
        AND queue.kind = 'booking_lifecycle' AND queue.channel = 'internal'
        AND queue.status IN ('pending', 'failed_retryable', 'processing')
        AND queue.payload_json #>> '{bookingLifecycle,fact}' = 'reminder_due'
        AND queue.payload_json #>> '{bookingLifecycle,organizationId}' = v_org::text
        AND queue.payload_json #>> '{bookingLifecycle,appointmentId}' = p_appointment_id::text
        AND queue.payload_json #>> '{bookingLifecycle,reminderId}' = v_deliveries ->> 'reminderId'
        AND (queue.payload_json #>> '{bookingLifecycle,generationStartAt}')::timestamptz = p_generation_start_at
        AND (queue.payload_json #>> '{bookingLifecycle,dueAt}')::timestamptz = (v_deliveries ->> 'dueAt')::timestamptz
        AND (v_deliveries ->> 'dueAt')::timestamptz <= pg_catalog.now()
        AND appointment.start_at = p_generation_start_at
        AND appointment.deleted_at IS NULL
        AND appointment.status IN ('created', 'awaiting_payment', 'paid', 'confirmed', 'rescheduled',
          'visit_confirmed', 'charged_to_package')
        AND EXISTS (
          SELECT 1 FROM pg_catalog.jsonb_array_elements_text(appointment.appointment_reminder_offsets_minutes) AS offsets(minutes)
          WHERE minutes::integer > 0
            AND appointment.start_at - minutes::integer * interval '1 minute' = (v_deliveries ->> 'dueAt')::timestamptz
        )
    ) INTO v_current;
    RETURN pg_catalog.jsonb_build_object('current', v_current, 'inserted', 0);
  END IF;

  IF v_deliveries IS NULL OR pg_catalog.jsonb_typeof(v_deliveries) <> 'array' THEN
    RAISE EXCEPTION 'appointment_reminder_generation_deliveries_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(pg_catalog.array_agg(entry ->> 'eventId'), ARRAY[]::text[])
  INTO v_event_ids
  FROM pg_catalog.jsonb_array_elements(v_deliveries) AS delivery(entry);

  UPDATE public.outgoing_delivery_queue AS queue
  SET status = 'dead',
      dead_at = pg_catalog.now(),
      failure_class = 'reminder_not_dispatched',
      last_error = p_reason,
      updated_at = pg_catalog.now()
  WHERE queue.organization_id = p_organization_id
    AND queue.status IN ('pending', 'failed_retryable', 'processing')
    AND (
      (queue.kind = 'appointment_reminder'
        AND queue.payload_json ->> 'appointmentId' = p_appointment_id::text)
      OR
      (queue.kind = 'booking_lifecycle'
        AND queue.channel = 'internal'
        AND queue.payload_json #>> '{bookingLifecycle,fact}' = 'reminder_due'
        AND queue.payload_json #>> '{bookingLifecycle,appointmentId}' = p_appointment_id::text)
    )
    AND NOT (queue.event_id = ANY (v_event_ids));

  SELECT EXISTS (
    SELECT 1 FROM public.be_appointments AS appointment
    WHERE appointment.id = p_appointment_id
      AND appointment.organization_id = p_organization_id
      AND appointment.start_at = p_generation_start_at
      AND appointment.status IN ('created', 'awaiting_payment', 'paid', 'confirmed', 'rescheduled',
        'visit_confirmed', 'charged_to_package')
      AND appointment.deleted_at IS NULL
  ) INTO v_current;

  IF NOT v_current THEN
    RETURN pg_catalog.jsonb_build_object('current', false, 'inserted', 0);
  END IF;

  FOR v_delivery IN
    SELECT entry FROM pg_catalog.jsonb_array_elements(v_deliveries) AS delivery(entry)
  LOOP
    v_event_id := pg_catalog.btrim(COALESCE(v_delivery ->> 'eventId', ''));
    v_channel := v_delivery ->> 'channel';
    v_payload := v_delivery -> 'payloadJson';
    v_kind := CASE WHEN v_channel = 'internal' THEN 'booking_lifecycle' ELSE 'appointment_reminder' END;
    IF pg_catalog.length(v_event_id) NOT BETWEEN 1 AND 240 THEN
      RAISE EXCEPTION 'appointment_reminder_event_id_invalid' USING ERRCODE = '22023';
    END IF;
    -- Accept the retired external web-push envelope during a rolling deployment; the current
    -- materializer no longer produces it because optional push follows the internal feed append.
    IF v_channel NOT IN ('telegram', 'max', 'web_push', 'internal') THEN
      RAISE EXCEPTION 'appointment_reminder_channel_invalid' USING ERRCODE = '22023';
    END IF;
    IF v_payload IS NULL OR pg_catalog.jsonb_typeof(v_payload) <> 'object' THEN
      RAISE EXCEPTION 'appointment_reminder_payload_invalid' USING ERRCODE = '22023';
    END IF;
    v_max_attempts := (v_delivery ->> 'maxAttempts')::integer;
    IF v_max_attempts IS NULL OR v_max_attempts < 1 OR v_max_attempts > 20 THEN
      RAISE EXCEPTION 'appointment_reminder_max_attempts_invalid' USING ERRCODE = '22023';
    END IF;
    v_next_retry_at := (v_delivery ->> 'nextRetryAt')::timestamp with time zone;
    IF v_next_retry_at IS NULL THEN
      RAISE EXCEPTION 'appointment_reminder_next_retry_at_invalid' USING ERRCODE = '22023';
    END IF;

    IF v_channel = 'internal' THEN
      IF v_payload #>> '{bookingLifecycle,organizationId}' IS DISTINCT FROM p_organization_id::text
         OR v_payload #>> '{bookingLifecycle,appointmentId}' IS DISTINCT FROM p_appointment_id::text
         OR v_payload #>> '{bookingLifecycle,fact}' IS DISTINCT FROM 'reminder_due'
         OR pg_catalog.length(COALESCE(v_payload #>> '{bookingLifecycle,reminderId}', '')) NOT BETWEEN 1 AND 200
         OR v_event_id IS DISTINCT FROM
            'booking.lifecycle:reminder_due:' || (v_payload #>> '{bookingLifecycle,reminderId}')
         OR (v_payload #>> '{bookingLifecycle,generationStartAt}')::timestamptz
            IS DISTINCT FROM p_generation_start_at
         OR (v_payload #>> '{bookingLifecycle,dueAt}')::timestamptz
            IS DISTINCT FROM v_next_retry_at
         OR v_max_attempts <> 8 THEN
        RAISE EXCEPTION 'appointment_reminder_lifecycle_payload_invalid' USING ERRCODE = '22023';
      END IF;
    ELSIF v_payload ->> 'appointmentId' IS DISTINCT FROM p_appointment_id::text THEN
      RAISE EXCEPTION 'appointment_reminder_payload_invalid' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.outgoing_delivery_queue AS queue (
      organization_id, event_id, kind, channel, payload_json,
      status, attempt_count, max_attempts, next_retry_at, last_error, dead_at, priority,
      failure_class
    ) VALUES (
      p_organization_id, v_event_id, v_kind, v_channel, v_payload,
      'pending', 0, v_max_attempts, v_next_retry_at, NULL, NULL, 0, NULL
    )
    ON CONFLICT (event_id) DO UPDATE
      SET organization_id = excluded.organization_id,
          kind = excluded.kind,
          channel = excluded.channel,
          payload_json = excluded.payload_json,
          status = excluded.status,
          attempt_count = excluded.attempt_count,
          max_attempts = excluded.max_attempts,
          next_retry_at = excluded.next_retry_at,
          last_error = NULL,
          dead_at = NULL,
          failure_class = NULL,
          updated_at = pg_catalog.now()
      WHERE queue.status IN ('pending', 'failed_retryable');
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_inserted := v_inserted + v_row_count;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object('current', true, 'inserted', v_inserted);
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_payment_webhook_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.settle_appointment_cash_prepayment(p_input_json text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_now timestamptz := pg_catalog.clock_timestamp();
  p_input jsonb := p_input_json::jsonb;
  v_appointment_id uuid := NULLIF(p_input ->> 'appointmentId', '')::uuid;
  v_patient_user_id uuid := NULLIF(p_input ->> 'patientUserId', '')::uuid;
  v_amount_minor integer := NULLIF(p_input ->> 'amountMinor', '')::integer;
  v_currency text := COALESCE(NULLIF(pg_catalog.btrim(COALESCE(p_input ->> 'currency', '')), ''), 'RUB');
  v_idempotency_key text := NULLIF(pg_catalog.btrim(COALESCE(p_input ->> 'idempotencyKey', '')), '');
  v_created_by uuid := NULLIF(p_input ->> 'createdBy', '')::uuid;
  v_payment public.patient_payment%ROWTYPE;
  v_inserted boolean := false;
  v_appointment public.be_appointments%ROWTYPE;
  v_paid_minor integer;
  v_provider_refunded_minor integer;
  v_effective_paid_minor integer;
  v_to_status text;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_payment_webhook_owner'::name,
    'app_staff'::name,
    'staff'::app.port_context_class,
    'booking-payment.prepayment.cash-settle',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg
    ]),
    'app.settle_appointment_cash_prepayment(text)'::regprocedure
  );

  IF v_org IS NULL
     OR NULLIF(p_input ->> 'organizationId', '')::uuid IS DISTINCT FROM v_org
     OR v_appointment_id IS NULL
     OR v_patient_user_id IS NULL
     OR v_created_by IS NULL
     OR v_idempotency_key IS NULL
     OR v_amount_minor IS NULL
     OR v_amount_minor <= 0 THEN
    RAISE EXCEPTION 'appointment_cash_settle_payload_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT appointment.* INTO v_appointment
    FROM public.be_appointments AS appointment
   WHERE appointment.id = v_appointment_id
     AND appointment.organization_id = v_org
     AND appointment.platform_user_id = v_patient_user_id
     AND appointment.deleted_at IS NULL
   FOR UPDATE;
  IF v_appointment.id IS NULL THEN
    RAISE EXCEPTION 'appointment_cash_settle_appointment_not_found' USING ERRCODE = '42501';
  END IF;

  SELECT payment.* INTO v_payment
    FROM public.patient_payment AS payment
   WHERE payment.organization_id = v_org
     AND payment.appointment_id = v_appointment_id
     AND payment.idempotency_key = v_idempotency_key;
  IF v_payment.id IS NOT NULL THEN
    IF v_payment.patient_user_id IS DISTINCT FROM v_patient_user_id
       OR v_payment.amount_minor IS DISTINCT FROM v_amount_minor
       OR v_payment.currency IS DISTINCT FROM v_currency
       OR v_payment.kind IS DISTINCT FROM 'cash'
       OR v_payment.status IS DISTINCT FROM 'paid' THEN
      RAISE EXCEPTION 'invalid_payment_amount' USING ERRCODE = '22023';
    END IF;
    RETURN pg_catalog.jsonb_build_object('payment', pg_catalog.to_jsonb(v_payment),
      'credited', false, 'prepaymentPaidMinor', v_appointment.prepayment_paid_minor,
      'appointmentStatus', v_appointment.status);
  END IF;

  v_paid_minor := COALESCE(v_appointment.prepayment_paid_minor, 0);
  SELECT COALESCE(SUM(refund.amount_minor), 0)::integer INTO v_provider_refunded_minor
    FROM public.be_refunds AS refund
   WHERE refund.organization_id = v_org
     AND refund.appointment_id = v_appointment_id
     AND refund.status = 'succeeded';
  v_effective_paid_minor := GREATEST(0, v_paid_minor - v_provider_refunded_minor);
  IF v_appointment.price_minor IS NULL
     OR v_amount_minor > GREATEST(0, v_appointment.price_minor - v_effective_paid_minor) THEN
    RAISE EXCEPTION 'invalid_payment_amount' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.patient_payment (
    organization_id, patient_user_id, amount_minor, currency, kind, status,
    comment, service, visit_id, appointment_id, patient_package_id,
    idempotency_key, provider, provider_payment_id, created_by
  ) VALUES (
    v_org, v_patient_user_id, v_amount_minor, v_currency, 'cash', 'paid',
    NULLIF(p_input ->> 'comment', ''), NULLIF(p_input ->> 'service', ''), NULL,
    v_appointment_id, NULL, v_idempotency_key, NULL, NULL, v_created_by
  )
  ON CONFLICT DO NOTHING
  RETURNING * INTO v_payment;

  IF v_payment.id IS NOT NULL THEN
    v_inserted := true;
  ELSE
    SELECT payment.* INTO v_payment
      FROM public.patient_payment AS payment
     WHERE payment.organization_id = v_org
       AND payment.appointment_id = v_appointment_id
       AND payment.idempotency_key = v_idempotency_key;
    IF v_payment.id IS NULL THEN
      RAISE EXCEPTION 'appointment_cash_settle_idempotency_lookup_failed' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_inserted THEN
    v_paid_minor := v_paid_minor + v_amount_minor;
    v_effective_paid_minor := v_effective_paid_minor + v_amount_minor;
    UPDATE public.be_appointments AS appointment
       SET prepayment_paid_minor = v_paid_minor,
           updated_at = v_now
     WHERE appointment.id = v_appointment_id
       AND appointment.organization_id = v_org;
  END IF;

  v_to_status := v_appointment.status;
  IF v_inserted
     AND v_appointment.status = 'awaiting_payment'
     AND v_effective_paid_minor >= COALESCE(v_appointment.prepayment_required_minor, 0) THEN
    UPDATE public.be_appointments AS appointment
       SET status = 'confirmed',
           updated_at = v_now
     WHERE appointment.id = v_appointment_id
       AND appointment.organization_id = v_org;
    v_to_status := 'confirmed';
    INSERT INTO public.be_appointment_history_events (
      organization_id, appointment_id, event_type, actor_id, payload, occurred_at
    ) VALUES (
      v_org, v_appointment_id, 'status_changed', v_created_by,
      pg_catalog.jsonb_build_object(
        'fromStatus', 'awaiting_payment', 'toStatus', 'confirmed',
        'source', 'cash_prepayment_settled', 'paymentId', v_payment.id::text
      ),
      v_now
    );
    INSERT INTO public.be_patient_timeline_events (
      organization_id, platform_user_id, domain, event_type,
      linked_object_type, linked_object_id, payload, occurred_at
    ) VALUES (
      v_org, v_patient_user_id, 'appointment', 'appointment_status_changed',
      'appointment', v_appointment_id::text,
      pg_catalog.jsonb_build_object(
        'fromStatus', 'awaiting_payment', 'toStatus', 'confirmed',
        'source', 'cash_prepayment_settled', 'paymentId', v_payment.id::text
      ),
      v_now
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'payment', pg_catalog.to_jsonb(v_payment),
    'credited', v_inserted,
    'prepaymentPaidMinor', v_effective_paid_minor,
    'appointmentStatus', v_to_status
  );
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_payment_webhook_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.refund_appointment_cash_payment(p_input_json text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_now timestamptz := pg_catalog.clock_timestamp();
  p_input jsonb := p_input_json::jsonb;
  v_appointment_id uuid := NULLIF(p_input ->> 'appointmentId', '')::uuid;
  v_patient_user_id uuid := NULLIF(p_input ->> 'patientUserId', '')::uuid;
  v_amount_minor integer := NULLIF(p_input ->> 'amountMinor', '')::integer;
  v_currency text := COALESCE(NULLIF(pg_catalog.btrim(COALESCE(p_input ->> 'currency', '')), ''), 'RUB');
  v_idempotency_key text := NULLIF(pg_catalog.btrim(COALESCE(p_input ->> 'idempotencyKey', '')), '');
  v_created_by uuid := NULLIF(p_input ->> 'createdBy', '')::uuid;
  v_appointment public.be_appointments%ROWTYPE;
  v_payment public.patient_payment%ROWTYPE;
  v_inserted boolean := false;
  v_paid_minor integer;
  v_provider_refunded_minor integer;
  v_effective_paid_minor integer;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_payment_webhook_owner'::name,
    'app_staff'::name,
    'staff'::app.port_context_class,
    'booking-payment.appointment.cash-refund',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg
    ]),
    'app.refund_appointment_cash_payment(text)'::regprocedure
  );

  IF v_org IS NULL
     OR NULLIF(p_input ->> 'organizationId', '')::uuid IS DISTINCT FROM v_org
     OR v_appointment_id IS NULL
     OR v_patient_user_id IS NULL
     OR v_created_by IS NULL
     OR v_idempotency_key IS NULL
     OR v_amount_minor IS NULL
     OR v_amount_minor <= 0 THEN
    RAISE EXCEPTION 'appointment_cash_refund_payload_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT appointment.* INTO v_appointment
    FROM public.be_appointments AS appointment
   WHERE appointment.id = v_appointment_id
     AND appointment.organization_id = v_org
     AND appointment.platform_user_id = v_patient_user_id
     AND appointment.deleted_at IS NULL
   FOR UPDATE;
  IF v_appointment.id IS NULL THEN
    RAISE EXCEPTION 'appointment_cash_refund_appointment_not_found' USING ERRCODE = '42501';
  END IF;

  SELECT payment.* INTO v_payment
    FROM public.patient_payment AS payment
   WHERE payment.organization_id = v_org
     AND payment.appointment_id = v_appointment_id
     AND payment.idempotency_key = v_idempotency_key;
  IF v_payment.id IS NOT NULL THEN
    IF v_payment.patient_user_id IS DISTINCT FROM v_patient_user_id
       OR v_payment.amount_minor IS DISTINCT FROM v_amount_minor
       OR v_payment.currency IS DISTINCT FROM v_currency
       OR v_payment.kind IS DISTINCT FROM 'cash'
       OR v_payment.status IS DISTINCT FROM 'refunded' THEN
      RAISE EXCEPTION 'invalid_refund_amount' USING ERRCODE = '22023';
    END IF;
    RETURN pg_catalog.jsonb_build_object('payment', pg_catalog.to_jsonb(v_payment),
      'refunded', false, 'prepaymentPaidMinor', v_appointment.prepayment_paid_minor,
      'appointmentStatus', v_appointment.status);
  END IF;

  v_paid_minor := COALESCE(v_appointment.prepayment_paid_minor, 0);
  SELECT COALESCE(SUM(refund.amount_minor), 0)::integer INTO v_provider_refunded_minor
    FROM public.be_refunds AS refund
   WHERE refund.organization_id = v_org
     AND refund.appointment_id = v_appointment_id
     AND refund.status = 'succeeded';
  v_effective_paid_minor := GREATEST(0, v_paid_minor - v_provider_refunded_minor);
  IF v_amount_minor > v_effective_paid_minor THEN
    RAISE EXCEPTION 'refund_amount_exceeds_payment' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.patient_payment (
    organization_id, patient_user_id, amount_minor, currency, kind, status,
    comment, service, visit_id, appointment_id, patient_package_id,
    idempotency_key, provider, provider_payment_id, created_by
  ) VALUES (
    v_org, v_patient_user_id, v_amount_minor, v_currency, 'cash', 'refunded',
    COALESCE(NULLIF(p_input ->> 'comment', ''), 'Возврат наличными по записи'),
    NULLIF(p_input ->> 'service', ''), NULL, v_appointment_id, NULL,
    v_idempotency_key, NULL, NULL, v_created_by
  )
  ON CONFLICT DO NOTHING
  RETURNING * INTO v_payment;

  IF v_payment.id IS NOT NULL THEN
    v_inserted := true;
  ELSE
    SELECT payment.* INTO v_payment
      FROM public.patient_payment AS payment
     WHERE payment.organization_id = v_org
       AND payment.appointment_id = v_appointment_id
       AND payment.idempotency_key = v_idempotency_key;
    IF v_payment.id IS NULL THEN
      RAISE EXCEPTION 'appointment_cash_refund_idempotency_lookup_failed' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_inserted THEN
    v_paid_minor := GREATEST(0, v_paid_minor - v_amount_minor);
    v_effective_paid_minor := GREATEST(0, v_paid_minor - v_provider_refunded_minor);
    UPDATE public.be_appointments AS appointment
       SET prepayment_paid_minor = v_paid_minor,
           updated_at = v_now
     WHERE appointment.id = v_appointment_id
       AND appointment.organization_id = v_org;

    INSERT INTO public.be_appointment_history_events (
      organization_id, appointment_id, event_type, actor_id, payload, occurred_at
    ) VALUES (
      v_org, v_appointment_id, 'payment_refunded', v_created_by,
      pg_catalog.jsonb_build_object(
        'source', 'staff_cash_refund', 'amountMinor', v_amount_minor,
        'paymentId', v_payment.id::text
      ),
      v_now
    );
    INSERT INTO public.be_patient_timeline_events (
      organization_id, platform_user_id, domain, event_type,
      linked_object_type, linked_object_id, payload, occurred_at
    ) VALUES (
      v_org, v_patient_user_id, 'payment', 'appointment_payment_refunded',
      'appointment', v_appointment_id::text,
      pg_catalog.jsonb_build_object(
        'source', 'staff_cash_refund', 'amountMinor', v_amount_minor,
        'paymentId', v_payment.id::text
      ),
      v_now
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'payment', pg_catalog.to_jsonb(v_payment),
    'refunded', v_inserted,
    'prepaymentPaidMinor', v_effective_paid_minor
  );
END
$function$;
