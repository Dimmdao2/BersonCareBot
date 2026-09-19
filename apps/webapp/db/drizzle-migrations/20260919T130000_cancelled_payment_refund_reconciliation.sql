-- BCB-MIGRATION-OWNER: app_seam_payment_webhook_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.to_regprocedure('app.enqueue_booking_payment_refund_reconciliation()') IS NOT NULL
-- The immutable cancellation fact and its recovery work commit together. No request-local caller
-- can create a post-commit loss window between canonical cancellation and durable continuation.
CREATE OR REPLACE FUNCTION app.enqueue_booking_payment_refund_reconciliation()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER PARALLEL UNSAFE SET search_path = pg_catalog AS $function$
BEGIN
  IF NOT NEW.prepayment_retained AND NOT NEW.prepayment_refunded THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.outgoing_delivery_queue (
    organization_id, event_id, kind, channel, payload_json, status,
    attempt_count, max_attempts, next_retry_at, priority
  ) VALUES (
    NEW.organization_id,
    'appointment-payment-reconcile:refund:' || NEW.appointment_id::text,
    'appointment_payment_reconciliation_refund', 'internal',
    pg_catalog.jsonb_build_object(
      'organizationId', NEW.organization_id::text,
      'appointmentId', NEW.appointment_id::text,
      'prepaymentRetained', NEW.prepayment_retained,
      'prepaymentRefunded', NEW.prepayment_refunded,
      'reason', NEW.reason
    ),
    'pending', 0, 8, pg_catalog.clock_timestamp(), -10
  ) ON CONFLICT (event_id) DO NOTHING;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE TRIGGER booking_payment_refund_reconciliation_after_cancellation
AFTER INSERT ON public.be_appointment_cancellations
FOR EACH ROW EXECUTE FUNCTION app.enqueue_booking_payment_refund_reconciliation();
