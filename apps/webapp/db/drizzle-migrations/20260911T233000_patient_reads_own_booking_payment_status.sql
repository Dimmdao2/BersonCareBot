-- BCB-MIGRATION-OWNER: app_seam_patient_booking_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.pg_get_function_result('app.read_current_patient_booking_payment_status(uuid)'::regprocedure) = 'TABLE(intent_id uuid, amount_minor integer, currency text, intent_status text, checkout_intent_id uuid, payment_deadline_at timestamp with time zone, appointment_status text)' AND pg_catalog.pg_get_functiondef('app.read_current_patient_booking_payment_status(uuid)'::regprocedure) LIKE '%booking.platform_user_id = v_patient%'
--
-- S9: the authenticated cabinet reads one patient's payment screen through one patient-class
-- root. Identity comes only from the accepted patient context. The provider checkout URL never
-- crosses the root: checkout_intent_id is merely the signal for the application to build its own
-- /book/pay/{intentId} URL through buildAppointmentPaymentCheckUrl.
CREATE OR REPLACE FUNCTION app.read_current_patient_booking_payment_status(p_booking_id uuid)
RETURNS TABLE(
  intent_id uuid,
  amount_minor integer,
  currency text,
  intent_status text,
  checkout_intent_id uuid,
  payment_deadline_at timestamp with time zone,
  appointment_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL RESTRICTED
SET search_path = pg_catalog
AS $function$
DECLARE
  v_patient uuid := app.current_patient_user_id();
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_patient_booking_owner'::name,
    'app_patient'::name,
    'patient'::app.port_context_class,
    'booking.patient-payment-status.read',
    app.hash_port_typed_args(ARRAY[
      ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg
    ]),
    'app.read_current_patient_booking_payment_status(uuid)'::regprocedure
  );

  IF v_patient IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    intent.id,
    intent.amount_minor,
    intent.currency,
    intent.status,
    CASE
      WHEN intent.purpose = 'appointment_prepayment'
       AND NULLIF(pg_catalog.btrim(intent.checkout_url), '') IS NOT NULL
      THEN intent.id
      ELSE NULL
    END,
    appointment.payment_deadline_at,
    appointment.status
  FROM public.patient_bookings AS booking
  JOIN public.be_appointments AS appointment
    ON appointment.id = booking.canonical_appointment_id
   AND appointment.organization_id = booking.organization_id
   AND appointment.platform_user_id = booking.platform_user_id
  LEFT JOIN public.be_payments AS payment
    ON payment.id::text = appointment.payment_ref
   AND payment.organization_id = appointment.organization_id
  LEFT JOIN LATERAL (
    SELECT candidate.id, candidate.amount_minor, candidate.currency, candidate.status,
           candidate.purpose, candidate.checkout_url
    FROM public.be_payment_intents AS candidate
    WHERE candidate.organization_id = appointment.organization_id
      AND (
        candidate.id = payment.payment_intent_id
        OR candidate.appointment_id = appointment.id
      )
    ORDER BY
      CASE WHEN candidate.id = payment.payment_intent_id THEN 0 ELSE 1 END,
      candidate.created_at DESC
    LIMIT 1
  ) AS intent ON true
  WHERE booking.id = p_booking_id
    AND booking.platform_user_id = v_patient
  LIMIT 1;
END
$function$;
