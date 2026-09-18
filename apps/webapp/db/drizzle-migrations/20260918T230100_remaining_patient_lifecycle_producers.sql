-- BCB-MIGRATION-OWNER: app_seam_reminder_materialization_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.to_regprocedure('app.read_booking_patient_lifecycle_fact(text,uuid)') IS NOT NULL AND pg_catalog.to_regprocedure('app.enqueue_appointment_cash_lifecycle()') IS NOT NULL AND pg_catalog.to_regprocedure('app.enqueue_booking_payment_history_lifecycle()') IS NOT NULL
--
-- One reminder generation owns both its external transports and one internal lifecycle occurrence
-- per configured due time. The internal row is present even when channel selection is empty; a
-- replaced/cancelled generation terminalizes both shapes in the same atomic root.
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
-- Re-read immutable money facts after commit through one tenant-bound door. The queue payload is
-- only an identity; this function proves organization, patient, appointment and success state.
CREATE OR REPLACE FUNCTION app.read_booking_patient_lifecycle_fact(
  p_kind text,
  p_fact_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL RESTRICTED
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_result jsonb;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_payment_webhook_owner'::name,
    'app_tenant_service'::name,
    'tenant_service'::app.port_context_class,
    'booking-lifecycle.patient-fact.read',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send($2))::app.port_typed_arg
    ]),
    'app.read_booking_patient_lifecycle_fact(text,uuid)'::regprocedure
  );
  IF v_org IS NULL OR p_fact_id IS NULL OR p_kind NOT IN (
    'cash_payment', 'cash_refund', 'refund_succeeded', 'prepayment_retained'
  ) THEN
    RETURN NULL;
  END IF;

  IF p_kind IN ('cash_payment', 'cash_refund') THEN
    SELECT pg_catalog.jsonb_build_object(
      'id', ledger.id::text,
      'organizationId', ledger.organization_id::text,
      'appointmentId', ledger.appointment_id::text,
      'platformUserId', ledger.patient_user_id::text,
      'kind', p_kind,
      'amountMinor', ledger.amount_minor,
      'currency', ledger.currency,
      'occurredAt', ledger.created_at
    ) INTO v_result
    FROM public.patient_payment AS ledger
    JOIN public.be_appointments AS appointment
      ON appointment.id = ledger.appointment_id
     AND appointment.organization_id = ledger.organization_id
     AND appointment.platform_user_id = ledger.patient_user_id
    WHERE ledger.id = p_fact_id
      AND ledger.organization_id = v_org
      AND ledger.kind = 'cash'
      AND ledger.status = CASE WHEN p_kind = 'cash_payment' THEN 'paid' ELSE 'refunded' END;
  ELSE
    SELECT pg_catalog.jsonb_build_object(
      'id', history.id::text,
      'organizationId', history.organization_id::text,
      'appointmentId', history.appointment_id::text,
      'platformUserId', appointment.platform_user_id::text,
      'kind', p_kind,
      'amountMinor', history.amount_minor,
      'currency', history.currency,
      'occurredAt', history.occurred_at
    ) INTO v_result
    FROM public.be_payment_history_events AS history
    JOIN public.be_appointments AS appointment
      ON appointment.id = history.appointment_id
     AND appointment.organization_id = history.organization_id
     AND appointment.platform_user_id IS NOT NULL
     AND (history.platform_user_id IS NULL OR history.platform_user_id = appointment.platform_user_id)
    WHERE history.id = p_fact_id
      AND history.organization_id = v_org
      AND history.event_type = p_kind
      AND (p_kind <> 'refund_succeeded' OR history.status = 'succeeded');
  END IF;
  RETURN v_result;
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_payment_webhook_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.enqueue_appointment_cash_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_fact text;
BEGIN
  IF NEW.appointment_id IS NULL OR NEW.kind <> 'cash' OR NEW.status NOT IN ('paid', 'refunded') THEN
    RETURN NEW;
  END IF;
  v_fact := CASE WHEN NEW.status = 'paid' THEN 'cash_payment' ELSE 'cash_refund' END;
  INSERT INTO public.outgoing_delivery_queue (
    organization_id, event_id, kind, channel, payload_json,
    status, attempt_count, max_attempts, next_retry_at
  ) VALUES (
    NEW.organization_id,
    'booking.lifecycle:' || v_fact || ':' || NEW.id::text,
    'booking_lifecycle',
    'internal',
    pg_catalog.jsonb_build_object('bookingLifecycle', pg_catalog.jsonb_build_object(
      'organizationId', NEW.organization_id::text,
      'appointmentId', NEW.appointment_id::text,
      'ledgerId', NEW.id::text,
      'fact', v_fact
    )),
    'pending', 0, 8, pg_catalog.clock_timestamp()
  ) ON CONFLICT (event_id) DO NOTHING;
  RETURN NEW;
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_payment_webhook_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.enqueue_booking_payment_history_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF NEW.appointment_id IS NULL
     OR NEW.event_type NOT IN ('refund_succeeded', 'prepayment_retained')
     OR (NEW.event_type = 'refund_succeeded' AND NEW.status IS DISTINCT FROM 'succeeded') THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.outgoing_delivery_queue (
    organization_id, event_id, kind, channel, payload_json,
    status, attempt_count, max_attempts, next_retry_at
  ) VALUES (
    NEW.organization_id,
    'booking.lifecycle:' || NEW.event_type || ':' || NEW.id::text,
    'booking_lifecycle',
    'internal',
    pg_catalog.jsonb_build_object('bookingLifecycle', pg_catalog.jsonb_build_object(
      'organizationId', NEW.organization_id::text,
      'appointmentId', NEW.appointment_id::text,
      'paymentHistoryId', NEW.id::text,
      'fact', NEW.event_type
    )),
    'pending', 0, 8, pg_catalog.clock_timestamp()
  ) ON CONFLICT (event_id) DO NOTHING;
  RETURN NEW;
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_payment_webhook_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- The existing appointment history journal is also the immutable visit occurrence. No second
-- visit journal or status transition is introduced.
CREATE OR REPLACE FUNCTION app.enqueue_booking_lifecycle_from_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_fact text;
BEGIN
  v_fact := CASE NEW.event_type
    WHEN 'rescheduled' THEN 'rescheduled'
    WHEN 'cancelled' THEN 'cancelled'
    WHEN 'no_show' THEN 'no_show'
    WHEN 'status_changed' THEN
      CASE WHEN NEW.payload ->> 'toStatus' IN ('completed', 'visit_confirmed')
        THEN 'visit_completed' ELSE NULL END
    ELSE NULL
  END;
  IF v_fact IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.outgoing_delivery_queue (
    organization_id, event_id, kind, channel, payload_json,
    status, attempt_count, max_attempts, next_retry_at
  ) VALUES (
    NEW.organization_id,
    'booking.lifecycle:' || v_fact || ':' || NEW.id::text,
    'booking_lifecycle',
    'internal',
    pg_catalog.jsonb_build_object('bookingLifecycle', pg_catalog.jsonb_build_object(
      'organizationId', NEW.organization_id::text,
      'appointmentId', NEW.appointment_id::text,
      'historyId', NEW.id::text,
      'fact', v_fact
    )),
    'pending', 0, 8, pg_catalog.clock_timestamp()
  ) ON CONFLICT (event_id) DO NOTHING;
  RETURN NEW;
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
DROP TRIGGER IF EXISTS booking_cash_lifecycle_outbox_after_ledger ON public.patient_payment;
CREATE TRIGGER booking_cash_lifecycle_outbox_after_ledger
AFTER INSERT ON public.patient_payment
FOR EACH ROW EXECUTE FUNCTION app.enqueue_appointment_cash_lifecycle();

DROP TRIGGER IF EXISTS booking_payment_history_lifecycle_outbox_after_fact ON public.be_payment_history_events;
CREATE TRIGGER booking_payment_history_lifecycle_outbox_after_fact
AFTER INSERT ON public.be_payment_history_events
FOR EACH ROW EXECUTE FUNCTION app.enqueue_booking_payment_history_lifecycle();
