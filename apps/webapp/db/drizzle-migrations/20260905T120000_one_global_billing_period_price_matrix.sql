-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT to_regclass('public.saas_tariff_period_prices') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'saas_billing_subscriptions' AND column_name = 'billing_period_code') AND pg_get_functiondef('app.list_saas_billing_subscriptions_due_for_renewal(timestamp with time zone,integer)'::regprocedure) LIKE '%pending_billing_period_code, subscription.billing_period_code%' AND pg_get_functiondef('app.list_saas_billing_subscriptions_due_for_renewal(timestamp with time zone,integer)'::regprocedure) LIKE '%cancelled_at IS NULL%' AND pg_get_functiondef('app.list_saas_billing_subscriptions_due_for_renewal(timestamp with time zone,integer)'::regprocedure) NOT LIKE '%saas_tariffs%'
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
-- legacy period, which the insert above just guaranteed a matching price row for.
UPDATE public.saas_billing_subscriptions AS subscription
   SET billing_period_code = tariff.billing_period
  FROM public.saas_tariffs AS tariff
 WHERE subscription.tariff_id = tariff.id
   AND subscription.current_period_starts_at IS NOT NULL;

-- A scheduled tariff change already names its target tariff (`pending_tariff_id`); the period
-- paired with it is that tariff's own frozen legacy period, for the same reason as above.
UPDATE public.saas_billing_subscriptions AS subscription
   SET pending_billing_period_code = tariff.billing_period
  FROM public.saas_tariffs AS tariff
 WHERE subscription.pending_tariff_id = tariff.id;
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
           'billingPeriod', due.billing_period
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
    ) AS due;

  RETURN v_result;
END
$function$;
