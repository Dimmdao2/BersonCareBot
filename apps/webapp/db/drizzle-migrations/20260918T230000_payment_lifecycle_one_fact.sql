-- BCB-MIGRATION-OWNER: app_seam_payment_webhook_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.to_regprocedure('app.enqueue_captured_booking_payment_lifecycle()') IS NOT NULL
--
-- One immutable payment fact owns one durable job. The resident worker asks webapp to re-read the
-- canonical slots and current preferences, so a crash after settlement cannot leave the patient
-- projection or multi-slot notification semantics dependent on an HTTP callback.
CREATE OR REPLACE FUNCTION app.enqueue_captured_booking_payment_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_intent public.be_payment_intents%ROWTYPE;
  v_payment_id uuid;
  v_appointment_ids jsonb;
  v_platform_user_id uuid;
BEGIN
  IF OLD.processed_at IS NOT NULL OR NEW.processed_at IS NULL OR NEW.event_type <> 'payment.succeeded' THEN
    RETURN NEW;
  END IF;
  SELECT intent.* INTO v_intent
  FROM public.be_payment_intents AS intent
  WHERE intent.organization_id = NEW.organization_id
    AND intent.provider_id = NEW.provider_id
    AND intent.provider_intent_ref = NEW.intent_ref
  FOR KEY SHARE;
  IF v_intent.id IS NULL OR v_intent.appointment_id IS NULL THEN RETURN NEW; END IF;
  SELECT payment.id INTO v_payment_id
  FROM public.be_payments AS payment
  WHERE payment.organization_id = NEW.organization_id AND payment.payment_intent_id = v_intent.id;
  IF v_payment_id IS NULL THEN RETURN NEW; END IF;
  SELECT pg_catalog.jsonb_agg(appointment.id::text ORDER BY appointment.chain_position, appointment.start_at),
         min(appointment.platform_user_id::text)::uuid
    INTO v_appointment_ids, v_platform_user_id
  FROM public.be_appointments AS appointment
  WHERE appointment.organization_id = NEW.organization_id
    AND (appointment.id = v_intent.appointment_id OR EXISTS (
      SELECT 1 FROM public.be_appointments AS anchor
      WHERE anchor.id = v_intent.appointment_id AND anchor.organization_id = NEW.organization_id
        AND anchor.chain_id IS NOT NULL AND appointment.chain_id = anchor.chain_id
    ));
  IF v_appointment_ids IS NULL OR pg_catalog.jsonb_array_length(v_appointment_ids) = 0 THEN
    RAISE EXCEPTION 'booking_payment_lifecycle_appointments_missing' USING ERRCODE = '55000';
  END IF;
  INSERT INTO public.outgoing_delivery_queue (
    organization_id, event_id, kind, channel, payload_json, status, attempt_count, max_attempts, next_retry_at
  ) VALUES (
    NEW.organization_id, 'booking.payment_captured:' || v_payment_id::text,
    'booking_lifecycle', 'internal',
    pg_catalog.jsonb_build_object('paymentCaptured', pg_catalog.jsonb_build_object(
      'organizationId', NEW.organization_id::text,
      'paymentId', v_payment_id::text,
      'appointmentIds', v_appointment_ids,
      'platformUserId', v_platform_user_id::text
    )),
    'pending', 0, 8, pg_catalog.clock_timestamp()
  ) ON CONFLICT (event_id) DO NOTHING;
  RETURN NEW;
END
$function$;
