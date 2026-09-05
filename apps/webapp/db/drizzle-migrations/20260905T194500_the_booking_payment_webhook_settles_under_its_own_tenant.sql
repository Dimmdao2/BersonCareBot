-- BCB-MIGRATION-OWNER: app_seam_payment_webhook_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.settle_booking_payment_webhook_event(text,text,text,text,text)') IS NOT NULL
--
-- The generic acquiring callback `/api/payments/webhook/[provider]` — the one a booking prepayment
-- is actually paid through — died on the same wall MONEY-12 found under the patient ledger, twice.
--
-- 1. It resolved the clinic with a BOOTSTRAP principal through a plain relation call. The port maps
--    that principal to a capability named `pre_session`, the runtime catalog has no such key (239
--    entries, none), so `webappPortContextPrincipal` threw before a single statement was issued and
--    the route answered 400 `webhook_failed`. ЮKassa saw that 400 on all three deliveries.
-- 2. Everything after it ran under the ORGANIZATION principal, i.e. the port's `tenant_service`
--    class, and that class has no through-relation capability at all (`declaration.ts`: «сквозной
--    `purpose: 'relation'` этому классу не выдают (SCHEME §3)»). Every `db.select()`/`insert()` of
--    the capture would have thrown the same way.
--
-- Consequence for the owner: money left the payer, the appointment payment view stayed `pending`
-- forever and the provider retried into a permanent 400.
--
-- The tenant_service class reaches data only through named roots, so the whole settlement is ONE
-- root — one statement-atomic transition instead of ten relation round-trips that could not share a
-- transaction anyway (a named root refuses to start inside a relation transaction). It takes no
-- organization argument: the tenant is the ACCEPTED context (`app.current_org_id()`), so a callback
-- verified for clinic A cannot name clinic B. The clinic-side resolver
-- `app.resolve_payment_webhook_organization` keeps its body; only its declared gate moves from
-- `app_patient` (a role this callback never has) to the pre-session capability, and that rewrite
-- belongs to the privileges generator, never to a migration.
--
-- Grants and policies stay entirely with deploy/postgres/privileges.

CREATE OR REPLACE FUNCTION app.settle_booking_payment_webhook_event(
  p_provider_id text,
  p_idempotency_key text,
  p_event_type text,
  p_intent_ref text,
  p_payload_json text
)
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
  v_payload jsonb;
  v_intent_ref text;
  v_event_id uuid;
  v_event_processed_at timestamptz;
  v_inserted boolean := false;
  v_payload_intent text;
  v_intent_id uuid;
  v_intent_appointment_id uuid;
  v_intent_platform_user_id uuid;
  v_intent_provider_id text;
  v_intent_amount_minor integer;
  v_intent_currency text;
  v_intent_purpose text;
  v_intent_product_ref text;
  v_payment_id uuid;
  v_chain_id uuid;
  v_appointment_id uuid;
  v_appointment_status text;
  v_appointment_user_id uuid;
  v_confirmed text[] := ARRAY[]::text[];
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_payment_webhook_owner'::name,
    'app_tenant_service'::name,
    'tenant_service'::app.port_context_class,
    'booking-payment.webhook.settle',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($4))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($5))::app.port_typed_arg
    ]),
    'app.settle_booking_payment_webhook_event(text,text,text,text,text)'::regprocedure
  );

  -- The tenant is the accepted context, never an argument: without one there is no clinic to settle
  -- inside, and a silent NULL scope would settle across every clinic at once.
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'booking_payment_webhook_settle_principal_required' USING ERRCODE = '42501';
  END IF;

  IF p_provider_id IS NULL
     OR p_idempotency_key IS NULL
     OR p_event_type IS NULL
     OR pg_catalog.btrim(p_provider_id) = ''
     OR pg_catalog.btrim(p_idempotency_key) = ''
     OR pg_catalog.btrim(p_event_type) = '' THEN
    RAISE EXCEPTION 'booking_payment_webhook_event_incomplete' USING ERRCODE = '22023';
  END IF;

  v_payload := COALESCE(p_payload_json::jsonb, '{}'::jsonb);
  IF pg_catalog.jsonb_typeof(v_payload) <> 'object' THEN
    v_payload := '{}'::jsonb;
  END IF;
  v_intent_ref := NULLIF(pg_catalog.btrim(COALESCE(p_intent_ref, '')), '');

  -- The provider event row IS the idempotency record: its unique key is (provider, key, type), so a
  -- retry of the same notification cannot insert a second one.
  INSERT INTO public.be_payment_provider_events AS event (
    organization_id, provider_id, idempotency_key, event_type, intent_ref, payload_json
  )
  VALUES (v_org, p_provider_id, p_idempotency_key, p_event_type, v_intent_ref, v_payload)
  ON CONFLICT (provider_id, idempotency_key, event_type) DO NOTHING
  RETURNING event.id INTO v_event_id;

  IF v_event_id IS NOT NULL THEN
    v_inserted := true;
  ELSE
    SELECT event.id, event.processed_at
      INTO v_event_id, v_event_processed_at
      FROM public.be_payment_provider_events AS event
     WHERE event.provider_id = p_provider_id
       AND event.idempotency_key = p_idempotency_key
       AND event.event_type = p_event_type
       AND event.organization_id = v_org;

    -- The lifecycle key is global, the settlement is not: an event already recorded for ANOTHER
    -- clinic is not this callback's to settle, and must not be reported as handled here.
    IF v_event_id IS NULL THEN
      RETURN pg_catalog.jsonb_build_object('outcome', 'not_found', 'duplicate', true);
    END IF;
    IF v_event_processed_at IS NOT NULL THEN
      RETURN pg_catalog.jsonb_build_object('outcome', 'already_processed', 'duplicate', true);
    END IF;
  END IF;

  -- Only a confirmed success moves money in our journal. Anything else is recorded and acknowledged
  -- so the provider stops retrying, exactly as the previous code did.
  IF p_event_type <> 'payment.succeeded' THEN
    UPDATE public.be_payment_provider_events AS event
       SET processed_at = v_now
     WHERE event.id = v_event_id
       AND event.organization_id = v_org
       AND event.processed_at IS NULL;
    RETURN pg_catalog.jsonb_build_object('outcome', 'recorded', 'duplicate', NOT v_inserted);
  END IF;

  v_payload_intent := NULLIF(pg_catalog.btrim(COALESCE(v_payload ->> 'intentId', '')), '');
  IF v_payload_intent IS NOT NULL
     AND v_payload_intent ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    SELECT intent.id, intent.appointment_id, intent.platform_user_id, intent.provider_id,
           intent.amount_minor, intent.currency, intent.purpose, intent.product_ref
      INTO v_intent_id, v_intent_appointment_id, v_intent_platform_user_id, v_intent_provider_id,
           v_intent_amount_minor, v_intent_currency, v_intent_purpose, v_intent_product_ref
      FROM public.be_payment_intents AS intent
     WHERE intent.id = v_payload_intent::uuid
       AND intent.organization_id = v_org;
  END IF;

  IF v_intent_id IS NULL AND v_intent_ref IS NOT NULL THEN
    SELECT intent.id, intent.appointment_id, intent.platform_user_id, intent.provider_id,
           intent.amount_minor, intent.currency, intent.purpose, intent.product_ref
      INTO v_intent_id, v_intent_appointment_id, v_intent_platform_user_id, v_intent_provider_id,
           v_intent_amount_minor, v_intent_currency, v_intent_purpose, v_intent_product_ref
      FROM public.be_payment_intents AS intent
     WHERE intent.organization_id = v_org
       AND intent.provider_intent_ref = v_intent_ref
     ORDER BY intent.created_at DESC, intent.id DESC
     LIMIT 1;
  END IF;

  IF v_intent_id IS NULL THEN
    UPDATE public.be_payment_provider_events AS event
       SET processed_at = v_now
     WHERE event.id = v_event_id
       AND event.organization_id = v_org
       AND event.processed_at IS NULL;
    RETURN pg_catalog.jsonb_build_object('outcome', 'intent_not_found', 'duplicate', NOT v_inserted);
  END IF;

  -- Compare-and-set, not read-then-write: two copies of the same notification both reach this
  -- statement and only the one that finds the intent unsettled writes.
  UPDATE public.be_payment_intents AS intent
     SET status = 'succeeded', updated_at = v_now
   WHERE intent.id = v_intent_id
     AND intent.organization_id = v_org
     AND intent.status <> 'succeeded';

  INSERT INTO public.be_payments AS payment (
    organization_id, payment_intent_id, appointment_id, platform_user_id, provider_id,
    amount_minor, currency, status, purpose, captured_at, created_at
  )
  VALUES (v_org, v_intent_id, v_intent_appointment_id, v_intent_platform_user_id, v_intent_provider_id,
          v_intent_amount_minor, v_intent_currency, 'captured', v_intent_purpose, v_now, v_now)
  ON CONFLICT (payment_intent_id) DO NOTHING
  RETURNING payment.id INTO v_payment_id;

  IF v_payment_id IS NULL THEN
    SELECT payment.id
      INTO v_payment_id
      FROM public.be_payments AS payment
     WHERE payment.payment_intent_id = v_intent_id
       AND payment.organization_id = v_org;
  END IF;
  IF v_payment_id IS NULL THEN
    RAISE EXCEPTION 'booking_payment_webhook_payment_persist_failed' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.be_payment_history_events (
    organization_id, appointment_id, platform_user_id, payment_id, event_type,
    amount_minor, currency, provider_id, status, purpose
  )
  VALUES (v_org, v_intent_appointment_id, v_intent_platform_user_id, v_payment_id, 'payment_captured',
          v_intent_amount_minor, v_intent_currency, v_intent_provider_id, 'captured', v_intent_purpose)
  ON CONFLICT DO NOTHING;

  IF v_intent_appointment_id IS NOT NULL THEN
    SELECT appointment.chain_id
      INTO v_chain_id
      FROM public.be_appointments AS appointment
     WHERE appointment.id = v_intent_appointment_id
       AND appointment.organization_id = v_org;

    -- A patient can book several consecutive slots under one chain and pay for them once; the
    -- payment reference belongs to every slot of that chain, as it did before.
    FOR v_appointment_id, v_appointment_status, v_appointment_user_id IN
      SELECT appointment.id, appointment.status, appointment.platform_user_id
        FROM public.be_appointments AS appointment
       WHERE appointment.organization_id = v_org
         AND (appointment.id = v_intent_appointment_id
              OR (v_chain_id IS NOT NULL AND appointment.chain_id = v_chain_id))
       ORDER BY appointment.id
    LOOP
      UPDATE public.be_appointments AS appointment
         SET payment_ref = v_payment_id::text, updated_at = v_now
       WHERE appointment.id = v_appointment_id
         AND appointment.organization_id = v_org;

      IF v_appointment_status = 'awaiting_payment' THEN
        UPDATE public.be_appointments AS appointment
           SET status = 'paid', updated_at = v_now
         WHERE appointment.id = v_appointment_id
           AND appointment.organization_id = v_org;
        INSERT INTO public.be_appointment_history_events (
          organization_id, appointment_id, event_type, payload, occurred_at
        )
        VALUES (v_org, v_appointment_id, 'status_changed',
                pg_catalog.jsonb_build_object('fromStatus', 'awaiting_payment', 'toStatus', 'paid',
                                              'source', 'payment_capture', 'paymentId', v_payment_id::text),
                v_now);
        IF v_appointment_user_id IS NOT NULL THEN
          INSERT INTO public.be_patient_timeline_events (
            organization_id, platform_user_id, domain, event_type,
            linked_object_type, linked_object_id, payload, occurred_at
          )
          VALUES (v_org, v_appointment_user_id, 'appointment', 'appointment_status_changed',
                  'appointment', v_appointment_id::text,
                  pg_catalog.jsonb_build_object('fromStatus', 'awaiting_payment', 'toStatus', 'paid',
                                                'source', 'payment_capture', 'paymentId', v_payment_id::text),
                  v_now);
        END IF;
        v_appointment_status := 'paid';
      END IF;

      IF v_appointment_status = 'paid' THEN
        UPDATE public.be_appointments AS appointment
           SET status = 'confirmed', updated_at = v_now
         WHERE appointment.id = v_appointment_id
           AND appointment.organization_id = v_org;
        INSERT INTO public.be_appointment_history_events (
          organization_id, appointment_id, event_type, payload, occurred_at
        )
        VALUES (v_org, v_appointment_id, 'status_changed',
                pg_catalog.jsonb_build_object('fromStatus', 'paid', 'toStatus', 'confirmed',
                                              'source', 'payment_confirmed', 'paymentId', v_payment_id::text),
                v_now);
        IF v_appointment_user_id IS NOT NULL THEN
          INSERT INTO public.be_patient_timeline_events (
            organization_id, platform_user_id, domain, event_type,
            linked_object_type, linked_object_id, payload, occurred_at
          )
          VALUES (v_org, v_appointment_user_id, 'appointment', 'appointment_status_changed',
                  'appointment', v_appointment_id::text,
                  pg_catalog.jsonb_build_object('fromStatus', 'paid', 'toStatus', 'confirmed',
                                                'source', 'payment_confirmed', 'paymentId', v_payment_id::text),
                  v_now);
        END IF;
      END IF;

      v_confirmed := v_confirmed || v_appointment_id::text;
    END LOOP;
  END IF;

  UPDATE public.be_payment_provider_events AS event
     SET processed_at = v_now
   WHERE event.id = v_event_id
     AND event.organization_id = v_org
     AND event.processed_at IS NULL;

  RETURN pg_catalog.jsonb_build_object(
    'outcome', 'captured',
    'duplicate', NOT v_inserted,
    'paymentId', v_payment_id::text,
    'platformUserId', v_intent_platform_user_id::text,
    'productRef', v_intent_product_ref,
    'confirmedAppointmentIds', pg_catalog.to_jsonb(v_confirmed)
  );
END
$function$;
