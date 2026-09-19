-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-SCHEMA-CREATE: public
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.to_regclass('public.be_payment_reconciliation_checkpoints') IS NOT NULL
CREATE TABLE public.be_payment_reconciliation_checkpoints (
  organization_id uuid NOT NULL REFERENCES public.be_organizations(id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  watermark timestamptz,
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (organization_id, provider_id)
);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_payment_webhook_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.to_regprocedure('app.materialize_booking_payment_reconciliation(text,integer)') IS NOT NULL
CREATE OR REPLACE FUNCTION app.materialize_booking_payment_reconciliation(p_wake_id text, p_max_attempts integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER PARALLEL UNSAFE SET search_path = pg_catalog AS $function$
DECLARE
  v_intents integer := 0;
  v_sweeps integer := 0;
  v_written integer := 0;
  v_limit integer := least(greatest(COALESCE(p_max_attempts, 6), 1), 12);
  v_row record;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_payment_webhook_owner'::name, 'app_worker'::name, 'service'::app.port_context_class,
    'booking-payment.reconciliation.materialize',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg,
      ROW('integer@1', pg_catalog.int4send($2))::app.port_typed_arg
    ]), 'app.materialize_booking_payment_reconciliation(text,integer)'::regprocedure
  );
  IF p_wake_id IS NULL OR pg_catalog.btrim(p_wake_id) = '' THEN
    RAISE EXCEPTION 'booking_payment_reconciliation_wake_invalid' USING ERRCODE = '22023';
  END IF;
  FOR v_row IN
    SELECT intent.id, intent.organization_id
    FROM public.be_payment_intents AS intent
    WHERE intent.appointment_id IS NOT NULL AND intent.status IN ('pending', 'processing')
      AND NOT EXISTS (
        SELECT 1 FROM public.outgoing_delivery_queue AS queue
        WHERE queue.kind = 'appointment_payment_reconciliation_intent'
          AND queue.status IN ('pending', 'processing', 'failed_retryable')
          AND queue.payload_json ->> 'intentId' = intent.id::text
      )
    ORDER BY intent.created_at ASC, intent.id ASC
    LIMIT 500
  LOOP
    INSERT INTO public.outgoing_delivery_queue (
      organization_id, event_id, kind, channel, payload_json, status, attempt_count, max_attempts, next_retry_at, priority
    ) VALUES (
      v_row.organization_id, 'appointment-payment-reconcile:intent:' || v_row.id::text,
      'appointment_payment_reconciliation_intent', 'internal',
      pg_catalog.jsonb_build_object('intentId', v_row.id::text, 'organizationId', v_row.organization_id::text), 'pending', 0, v_limit,
      pg_catalog.clock_timestamp(), -10
    ) ON CONFLICT (event_id) DO NOTHING;
    GET DIAGNOSTICS v_written = ROW_COUNT;
    v_intents := v_intents + v_written;
  END LOOP;
  FOR v_row IN
    SELECT DISTINCT intent.organization_id, intent.provider_id
    FROM public.be_payment_intents AS intent
    WHERE intent.appointment_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.outgoing_delivery_queue AS queue
        WHERE queue.kind = 'appointment_payment_reconciliation_sweep'
          AND queue.organization_id = intent.organization_id
          AND queue.status IN ('pending', 'processing', 'failed_retryable')
          AND queue.payload_json ->> 'providerId' = intent.provider_id
      )
  LOOP
    INSERT INTO public.outgoing_delivery_queue (
      organization_id, event_id, kind, channel, payload_json, status, attempt_count, max_attempts, next_retry_at, priority
    ) VALUES (
      v_row.organization_id, 'appointment-payment-reconcile:sweep:' || v_row.organization_id::text || ':' || v_row.provider_id || ':' || p_wake_id,
      'appointment_payment_reconciliation_sweep', 'internal',
      pg_catalog.jsonb_build_object('providerId', v_row.provider_id, 'organizationId', v_row.organization_id::text), 'pending', 0, v_limit,
      pg_catalog.clock_timestamp(), -10
    ) ON CONFLICT (event_id) DO NOTHING;
    GET DIAGNOSTICS v_written = ROW_COUNT;
    v_sweeps := v_sweeps + v_written;
  END LOOP;
  RETURN pg_catalog.jsonb_build_object('intents', v_intents, 'sweeps', v_sweeps);
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_payment_webhook_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.to_regprocedure('app.apply_booking_payment_provider_terminal_observation()') IS NOT NULL
CREATE OR REPLACE FUNCTION app.apply_booking_payment_provider_terminal_observation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
BEGIN
  IF NEW.event_type NOT IN ('payment.canceled', 'payment.expired') OR NEW.processed_at IS NULL THEN
    RETURN NEW;
  END IF;
  UPDATE public.be_payment_intents AS intent
     SET status = 'cancelled', updated_at = pg_catalog.clock_timestamp()
   WHERE intent.organization_id = NEW.organization_id
     AND intent.provider_id = NEW.provider_id
     AND intent.provider_intent_ref = NEW.intent_ref
     AND intent.appointment_id IS NOT NULL
     AND intent.status IN ('pending', 'processing');
  RETURN NEW;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE TRIGGER booking_payment_provider_terminal_observation
AFTER INSERT OR UPDATE OF processed_at ON public.be_payment_provider_events
FOR EACH ROW EXECUTE FUNCTION app.apply_booking_payment_provider_terminal_observation();
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_payment_webhook_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.to_regprocedure('app.read_booking_payment_reconciliation_intent(uuid)') IS NOT NULL
CREATE OR REPLACE FUNCTION app.read_booking_payment_reconciliation_intent(p_intent_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $function$
  SELECT app.require_accepted_context('app_seam_payment_webhook_owner'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'booking-payment.reconciliation.intent.read', app.hash_port_typed_args(ARRAY[ROW('uuid@1', pg_catalog.uuid_send($1))::app.port_typed_arg]), 'app.read_booking_payment_reconciliation_intent(uuid)'::regprocedure);
  SELECT pg_catalog.jsonb_build_object('id', intent.id::text, 'providerId', intent.provider_id, 'providerIntentRef', intent.provider_intent_ref, 'idempotencyKey', intent.idempotency_key, 'amountMinor', intent.amount_minor, 'currency', intent.currency, 'purpose', intent.purpose, 'appointmentId', intent.appointment_id::text, 'platformUserId', intent.platform_user_id::text, 'status', intent.status)
  FROM public.be_payment_intents AS intent
  WHERE intent.id = p_intent_id AND intent.organization_id = app.current_org_id() AND intent.appointment_id IS NOT NULL AND intent.provider_intent_ref IS NOT NULL;
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_payment_webhook_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.to_regprocedure('app.read_booking_payment_reconciliation_intent_by_provider_ref(text)') IS NOT NULL
CREATE OR REPLACE FUNCTION app.read_booking_payment_reconciliation_intent_by_provider_ref(p_provider_intent_ref text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $function$
  SELECT app.require_accepted_context('app_seam_payment_webhook_owner'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'booking-payment.reconciliation.intent-by-provider-ref.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.read_booking_payment_reconciliation_intent_by_provider_ref(text)'::regprocedure);
  SELECT pg_catalog.jsonb_build_object('id', intent.id::text, 'providerId', intent.provider_id, 'providerIntentRef', intent.provider_intent_ref, 'idempotencyKey', intent.idempotency_key, 'amountMinor', intent.amount_minor, 'currency', intent.currency, 'purpose', intent.purpose, 'appointmentId', intent.appointment_id::text, 'platformUserId', intent.platform_user_id::text, 'status', intent.status)
  FROM public.be_payment_intents AS intent
  WHERE intent.provider_intent_ref = p_provider_intent_ref AND intent.organization_id = app.current_org_id() AND intent.appointment_id IS NOT NULL
  ORDER BY intent.created_at DESC, intent.id DESC LIMIT 1;
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_payment_webhook_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: sql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.to_regprocedure('app.read_booking_payment_reconciliation_sweep(text)') IS NOT NULL
CREATE OR REPLACE FUNCTION app.read_booking_payment_reconciliation_sweep(p_provider_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $function$
  SELECT app.require_accepted_context('app_seam_payment_webhook_owner'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'booking-payment.reconciliation.sweep.read', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg]), 'app.read_booking_payment_reconciliation_sweep(text)'::regprocedure);
  SELECT pg_catalog.jsonb_build_object('providerId', p_provider_id, 'watermark', checkpoint.watermark, 'oldestUnresolvedCreatedAt', min(intent.created_at))
  FROM (SELECT 1) AS one
  LEFT JOIN public.be_payment_reconciliation_checkpoints AS checkpoint ON checkpoint.organization_id = app.current_org_id() AND checkpoint.provider_id = p_provider_id
  LEFT JOIN public.be_payment_intents AS intent ON intent.organization_id = app.current_org_id() AND intent.provider_id = p_provider_id AND intent.appointment_id IS NOT NULL AND intent.status IN ('pending', 'processing')
  GROUP BY p_provider_id, checkpoint.watermark;
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_payment_webhook_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.to_regprocedure('app.advance_booking_payment_reconciliation_watermark(text,timestamp with time zone)') IS NOT NULL
CREATE OR REPLACE FUNCTION app.advance_booking_payment_reconciliation_watermark(p_provider_id text, p_watermark timestamptz)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $function$
BEGIN
  PERFORM app.require_accepted_context('app_seam_payment_webhook_owner'::name, 'app_tenant_service'::name, 'tenant_service'::app.port_context_class, 'booking-payment.reconciliation.watermark.advance', app.hash_port_typed_args(ARRAY[ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg, ROW('timestamp with time zone@1', pg_catalog.timestamptz_send($2))::app.port_typed_arg]), 'app.advance_booking_payment_reconciliation_watermark(text,timestamp with time zone)'::regprocedure);
  IF app.current_org_id() IS NULL OR p_provider_id IS NULL OR pg_catalog.btrim(p_provider_id) = '' OR p_watermark IS NULL THEN RAISE EXCEPTION 'booking_payment_reconciliation_checkpoint_invalid' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.be_payment_reconciliation_checkpoints AS checkpoint (organization_id, provider_id, watermark, updated_at)
  VALUES (app.current_org_id(), p_provider_id, p_watermark, pg_catalog.clock_timestamp())
  ON CONFLICT (organization_id, provider_id) DO UPDATE SET watermark = GREATEST(checkpoint.watermark, EXCLUDED.watermark), updated_at = EXCLUDED.updated_at;
END
$function$;
