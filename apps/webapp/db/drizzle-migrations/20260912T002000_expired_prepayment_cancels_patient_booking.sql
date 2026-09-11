-- BCB-MIGRATION-OWNER: app_seam_payment_webhook_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.pg_get_functiondef('app.expire_due_booking_prepayments(integer)'::regprocedure) LIKE '%UPDATE public.patient_bookings AS booking%' AND pg_catalog.pg_get_functiondef('app.expire_due_booking_prepayments(integer)'::regprocedure) LIKE '%booking.cancel_reason = ''prepayment_expired''%'
--
-- S7.1/S7.2: expiry already changes the canonical appointment and records the canonical
-- `prepayment_expired` history source. The linked patient projection must change in this same
-- definer root and transaction, otherwise the patient keeps seeing a payable booking whose slot
-- has already been released. `cancel_reason` carries that same source token to the patient view;
-- presentation maps only this canonical token to its patient-facing wording.
CREATE OR REPLACE FUNCTION app.expire_due_booking_prepayments(p_limit integer)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_limit integer := least(greatest(COALESCE(p_limit, 50), 1), 500);
  v_expired text[] := ARRAY[]::text[];
  v_appointment_id uuid;
  v_organization_id uuid;
  v_platform_user_id uuid;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_payment_webhook_owner'::name,
    'app_worker'::name,
    'service'::app.port_context_class,
    'booking-payment.prepayment.expire',
    app.hash_port_typed_args(ARRAY[
      ROW('integer@1', pg_catalog.int4send($1))::app.port_typed_arg
    ]),
    'app.expire_due_booking_prepayments(integer)'::regprocedure
  );

  FOR v_appointment_id, v_organization_id, v_platform_user_id IN
    UPDATE public.be_appointments AS appointment
       SET status = 'cancelled_by_specialist',
           payment_deadline_at = NULL,
           updated_at = v_now
     WHERE appointment.id IN (
       SELECT candidate.id
         FROM public.be_appointments AS candidate
        WHERE candidate.status = 'awaiting_payment'
          AND candidate.payment_deadline_at IS NOT NULL
          AND candidate.payment_deadline_at <= v_now
          AND candidate.deleted_at IS NULL
        ORDER BY candidate.payment_deadline_at
        LIMIT v_limit
        FOR UPDATE SKIP LOCKED
     )
       AND appointment.status = 'awaiting_payment'
       AND appointment.prepayment_paid_minor = 0
       AND appointment.payment_ref IS NULL
    RETURNING appointment.id, appointment.organization_id, appointment.platform_user_id
  LOOP
    UPDATE public.patient_bookings AS booking
       SET status = 'cancelled',
           cancelled_at = v_now,
           cancel_reason = 'prepayment_expired',
           updated_at = v_now
     WHERE booking.canonical_appointment_id = v_appointment_id;

    INSERT INTO public.be_appointment_history_events (
      organization_id, appointment_id, event_type, payload, occurred_at
    )
    VALUES (v_organization_id, v_appointment_id, 'status_changed',
            pg_catalog.jsonb_build_object('fromStatus', 'awaiting_payment',
                                          'toStatus', 'cancelled_by_specialist',
                                          'source', 'prepayment_expired'),
            v_now);
    IF v_platform_user_id IS NOT NULL THEN
      INSERT INTO public.be_patient_timeline_events (
        organization_id, platform_user_id, domain, event_type,
        linked_object_type, linked_object_id, payload, occurred_at
      )
      VALUES (v_organization_id, v_platform_user_id, 'appointment', 'appointment_status_changed',
              'appointment', v_appointment_id::text,
              pg_catalog.jsonb_build_object('fromStatus', 'awaiting_payment',
                                            'toStatus', 'cancelled_by_specialist',
                                            'source', 'prepayment_expired'),
              v_now);
    END IF;
    v_expired := v_expired || v_appointment_id::text;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'expired', pg_catalog.cardinality(v_expired),
    'appointmentIds', pg_catalog.to_jsonb(v_expired)
  );
END
$function$;
