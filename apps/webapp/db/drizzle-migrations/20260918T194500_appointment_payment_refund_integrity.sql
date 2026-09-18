-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.settle_appointment_cash_prepayment(text)') IS NOT NULL AND to_regprocedure('app.refund_appointment_cash_payment(text)') IS NOT NULL
--
-- PAY-APPT-25/26: the initial appointment payment UI migration exposed two integrity gaps:
-- concurrent cash collection could credit more than the appointment price, and the cash-refund
-- root called GREATEST as if it were a pg_catalog function. Keep both corrections forward-only
-- because the original roots have already reached DEV migration history.

CREATE UNIQUE INDEX IF NOT EXISTS be_refunds_provider_ref_uidx
  ON public.be_refunds (organization_id, provider_refund_ref)
  WHERE provider_refund_ref IS NOT NULL;

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
