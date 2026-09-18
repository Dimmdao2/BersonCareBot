-- BCB-MIGRATION-OWNER: app_seam_payment_webhook_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.to_regprocedure('app.enqueue_captured_booking_payment_lifecycle()') IS NOT NULL
--
-- A provider event becomes processed in the same transaction as the canonical payment/status
-- transition. The trigger is deliberately attached to that atomic root's durable commit point:
-- if the transaction rolls back there is no queue row, and if it commits the resident worker has
-- one stable event id to reclaim until every lifecycle step is complete.
CREATE OR REPLACE FUNCTION app.enqueue_captured_booking_payment_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_intent public.be_payment_intents%ROWTYPE;
  v_payment_id uuid;
  v_booking public.patient_bookings%ROWTYPE;
  v_appointment public.be_appointments%ROWTYPE;
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
  IF v_intent.id IS NULL OR v_intent.appointment_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT payment.id INTO v_payment_id
  FROM public.be_payments AS payment
  WHERE payment.organization_id = NEW.organization_id
    AND payment.payment_intent_id = v_intent.id;
  IF v_payment_id IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_appointment IN
    SELECT appointment.*
    FROM public.be_appointments AS appointment
    WHERE appointment.organization_id = NEW.organization_id
      AND (appointment.id = v_intent.appointment_id OR EXISTS (
        SELECT 1 FROM public.be_appointments AS anchor
        WHERE anchor.id = v_intent.appointment_id
          AND anchor.organization_id = NEW.organization_id
          AND anchor.chain_id IS NOT NULL
          AND appointment.chain_id = anchor.chain_id
      ))
  LOOP
    SELECT booking.* INTO v_booking
    FROM public.patient_bookings AS booking
    WHERE booking.organization_id = NEW.organization_id
      AND booking.canonical_appointment_id = v_appointment.id
    FOR KEY SHARE;
    IF v_booking.id IS NULL THEN
      RAISE EXCEPTION 'booking_payment_lifecycle_booking_projection_missing' USING ERRCODE = '55000';
    END IF;

    INSERT INTO public.outgoing_delivery_queue (
      organization_id, event_id, kind, channel, payload_json, status, attempt_count, max_attempts, next_retry_at
    ) VALUES (
      NEW.organization_id,
      ('booking.payment_captured:' || v_payment_id::text || ':' || v_appointment.id::text),
      'booking_lifecycle', 'internal',
      pg_catalog.jsonb_build_object('event', pg_catalog.jsonb_build_object(
        'eventType', 'booking.payment_captured',
        'idempotencyKey', ('booking.payment_captured:' || v_payment_id::text || ':' || v_appointment.id::text),
        'payload', pg_catalog.jsonb_build_object(
          'organizationId', NEW.organization_id::text,
          'bookingId', v_booking.id::text,
          'userId', COALESCE(v_booking.platform_user_id::text, v_appointment.platform_user_id::text, v_booking.id::text),
          'bookingType', v_booking.booking_type,
          'city', v_booking.city,
          'category', v_booking.category,
          'slotStart', v_booking.slot_start::text,
          'slotEnd', v_booking.slot_end::text,
          'contactName', v_booking.contact_name,
          'contactPhone', v_booking.contact_phone,
          'contactEmail', v_booking.contact_email,
          'cityCodeSnapshot', v_booking.city_code_snapshot,
          'serviceTitleSnapshot', v_booking.service_title_snapshot,
          'canonicalAppointmentId', v_appointment.id::text,
          'reminderPlan', pg_catalog.jsonb_build_object(
            'enabled', pg_catalog.jsonb_array_length(v_appointment.appointment_reminder_offsets_minutes) > 0,
            'offsetsMinutes', v_appointment.appointment_reminder_offsets_minutes
          ),
          'doctorNotify', true,
          'calendarAction', 'updated',
          'calendarTitleMarker', 'none'
        )
      )),
      'pending', 0, 8, pg_catalog.clock_timestamp()
    ) ON CONFLICT (event_id) DO NOTHING;
  END LOOP;
  RETURN NEW;
END
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
DROP TRIGGER IF EXISTS booking_payment_lifecycle_outbox_after_settlement ON public.be_payment_provider_events;
CREATE TRIGGER booking_payment_lifecycle_outbox_after_settlement
AFTER UPDATE OF processed_at ON public.be_payment_provider_events
FOR EACH ROW EXECUTE FUNCTION app.enqueue_captured_booking_payment_lifecycle();
