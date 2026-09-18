-- BCB-MIGRATION-OWNER: app_seam_payment_webhook_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.to_regprocedure('app.enqueue_booking_lifecycle_from_appointment()') IS NOT NULL AND pg_catalog.to_regprocedure('app.enqueue_booking_lifecycle_from_history()') IS NOT NULL
--
-- Booking facts are written through a small number of canonical rows.  Enqueue from those rows,
-- not from HTTP handlers: an aborted request or a process death after commit must leave one
-- reclaimable internal job.  The queue stores only the immutable fact identity; the worker asks
-- webapp to rebuild the display payload from canonical state after commit.
CREATE OR REPLACE FUNCTION app.enqueue_booking_lifecycle_from_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_fact text;
BEGIN
  IF NEW.status NOT IN ('confirmed', 'awaiting_payment') THEN
    RETURN NEW;
  END IF;
  v_fact := CASE WHEN NEW.status = 'awaiting_payment' THEN 'awaiting_payment' ELSE 'created' END;
  INSERT INTO public.outgoing_delivery_queue (
    organization_id, event_id, kind, channel, payload_json, status, attempt_count, max_attempts, next_retry_at
  ) VALUES (
    NEW.organization_id,
    'booking.lifecycle:' || v_fact || ':' || NEW.id::text,
    'booking_lifecycle', 'internal',
    pg_catalog.jsonb_build_object('bookingLifecycle', pg_catalog.jsonb_build_object(
      'organizationId', NEW.organization_id::text,
      'appointmentId', NEW.id::text,
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
    ELSE NULL
  END;
  IF v_fact IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.outgoing_delivery_queue (
    organization_id, event_id, kind, channel, payload_json, status, attempt_count, max_attempts, next_retry_at
  ) VALUES (
    NEW.organization_id,
    'booking.lifecycle:' || v_fact || ':' || NEW.id::text,
    'booking_lifecycle', 'internal',
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
DROP TRIGGER IF EXISTS booking_lifecycle_outbox_after_appointment_create ON public.be_appointments;
CREATE TRIGGER booking_lifecycle_outbox_after_appointment_create
AFTER INSERT ON public.be_appointments
FOR EACH ROW EXECUTE FUNCTION app.enqueue_booking_lifecycle_from_appointment();

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
DROP TRIGGER IF EXISTS booking_lifecycle_outbox_after_history ON public.be_appointment_history_events;
CREATE TRIGGER booking_lifecycle_outbox_after_history
AFTER INSERT ON public.be_appointment_history_events
FOR EACH ROW EXECUTE FUNCTION app.enqueue_booking_lifecycle_from_history();
