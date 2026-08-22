-- BCB-MIGRATION-OWNER: app_seam_org_commerce_owner
-- BCB-MIGRATION-VERIFY: SELECT to_regprocedure('app.assert_org_patient_count_quota_available(uuid)') IS NULL AND pg_get_functiondef('app.apply_paid_saas_billing_tariff(uuid,uuid)'::regprocedure) LIKE '%p_organization_id IS DISTINCT FROM app.current_org_id()%' AND pg_get_functiondef('app.record_reminder_occurrence_finalized_projection(text,text,bigint,uuid,uuid,text,text,text,text,timestamp with time zone)'::regprocedure) LIKE '%p_organization_id IS DISTINCT FROM app.current_org_id()%' AND pg_get_functiondef('app.refresh_saas_billing_invoice_purchased_tariff(uuid,uuid,uuid)'::regprocedure) LIKE '%p_organization_id IS DISTINCT FROM app.current_org_id()%' AND pg_get_functiondef('app.release_carried_seat_debt(uuid,uuid)'::regprocedure) LIKE '%p_organization_id IS DISTINCT FROM app.current_org_id()%'
--
-- D17: мёртвый читатель квоты снимается целиком. После 0053 и последующего
-- удаления писателя карточек в дереве нет ни одного живого вызова; оставлять EXECUTE у
-- `app_staff` и привилегии владельца шва для мёртвого корня незачем.
DROP FUNCTION app.assert_org_patient_count_quota_available(uuid);

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_org_commerce_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.apply_paid_saas_billing_tariff(
  p_saas_billing_invoice_id uuid,
  p_organization_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_tariff_id uuid;
  v_applied boolean;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_org_commerce_owner'::name,
    ARRAY['app_staff'::name]::name[]
  );

  IF p_organization_id IS NULL
     OR p_organization_id IS DISTINCT FROM app.current_org_id() THEN
    RAISE EXCEPTION 'saas_billing_organization_context_denied'
      USING ERRCODE = '42501';
  END IF;

  SELECT invoice.tariff_id INTO v_tariff_id
  FROM public.saas_billing_invoices AS invoice
  WHERE invoice.id = p_saas_billing_invoice_id
    AND invoice.organization_id = p_organization_id
    AND invoice.status = 'paid';

  IF v_tariff_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.be_organizations
  SET tariff_id = v_tariff_id
  WHERE id = p_organization_id;

  v_applied := FOUND;

  UPDATE public.saas_organization_trials
  SET status = 'ended', updated_at = now()
  WHERE organization_id = p_organization_id
    AND status = 'active';

  RETURN v_applied;
END;
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_reminder_patient_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.record_reminder_occurrence_finalized_projection(
  p_integrator_occurrence_id text,
  p_integrator_rule_id text,
  p_integrator_user_id bigint,
  p_platform_user_id uuid,
  p_organization_id uuid,
  p_category text,
  p_status text,
  p_delivery_channel text,
  p_error_code text,
  p_occurred_at timestamp with time zone
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_row_count integer;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_reminder_patient_owner'::name,
    CASE
      WHEN pg_catalog.current_setting('role', true) = 'app_operational_delivery_worker'
        THEN 'app_operational_delivery_worker'::name
      WHEN pg_catalog.current_setting('role', true) = 'app_integrator_request'
        THEN 'app_integrator_request'::name
      ELSE 'app_tenant_service'::name
    END,
    CASE
      WHEN pg_catalog.current_setting('role', true) = 'app_operational_delivery_worker'
        THEN 'service'::app.port_context_class
      ELSE 'tenant_service'::app.port_context_class
    END,
    'integrator.reminder-occurrence-finalized.record',
    app.hash_port_typed_args(ARRAY[
      ROW('text@1', pg_catalog.textsend($1))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($2))::app.port_typed_arg,
      ROW('bigint@1', pg_catalog.int8send($3))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send($4))::app.port_typed_arg,
      ROW('uuid@1', pg_catalog.uuid_send($5))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($6))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($7))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($8))::app.port_typed_arg,
      ROW('text@1', pg_catalog.textsend($9))::app.port_typed_arg,
      ROW('timestamptz@1', pg_catalog.timestamptz_send($10))::app.port_typed_arg
    ]),
    'app.record_reminder_occurrence_finalized_projection(text,text,bigint,uuid,uuid,text,text,text,text,timestamp with time zone)'::regprocedure
  );

  IF p_organization_id IS NULL
     OR p_organization_id IS DISTINCT FROM app.current_org_id() THEN
    RAISE EXCEPTION 'reminder_occurrence_organization_context_denied'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.org_enrollments AS enrollment
    WHERE enrollment.organization_id = p_organization_id
      AND enrollment.platform_user_id = p_platform_user_id
      AND enrollment.status = 'active'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'active patient enrollment required for reminder occurrence projection';
  END IF;

  INSERT INTO public.reminder_occurrence_history (
    integrator_occurrence_id,
    integrator_rule_id,
    integrator_user_id,
    platform_user_id,
    organization_id,
    category,
    status,
    delivery_channel,
    error_code,
    occurred_at
  ) VALUES (
    p_integrator_occurrence_id,
    p_integrator_rule_id,
    p_integrator_user_id,
    p_platform_user_id,
    p_organization_id,
    p_category,
    p_status,
    p_delivery_channel,
    p_error_code,
    p_occurred_at
  )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RETURN v_row_count > 0;
END;
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_org_commerce_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.refresh_saas_billing_invoice_purchased_tariff(
  p_saas_billing_invoice_id uuid,
  p_organization_id uuid,
  p_tariff_id uuid
) RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_saas_billing_subscription_id uuid;
  v_subscription_tariff_id uuid;
  v_subscription_pending_tariff_id uuid;
  v_paid_additional_seats integer;
  v_carried_debt_minor integer;
  v_tariff public.saas_tariffs%ROWTYPE;
  v_amount_minor integer;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_org_commerce_owner'::name,
    ARRAY['app_clinic_billing'::name]::name[]
  );

  IF p_organization_id IS NULL
     OR p_organization_id IS DISTINCT FROM app.current_org_id() THEN
    RAISE EXCEPTION 'saas_billing_organization_context_denied'
      USING ERRCODE = '42501';
  END IF;

  SELECT invoice.saas_billing_subscription_id, invoice.carried_debt_minor
  INTO v_saas_billing_subscription_id, v_carried_debt_minor
  FROM public.saas_billing_invoices AS invoice
  WHERE invoice.id = p_saas_billing_invoice_id
    AND invoice.organization_id = p_organization_id
    AND invoice.invoice_kind = 'tariff_period'
    AND invoice.description IS NULL
    AND invoice.expires_at IS NULL
    AND invoice.status = 'draft'
    AND invoice.provider_invoice_ref IS NULL
  FOR UPDATE;

  IF v_saas_billing_subscription_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT subscription.tariff_id, subscription.pending_tariff_id, subscription.paid_additional_seats
  INTO v_subscription_tariff_id, v_subscription_pending_tariff_id, v_paid_additional_seats
  FROM public.saas_billing_subscriptions AS subscription
  WHERE subscription.id = v_saas_billing_subscription_id
    AND subscription.organization_id = p_organization_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF p_tariff_id IS DISTINCT FROM v_subscription_tariff_id
     AND p_tariff_id IS DISTINCT FROM v_subscription_pending_tariff_id THEN
    RETURN false;
  END IF;

  SELECT * INTO v_tariff FROM public.saas_tariffs AS tariff WHERE tariff.id = p_tariff_id;

  IF NOT FOUND OR v_tariff.price_minor IS NULL OR v_tariff.currency IS NULL THEN
    RETURN false;
  END IF;

  IF v_paid_additional_seats > 0 AND v_tariff.additional_seat_price_minor IS NULL THEN
    RETURN false;
  END IF;

  v_amount_minor :=
    v_tariff.price_minor
    + v_paid_additional_seats * coalesce(v_tariff.additional_seat_price_minor, 0)
    + coalesce(v_carried_debt_minor, 0);

  UPDATE public.saas_billing_invoices AS invoice
  SET tariff_id = v_tariff.id,
      tariff_name = v_tariff.name,
      amount_minor = v_amount_minor,
      currency = v_tariff.currency,
      tariff_billing_period = v_tariff.billing_period,
      additional_seat_quantity = v_paid_additional_seats,
      tariff_snapshot = to_jsonb(v_tariff),
      updated_at = now()
  WHERE invoice.id = p_saas_billing_invoice_id
    AND invoice.organization_id = p_organization_id
    AND invoice.status = 'draft'
    AND invoice.provider_invoice_ref IS NULL;

  RETURN FOUND;
END;
$function$;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_org_commerce_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE OR REPLACE FUNCTION app.release_carried_seat_debt(
  p_saas_billing_invoice_id uuid,
  p_organization_id uuid
) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_amount_minor integer;
  v_currency text;
  v_successor_id uuid;
  v_next_id uuid;
  v_status text;
  v_carried_debt_minor integer;
  v_hops integer := 0;
BEGIN
  PERFORM app.require_attested_context_for_roles(
    'app_seam_org_commerce_owner'::name,
    ARRAY['app_clinic_billing'::name]::name[]
  );

  IF p_organization_id IS NULL
     OR p_organization_id IS DISTINCT FROM app.current_org_id() THEN
    RAISE EXCEPTION 'saas_billing_organization_context_denied'
      USING ERRCODE = '42501';
  END IF;

  SELECT invoice.amount_minor, invoice.currency, invoice.superseded_by_invoice_id
  INTO v_amount_minor, v_currency, v_successor_id
  FROM public.saas_billing_invoices AS invoice
  WHERE invoice.id = p_saas_billing_invoice_id
    AND invoice.organization_id = p_organization_id
    AND invoice.invoice_kind = 'seat_overage'
    AND invoice.status = 'void'
    AND invoice.superseded_by_invoice_id IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_superseded';
  END IF;

  LOOP
    SELECT successor.status, successor.superseded_by_invoice_id, successor.carried_debt_minor
    INTO v_status, v_next_id, v_carried_debt_minor
    FROM public.saas_billing_invoices AS successor
    WHERE successor.id = v_successor_id
      AND successor.organization_id = p_organization_id
      AND successor.currency = v_currency
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN 'already_billed';
    END IF;

    EXIT WHEN v_status <> 'void' OR v_next_id IS NULL;

    v_successor_id := v_next_id;
    v_hops := v_hops + 1;

    IF v_hops > 16 THEN
      RAISE EXCEPTION 'saas_billing_superseded_chain_too_long'
        USING ERRCODE = 'data_corrupted';
    END IF;
  END LOOP;

  IF v_status NOT IN ('draft', 'pending') OR v_carried_debt_minor < v_amount_minor THEN
    RETURN 'already_billed';
  END IF;

  UPDATE public.saas_billing_invoices AS successor
  SET amount_minor = successor.amount_minor - v_amount_minor,
      carried_debt_minor = successor.carried_debt_minor - v_amount_minor,
      updated_at = now()
  WHERE successor.id = v_successor_id
    AND successor.organization_id = p_organization_id;

  RETURN 'released';
END;
$function$;
