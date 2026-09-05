-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT to_regclass('public.saas_tariff_period_prices') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'saas_billing_subscriptions' AND column_name = 'billing_period_code') AND pg_get_functiondef('app.list_saas_billing_subscriptions_due_for_renewal(timestamp with time zone,integer)'::regprocedure) LIKE '%pending_billing_period_code, subscription.billing_period_code%' AND pg_get_functiondef('app.list_saas_billing_subscriptions_due_for_renewal(timestamp with time zone,integer)'::regprocedure) LIKE '%cancelled_at IS NULL%' AND pg_get_functiondef('app.list_saas_billing_subscriptions_due_for_renewal(timestamp with time zone,integer)'::regprocedure) NOT LIKE '%saas_tariffs%' AND pg_get_functiondef('app.list_saas_billing_subscriptions_due_for_renewal(timestamp with time zone,integer)'::regprocedure) LIKE '%period.months%' AND pg_get_functiondef('app.list_saas_billing_subscriptions_due_for_renewal(timestamp with time zone,integer)'::regprocedure) LIKE '%price.price_minor%' AND to_regprocedure('app.choose_organization_first_tariff(uuid,uuid)') IS NULL AND to_regprocedure('app.choose_organization_first_tariff(uuid,uuid,text)') IS NOT NULL AND to_regprocedure('app.refresh_saas_billing_invoice_purchased_tariff(uuid,uuid,uuid)') IS NULL AND to_regprocedure('app.refresh_saas_billing_invoice_purchased_tariff(uuid,uuid,uuid,text)') IS NOT NULL AND pg_get_functiondef('app.refresh_saas_billing_invoice_purchased_tariff(uuid,uuid,uuid,text)'::regprocedure) LIKE '%price.price_minor%'
--
-- #1069 owner decision 2026-09-05 (period grid): ONE global configurable billing-period grid
-- applies to every tariff (owner item 1); every ACTIVE tariff carries a price for EVERY globally
-- selectable period (owner item 2). `saas_tariffs.price_minor`/`billing_period` no longer answer
-- "what does this tariff cost" — this table does, keyed by (tariff, period) exactly like a
-- subscription and an invoice reference the pair together below.
CREATE TABLE public.saas_tariff_period_prices (
  tariff_id uuid NOT NULL REFERENCES public.saas_tariffs(id) ON DELETE CASCADE,
  billing_period_code text NOT NULL REFERENCES public.saas_billing_periods(code) ON DELETE RESTRICT,
  price_minor integer NOT NULL,
  discounted_price_minor integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT saas_tariff_period_prices_pkey PRIMARY KEY (tariff_id, billing_period_code),
  CONSTRAINT saas_tariff_period_prices_price_nonnegative_check CHECK (price_minor >= 0),
  CONSTRAINT saas_tariff_period_prices_discounted_price_nonnegative_check
    CHECK (discounted_price_minor IS NULL OR discounted_price_minor >= 0)
);

-- Reverse lookup: "which tariffs are priced for this period" — the completeness check a period
-- activation runs (every active tariff already has a row for the period being turned selectable).
CREATE INDEX idx_saas_tariff_period_prices_period_tariff
  ON public.saas_tariff_period_prices (billing_period_code, tariff_id);

-- The pair a subscription is CURRENTLY on, and the pair scheduled for its next paid period
-- (nullable — appears and disappears with `pending_tariff_id`, see the check below).
-- (`saas_billing_invoices.tariff_billing_period` already carries a live FK to
-- `saas_billing_periods.code` from the earlier T9 catalog work — nothing to change there.)
ALTER TABLE public.saas_billing_subscriptions
  ADD COLUMN billing_period_code text,
  ADD COLUMN pending_billing_period_code text;
--> statement-breakpoint
-- BCB-MIGRATION-BACKFILL
-- Seeds the new money authority from the ONLY legacy source that ever set a real price on a
-- tariff — its own frozen `price_minor`/`billing_period`/`discounted_price_minor` — never an
-- invented amount and never a multiplied monthly price. A tariff that never had a price (still
-- `price_minor IS NULL`, e.g. a draft never activated) gets no row here, same as before.
INSERT INTO public.saas_tariff_period_prices (tariff_id, billing_period_code, price_minor, discounted_price_minor)
SELECT id, billing_period, price_minor, discounted_price_minor
  FROM public.saas_tariffs
 WHERE price_minor IS NOT NULL
ON CONFLICT (tariff_id, billing_period_code) DO NOTHING;

-- A subscription only ever really had a period once it lived through an actual paid cycle
-- (`current_period_starts_at IS NOT NULL`); derive its current pair from its own tariff's frozen
-- legacy period — but ONLY when that legacy pair actually landed a row in the matrix above (a
-- subscription on a tariff whose `price_minor` was already NULL before this migration must not
-- gain a `billing_period_code` the new composite FK cannot satisfy).
UPDATE public.saas_billing_subscriptions AS subscription
   SET billing_period_code = tariff.billing_period
  FROM public.saas_tariffs AS tariff
 WHERE subscription.tariff_id = tariff.id
   AND subscription.current_period_starts_at IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM public.saas_tariff_period_prices AS price
      WHERE price.tariff_id = tariff.id AND price.billing_period_code = tariff.billing_period
   );

-- A scheduled tariff change already names its target tariff (`pending_tariff_id`); the period
-- paired with it is that tariff's own frozen legacy period, for the same reason as above — and
-- the same guard: no row in the matrix means no pending pair is set, leaving the CHECK-parity
-- constraint below to see a plain "no change pending" (`pending_tariff_id IS NULL`) instead of a
-- half-written pair. `pending_tariff_id` itself is left untouched either way — that column is not
-- part of this migration's contract and a NULL `pending_billing_period_code` under a non-NULL
-- `pending_tariff_id` is exactly what the CHECK below would reject, so it must never be created.
UPDATE public.saas_billing_subscriptions AS subscription
   SET pending_billing_period_code = tariff.billing_period
  FROM public.saas_tariffs AS tariff
 WHERE subscription.pending_tariff_id = tariff.id
   AND EXISTS (
     SELECT 1 FROM public.saas_tariff_period_prices AS price
      WHERE price.tariff_id = tariff.id AND price.billing_period_code = tariff.billing_period
   );

-- The guard above can leave a `pending_tariff_id` without a matching `pending_billing_period_code`
-- (no legacy price row to derive one from) — the CHECK below requires the pair to be all-or-
-- nothing, and inventing a period here would misrepresent what the clinic actually scheduled.
-- Clearing the stale `pending_tariff_id` drops back to "no change pending", which is the honest
-- state: nothing this migration can prove was ever a real scheduled purchase.
UPDATE public.saas_billing_subscriptions
   SET pending_tariff_id = NULL
 WHERE pending_tariff_id IS NOT NULL
   AND pending_billing_period_code IS NULL;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- The pair being purchased/scheduled must be an ACTUALLY priced pair — MATCH SIMPLE (Postgres
-- default) skips the check while either column of a pair is NULL, which is exactly the
-- pre-first-payment / no-pending-change state the backfill above deliberately left alone.
ALTER TABLE public.saas_billing_subscriptions
  ADD CONSTRAINT saas_billing_subscriptions_tariff_period_price_fkey
    FOREIGN KEY (tariff_id, billing_period_code)
    REFERENCES public.saas_tariff_period_prices(tariff_id, billing_period_code) ON DELETE RESTRICT,
  ADD CONSTRAINT saas_billing_subscriptions_pending_tariff_period_price_fkey
    FOREIGN KEY (pending_tariff_id, pending_billing_period_code)
    REFERENCES public.saas_tariff_period_prices(tariff_id, billing_period_code) ON DELETE RESTRICT,
  ADD CONSTRAINT saas_billing_subscriptions_pending_period_pair_check
    CHECK ((pending_tariff_id IS NULL) = (pending_billing_period_code IS NULL));
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_org_commerce_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- #1069 owner decision 2026-09-05 (period grid) — the due-list read the renewal length off the
-- TARIFF's frozen legacy `billing_period`, which is now wrong the moment any subscription is on a
-- period other than its tariff's legacy one: a renewal must extend the subscription's OWN current
-- (or, if a change is pending, its scheduled) period, never the tariff's. The join to `saas_tariffs`
-- existed only to read that column and is dropped along with it. This also closes the documented but
-- unenforced half of owner decision item 3: cancellation must suppress future renewal, so a row with
-- `cancelled_at` set is now excluded here — the ONE place that decides "who is due" (see the port doc
-- on `cancelOwnTariffBillingSubscription` in `modules/saas-billing/ports.ts`).
--
-- F-2/F-3 (independent audit-live, 2026-09-05): `app_worker` runs the whole renewal tick and has no
-- broad SELECT on `saas_billing_periods`/`saas_tariff_period_prices` (nor should it — that would be a
-- wide new grant for a single background loop). This root already runs elevated
-- (`app_seam_org_commerce_owner`) and already names the purchased pair's code; it now ALSO resolves
-- that pair's `months`/`price_minor` here, trusted, so `runDueSaasBillingRenewals` never needs to call
-- the clinic-only period catalog and `createSaasBillingRenewalInvoiceIfAbsent` never needs a table
-- read on the price matrix under the worker role.
CREATE OR REPLACE FUNCTION app.list_saas_billing_subscriptions_due_for_renewal(p_as_of timestamp with time zone, p_limit integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE PARALLEL RESTRICTED SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM app.require_accepted_context('app_seam_org_commerce_owner'::name, 'app_worker'::name, 'service'::app.port_context_class, 'billing.saas-renewal.due-list', app.hash_port_typed_args(ARRAY[ROW('timestamptz@1', pg_catalog.timestamptz_send($1))::app.port_typed_arg, ROW('integer@1', pg_catalog.int4send($2))::app.port_typed_arg]), 'app.list_saas_billing_subscriptions_due_for_renewal(timestamp with time zone,integer)'::regprocedure);

  IF p_as_of IS NULL THEN
    RAISE EXCEPTION 'saas_billing_renewal_as_of_invalid' USING ERRCODE = '22023';
  END IF;
  -- Верхняя граница закрыта ЗДЕСЬ: корень отдаёт межарендный список, и «сколько строк за раз»
  -- не может быть свободным числом от вызывающего.
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
    RAISE EXCEPTION 'saas_billing_renewal_limit_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'saasBillingSubscriptionId', due.id,
           'organizationId', due.organization_id,
           'tariffId', due.purchased_tariff_id,
           'pendingTariffId', due.pending_tariff_id,
           'currentPeriodEndsAt', due.current_period_ends_at,
           'savedPaymentMethodId', due.saved_payment_method_id,
           'autopayConsentedAt', due.autopay_consented_at,
           'autopayRevokedAt', due.autopay_revoked_at,
           'billingPeriod', due.billing_period,
           'billingPeriodMonths', period.months,
           'billingPeriodPriceMinor', price.price_minor
         ) ORDER BY due.current_period_ends_at), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT subscription.id AS id,
             subscription.organization_id AS organization_id,
             COALESCE(subscription.pending_tariff_id, subscription.tariff_id) AS purchased_tariff_id,
             subscription.pending_tariff_id AS pending_tariff_id,
             subscription.current_period_ends_at AS current_period_ends_at,
             subscription.saved_payment_method_id AS saved_payment_method_id,
             subscription.autopay_consented_at AS autopay_consented_at,
             subscription.autopay_revoked_at AS autopay_revoked_at,
             COALESCE(subscription.pending_billing_period_code, subscription.billing_period_code) AS billing_period
        FROM public.saas_billing_subscriptions AS subscription
       WHERE subscription.source = 'paid_subscription'
         AND subscription.status = 'active'
         AND subscription.cancelled_at IS NULL
         AND subscription.current_period_ends_at IS NOT NULL
         AND subscription.current_period_ends_at <= p_as_of
       ORDER BY subscription.current_period_ends_at
       LIMIT p_limit
    ) AS due
    LEFT JOIN public.saas_billing_periods AS period ON period.code = due.billing_period
    LEFT JOIN public.saas_tariff_period_prices AS price
      ON price.tariff_id = due.purchased_tariff_id AND price.billing_period_code = due.billing_period;

  RETURN v_result;
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_specialist_provision_owner
-- F-1/§24.6 gap found while closing the independent audit (2026-09-05): the app-code call site
-- (`pgSaasBilling.ts` `chooseOrganizationFirstTariff`) already passes a 3rd `billingPeriodCode`
-- argument and `declaration.ts`/`function-census.ts` already declare the 3-arg identity, but no
-- migration ever replaced the 2-arg body — every first-tariff choice would fail
-- `function does not exist` (42883). DROP+CREATE because the argument list (and therefore the
-- function's identity/OID) changes.
DROP FUNCTION app.choose_organization_first_tariff(uuid, uuid);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_specialist_provision_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE FUNCTION app.choose_organization_first_tariff(p_tariff_id uuid, p_actor_id uuid, p_billing_period_code text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $function$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_policy record;
  v_started_at timestamptz;
  v_trial_id uuid;
  v_has_prior_trial boolean;
  v_account_id uuid;
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_specialist_provision_owner'::name, ARRAY['app_clinic_billing'::name, 'app_staff'::name]::name[]);

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_context_required';
  END IF;

  -- Тариф уже действует — это не первый выбор, а смена; у неё свой путь.
  PERFORM 1
  FROM public.be_organizations AS org
  WHERE org.id = v_organization_id
    AND org.tariff_id IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization_tariff_already_assigned';
  END IF;

  PERFORM 1
  FROM public.saas_tariffs AS tariff
  WHERE tariff.id = p_tariff_id
    AND tariff.is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tariff_not_found';
  END IF;

  -- #1069 owner decision 2026-09-05 (period grid) — the pair itself must be an ACTUALLY priced
  -- one. Whether it is currently globally selectable was already decided by the one canonical
  -- eligibility door upstream (`scheduleOwnTariffChange` / `listActiveTariffChoices`, F-5); this
  -- is defense in depth against a stale/forged pair reaching this seam directly, never a second
  -- place re-deciding selectability.
  IF NOT EXISTS (
    SELECT 1
    FROM public.saas_tariff_period_prices AS price
    WHERE price.tariff_id = p_tariff_id
      AND price.billing_period_code = p_billing_period_code
  ) THEN
    RAISE EXCEPTION 'saas_billing_period_not_priced_for_tariff';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.saas_organization_trials AS trial
    WHERE trial.organization_id = v_organization_id
  )
  INTO v_has_prior_trial;

  -- ВЫБРАНО. Пишется в обоих исходах: и когда начнётся пробный период, и когда клиника идёт платить.
  -- Повторный выбор до оплаты просто переписывает эту же строку — счёт выставляется на то, что
  -- выбрано последним.
  INSERT INTO public.saas_billing_accounts AS account (organization_id)
  VALUES (v_organization_id)
  ON CONFLICT (organization_id) DO UPDATE
  SET updated_at = now()
  RETURNING account.id INTO v_account_id;

  INSERT INTO public.saas_billing_subscriptions AS subscription (
    organization_id,
    saas_billing_account_id,
    tariff_id,
    billing_period_code,
    source,
    status,
    lifecycle_state
  )
  VALUES (
    v_organization_id,
    v_account_id,
    p_tariff_id,
    p_billing_period_code,
    'paid_subscription',
    'pending_payment',
    'active'
  )
  ON CONFLICT (organization_id, source) DO UPDATE
  SET tariff_id = EXCLUDED.tariff_id,
      billing_period_code = EXCLUDED.billing_period_code,
      status = 'pending_payment',
      lifecycle_state = 'active',
      updated_at = now(),
      current_period_starts_at = NULL,
      current_period_ends_at = NULL,
      pending_tariff_id = NULL,
      pending_billing_period_code = NULL,
      tariff_snapshot = NULL;

  -- Пробный период даётся организации один раз и тарифом не управляется: его длительность, точка
  -- отсчёта и поведение после окончания — строка `saas_trial_policy`, которую владелец правит в
  -- кабинете глобального админа. Здесь читается настройка, а не значения.
  IF NOT v_has_prior_trial THEN
    SELECT
      policy.duration_days,
      policy.discount_window_days,
      policy.post_trial_behavior,
      policy.post_trial_tariff_id,
      policy.start_event
    INTO v_policy
    FROM public.saas_trial_policy AS policy
    WHERE policy.key = 'global'
      AND policy.is_active
    LIMIT 1;

    IF FOUND THEN
      v_started_at := clock_timestamp();

      INSERT INTO public.saas_organization_trials (
        organization_id, tariff_id, started_at, ends_at, discount_ends_at,
        post_trial_behavior, post_trial_tariff_id, status, created_by
      ) VALUES (
        v_organization_id,
        p_tariff_id,
        v_started_at,
        v_started_at + make_interval(days => v_policy.duration_days),
        v_started_at + make_interval(days => v_policy.duration_days + v_policy.discount_window_days),
        v_policy.post_trial_behavior,
        v_policy.post_trial_tariff_id,
        'active',
        p_actor_id
      )
      ON CONFLICT (organization_id) DO NOTHING
      RETURNING id INTO v_trial_id;
    END IF;
  END IF;

  IF v_trial_id IS NULL THEN
    -- Сначала оплата. `be_organizations.tariff_id` НЕ трогаем: доступ откроет
    -- `app.apply_paid_saas_billing_tariff`, когда счёт станет `paid`.
    INSERT INTO public.admin_audit_log (
      organization_id, actor_id, action, target_id, details, status
    ) VALUES (
      v_organization_id,
      p_actor_id,
      'saas_tariff_choice_pending_payment',
      p_tariff_id::text,
      jsonb_build_object(
        'reason', 'clinic first tariff choice awaits payment',
        'before', NULL,
        'after', jsonb_build_object('tariffId', p_tariff_id, 'billingPeriodCode', p_billing_period_code)
      ),
      'ok'
    );

    RETURN jsonb_build_object('outcome', 'payment_required');
  END IF;

  -- ДЕЙСТВУЕТ. Единственный случай, когда первый выбор сам открывает доступ, — начавшийся пробный
  -- период: он по решению владельца даётся организации при первом входе и оплаты не требует.
  UPDATE public.be_organizations
  SET tariff_id = p_tariff_id,
      updated_at = now()
  WHERE id = v_organization_id;

  INSERT INTO public.admin_audit_log (
    organization_id, actor_id, action, target_id, details, status
  ) VALUES (
    v_organization_id,
    p_actor_id,
    'saas_registration_tariff_assign',
    p_tariff_id::text,
    jsonb_build_object(
      'reason', 'clinic first tariff choice trial',
      'before', NULL,
      'after', jsonb_build_object('tariffId', p_tariff_id, 'billingPeriodCode', p_billing_period_code)
    ),
    'ok'
  );

  INSERT INTO public.admin_audit_log (
    organization_id, actor_id, action, target_id, details, status
  ) VALUES (
    v_organization_id,
    p_actor_id,
    'saas_trial_start',
    v_trial_id::text,
    jsonb_build_object(
      'reason', 'clinic first tariff choice trial',
      'before', NULL,
      'after', jsonb_build_object(
        'tariffId', p_tariff_id,
        'billingPeriodCode', p_billing_period_code,
        'durationDays', v_policy.duration_days,
        'discountWindowDays', v_policy.discount_window_days,
        'startEvent', v_policy.start_event,
        'postTrialBehavior', v_policy.post_trial_behavior,
        'postTrialTariffId', v_policy.post_trial_tariff_id
      )
    ),
    'ok'
  );

  RETURN jsonb_build_object(
    'outcome', 'trial_started',
    'endsAt', (v_started_at + make_interval(days => v_policy.duration_days))::text,
    'trialId', v_trial_id::text
  );
END
$function$;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_org_commerce_owner
-- Same gap as above, other call site: `pgSaasBilling.ts` `refreshSaasBillingInvoicePurchasedTariff`
-- already passes a 4th `billingPeriodCode` argument; no migration ever replaced the 3-arg body.
-- DROP+CREATE because the argument list changes.
DROP FUNCTION app.refresh_saas_billing_invoice_purchased_tariff(uuid, uuid, uuid);
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_seam_org_commerce_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
CREATE FUNCTION app.refresh_saas_billing_invoice_purchased_tariff(
  p_saas_billing_invoice_id uuid,
  p_organization_id uuid,
  p_tariff_id uuid,
  p_billing_period_code text
) RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_saas_billing_subscription_id uuid;
  v_subscription_tariff_id uuid;
  v_subscription_billing_period_code text;
  v_subscription_pending_tariff_id uuid;
  v_subscription_pending_billing_period_code text;
  v_paid_additional_seats integer;
  v_carried_debt_minor integer;
  v_tariff public.saas_tariffs%ROWTYPE;
  v_price_minor integer;
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

  SELECT subscription.tariff_id, subscription.billing_period_code,
         subscription.pending_tariff_id, subscription.pending_billing_period_code,
         subscription.paid_additional_seats
  INTO v_subscription_tariff_id, v_subscription_billing_period_code,
       v_subscription_pending_tariff_id, v_subscription_pending_billing_period_code,
       v_paid_additional_seats
  FROM public.saas_billing_subscriptions AS subscription
  WHERE subscription.id = v_saas_billing_subscription_id
    AND subscription.organization_id = p_organization_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- #1069 owner decision 2026-09-05 (period grid) — the PAIR (not the tariff alone) must match
  -- either the subscription's current pair or its scheduled pending one; anything else is refused,
  -- same shape as the pre-existing tariff-alone check this replaces.
  IF (p_tariff_id, p_billing_period_code)
       IS DISTINCT FROM (v_subscription_tariff_id, v_subscription_billing_period_code)
     AND (p_tariff_id, p_billing_period_code)
       IS DISTINCT FROM (v_subscription_pending_tariff_id, v_subscription_pending_billing_period_code)
  THEN
    RETURN false;
  END IF;

  SELECT * INTO v_tariff FROM public.saas_tariffs AS tariff WHERE tariff.id = p_tariff_id;

  IF NOT FOUND OR v_tariff.currency IS NULL THEN
    RETURN false;
  END IF;

  IF v_paid_additional_seats > 0 AND v_tariff.additional_seat_price_minor IS NULL THEN
    RETURN false;
  END IF;

  -- #1069 owner decision 2026-09-05 (period grid) — the amount comes from the money matrix for
  -- THIS (tariff, period) pair, never the tariff's frozen legacy `price_minor`.
  SELECT price.price_minor INTO v_price_minor
  FROM public.saas_tariff_period_prices AS price
  WHERE price.tariff_id = p_tariff_id
    AND price.billing_period_code = p_billing_period_code;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_amount_minor :=
    v_price_minor
    + v_paid_additional_seats * coalesce(v_tariff.additional_seat_price_minor, 0)
    + coalesce(v_carried_debt_minor, 0);

  UPDATE public.saas_billing_invoices AS invoice
  SET tariff_id = v_tariff.id,
      tariff_name = v_tariff.name,
      amount_minor = v_amount_minor,
      currency = v_tariff.currency,
      tariff_billing_period = p_billing_period_code,
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
