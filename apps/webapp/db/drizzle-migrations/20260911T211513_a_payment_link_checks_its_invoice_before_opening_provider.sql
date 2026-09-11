-- BCB-MIGRATION-OWNER: app_seam_payment_webhook_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.read_booking_payment_check(uuid)') IS NOT NULL
--
-- S3: a link handed to a patient names only our payment-check route. The provider URL remains
-- behind this pre-session SECURITY DEFINER root and is returned only while the exact appointment
-- invoice is still payable. An unknown UUID and a dead UUID execute the same single left-join
-- statement and both return one row; no direct relation grant is given to app_pre_session.
CREATE OR REPLACE FUNCTION app.read_booking_payment_check(p_intent_id uuid)
RETURNS TABLE(
  is_alive boolean,
  amount_minor integer,
  currency text,
  payment_deadline_at timestamp with time zone,
  appointment_status text,
  provider_checkout_url text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_payment_webhook_owner'::name,
    'app_pre_session'::name,
    'pre_session'::app.port_context_class,
    'booking-payment.check.read',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg
    ]),
    'app.read_booking_payment_check(uuid)'::regprocedure
  );

  RETURN QUERY
  SELECT
    COALESCE(
      intent.status IN ('pending', 'processing')
      AND appointment.status = 'awaiting_payment'
      AND appointment.deleted_at IS NULL
      AND appointment.payment_ref IS NULL
      AND appointment.prepayment_paid_minor < appointment.prepayment_required_minor
      AND appointment.payment_deadline_at > pg_catalog.clock_timestamp()
      AND NULLIF(pg_catalog.btrim(intent.checkout_url), '') IS NOT NULL,
      false
    ) AS is_alive,
    intent.amount_minor,
    intent.currency,
    appointment.payment_deadline_at,
    appointment.status,
    CASE
      WHEN intent.status IN ('pending', 'processing')
       AND appointment.status = 'awaiting_payment'
       AND appointment.deleted_at IS NULL
       AND appointment.payment_ref IS NULL
       AND appointment.prepayment_paid_minor < appointment.prepayment_required_minor
       AND appointment.payment_deadline_at > pg_catalog.clock_timestamp()
      THEN NULLIF(pg_catalog.btrim(intent.checkout_url), '')
      ELSE NULL
    END AS provider_checkout_url
  FROM (VALUES (true)) AS one_row(always_one)
  LEFT JOIN public.be_payment_intents AS intent
    ON intent.id = p_intent_id
   AND intent.purpose = 'appointment_prepayment'
  LEFT JOIN public.be_appointments AS appointment
    ON appointment.id = intent.appointment_id;
END
$function$;
