-- BCB-MIGRATION-OWNER: app_seam_payment_webhook_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.to_regprocedure('app.enqueue_booking_payment_refund_reconciliation(uuid)') IS NOT NULL
-- A cancellation has already committed before the payment provider is called. Persist its exact
-- canonical decision in the existing reconciliation queue, so a transient provider failure cannot
-- become a request-local flag that no worker can ever recover.
CREATE OR REPLACE FUNCTION app.enqueue_booking_payment_refund_reconciliation(p_appointment_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER PARALLEL UNSAFE SET search_path = pg_catalog AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_cancellation public.be_appointment_cancellations%ROWTYPE;
  v_appointment public.be_appointments%ROWTYPE;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_payment_webhook_owner'::name,
    ARRAY['app_patient'::name, 'app_staff'::name]::name[]
  );
  IF v_org IS NULL OR p_appointment_id IS NULL THEN
    RAISE EXCEPTION 'booking_payment_refund_reconciliation_context_invalid' USING ERRCODE = '42501';
  END IF;
  SELECT appointment.* INTO v_appointment
  FROM public.be_appointments AS appointment
  WHERE appointment.id = p_appointment_id AND appointment.organization_id = v_org
  FOR KEY SHARE;
  IF v_appointment.id IS NULL OR v_appointment.status NOT IN (
    'cancelled_by_patient', 'cancelled_by_specialist', 'late_cancellation'
  ) THEN
    RAISE EXCEPTION 'booking_payment_refund_reconciliation_not_cancelled' USING ERRCODE = '22023';
  END IF;
  SELECT cancellation.* INTO v_cancellation
  FROM public.be_appointment_cancellations AS cancellation
  WHERE cancellation.appointment_id = p_appointment_id AND cancellation.organization_id = v_org
  ORDER BY cancellation.created_at DESC, cancellation.id DESC
  LIMIT 1
  FOR KEY SHARE;
  IF v_cancellation.id IS NULL THEN
    RAISE EXCEPTION 'booking_payment_refund_reconciliation_cancellation_missing' USING ERRCODE = '55000';
  END IF;
  INSERT INTO public.outgoing_delivery_queue (
    organization_id, event_id, kind, channel, payload_json, status,
    attempt_count, max_attempts, next_retry_at, priority
  ) VALUES (
    v_org,
    'appointment-payment-reconcile:refund:' || p_appointment_id::text,
    'appointment_payment_reconciliation_refund', 'internal',
    pg_catalog.jsonb_build_object(
      'organizationId', v_org::text,
      'appointmentId', p_appointment_id::text,
      'prepaymentRetained', v_cancellation.prepayment_retained,
      'prepaymentRefunded', v_cancellation.prepayment_refunded,
      'reason', v_cancellation.reason
    ),
    'pending', 0, 8, pg_catalog.clock_timestamp(), -10
  ) ON CONFLICT (event_id) DO NOTHING;
END
$function$;
