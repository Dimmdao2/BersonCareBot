-- BCB-MIGRATION-OWNER: app_seam_payment_webhook_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.settle_patient_acquiring_webhook_payment(text,text,text)') IS NOT NULL AND to_regprocedure('app.read_acquiring_webhook_booking_payment_setting(text)') IS NOT NULL
--
-- MONEY-12. The acquiring callback resolves its clinic through
-- `app.resolve_patient_acquiring_webhook_organization` (pre-session class) and then installs an
-- ORGANIZATION principal for the rest of the request. That principal is the port's `tenant_service`
-- class, and this class has no through-relation capability at all: `declaration.ts` states «сквозной
-- `purpose: 'relation'` этому классу не выдают (SCHEME §3)», so `webappPortContextPrincipal` looks up
-- a capability named `tenant_service`, finds none and throws before a single statement is issued.
--
-- Both halves of the callback lived on that dead path: the clinic's provider config read
-- (`system_settings`) and the ledger transition (`patient_payment`). The acquirer had therefore
-- already taken the patient's money, the callback answered 5xx, `status` stayed `pending` forever
-- and the provider retried without end.
--
-- The tenant_service class reaches data only through named roots, so this migration gives the
-- callback exactly two — one per half — and nothing wider. Neither takes the organization as an
-- argument: both read it from the ACCEPTED context (`app.current_org_id()`), so a callback verified
-- for clinic A physically cannot name clinic B. Grants and policies stay entirely with
-- deploy/postgres/privileges.

CREATE OR REPLACE FUNCTION app.settle_patient_acquiring_webhook_payment(
  p_provider_id text,
  p_provider_payment_id text,
  p_status text
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_ids uuid[];
  v_statuses text[];
  v_updated integer;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_payment_webhook_owner'::name,
    'app_tenant_service'::name,
    'tenant_service'::app.port_context_class,
    'patient-payment.webhook.settle',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($3))::app.port_typed_arg
    ]),
    'app.settle_patient_acquiring_webhook_payment(text,text,text)'::regprocedure
  );

  -- The tenant is the accepted context, never an argument: without one there is no clinic to settle
  -- inside, and a silent NULL scope would settle across every clinic at once.
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'patient_acquiring_webhook_settle_principal_required' USING ERRCODE = '42501';
  END IF;

  -- Only the two terminal states an acquiring callback can produce. `refunded` is a different
  -- lifecycle event with a different door, and `pending` would be a transition to nowhere.
  IF p_status IS NULL OR p_status NOT IN ('paid', 'failed') THEN
    RAISE EXCEPTION 'patient_acquiring_webhook_settle_status_unsupported' USING ERRCODE = '22023';
  END IF;

  IF p_provider_id IS NULL
     OR p_provider_payment_id IS NULL
     OR pg_catalog.btrim(p_provider_id) = ''
     OR pg_catalog.btrim(p_provider_payment_id) = '' THEN
    RETURN 'not_found';
  END IF;

  -- Same fail-closed identity rule as the bootstrap resolver: exactly one row, or nothing happens.
  -- An ambiguous provider reference must never pick a winner.
  SELECT array_agg(payment.id ORDER BY payment.id),
         array_agg(payment.status ORDER BY payment.id)
  INTO v_ids, v_statuses
  FROM public.patient_payment AS payment
  WHERE payment.kind = 'acquiring'
    AND payment.provider = p_provider_id
    AND payment.provider_payment_id = p_provider_payment_id
    AND payment.organization_id = v_org;

  IF v_ids IS NULL OR cardinality(v_ids) <> 1 THEN
    RETURN 'not_found';
  END IF;

  IF v_statuses[1] IN ('paid', 'failed', 'refunded') THEN
    RETURN 'already_processed';
  END IF;

  -- Compare-and-set, not read-then-write: two copies of the same callback arriving at once both
  -- reach this statement, and only the one that finds the row still `pending` writes. The loser
  -- reports the retry as already handled instead of overwriting a settled ledger row.
  UPDATE public.patient_payment AS payment
  SET status = p_status
  WHERE payment.id = v_ids[1]
    AND payment.organization_id = v_org
    AND payment.status = 'pending';
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 1 THEN
    RETURN 'settled';
  END IF;
  RETURN 'already_processed';
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_settings_runtime_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
--
-- The clinic-scoped half of the same callback: which acquiring provider this clinic runs and with
-- which webhook secret. Deliberately the twin of `app.read_current_patient_booking_payment_setting`
-- — same seam owner, same two keys, same `admin` scope with the platform-wide row as fallback —
-- with the patient enrolment wall replaced by the accepted tenant, because a webhook has no person.
-- The key is a closed set, so this door cannot be steered into reading another setting.
CREATE OR REPLACE FUNCTION app.read_acquiring_webhook_booking_payment_setting(p_key text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
PARALLEL RESTRICTED
SET search_path = pg_catalog
AS $function$
DECLARE
  v_org uuid := app.current_org_id();
  v_value jsonb;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_settings_runtime_owner'::name,
    'app_tenant_service'::name,
    'tenant_service'::app.port_context_class,
    'patient-payment.webhook.booking-payment-config.read',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg
    ]),
    'app.read_acquiring_webhook_booking_payment_setting(text)'::regprocedure
  );

  IF v_org IS NULL
     OR p_key IS NULL
     OR p_key NOT IN ('booking_payment_enabled', 'booking_payment_providers') THEN
    RETURN NULL;
  END IF;

  SELECT setting.value_json
  INTO v_value
  FROM public.system_settings AS setting
  WHERE setting.key = p_key
    AND setting.scope = 'admin'
    AND (setting.organization_id = v_org OR setting.organization_id IS NULL)
  ORDER BY setting.organization_id IS NULL ASC
  LIMIT 1;
  RETURN v_value;
END
$function$;
