-- BCB-MIGRATION-OWNER: app_seam_specialist_provision_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- The exact clinic-billing capability already authenticates the caller and installs an accepted
-- organization context. A SECURITY DEFINER body must not re-check app.is_staff(): current_user
-- is the closed seam owner, not the invoking runtime role.
CREATE OR REPLACE FUNCTION app.choose_organization_first_tariff(
  p_tariff_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_organization_id uuid := app.current_org_id();
  v_policy record;
  v_started_at timestamptz;
  v_trial_id uuid;
  v_has_prior_trial boolean;
  v_account_id uuid;
BEGIN
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_context_required';
  END IF;

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

  SELECT EXISTS (
    SELECT 1
    FROM public.saas_organization_trials AS trial
    WHERE trial.organization_id = v_organization_id
  )
  INTO v_has_prior_trial;

  UPDATE public.be_organizations
  SET tariff_id = p_tariff_id,
      updated_at = now()
  WHERE id = v_organization_id;

  INSERT INTO public.saas_billing_accounts AS account (organization_id)
  VALUES (v_organization_id)
  ON CONFLICT (organization_id) DO UPDATE
  SET updated_at = now()
  RETURNING account.id INTO v_account_id;

  INSERT INTO public.saas_billing_subscriptions AS subscription (
    organization_id,
    saas_billing_account_id,
    tariff_id,
    source,
    status,
    lifecycle_state
  )
  VALUES (
    v_organization_id,
    v_account_id,
    p_tariff_id,
    'paid_subscription',
    'pending_payment',
    'active'
  )
  ON CONFLICT (organization_id, source) DO UPDATE
  SET tariff_id = EXCLUDED.tariff_id,
      status = 'pending_payment',
      lifecycle_state = 'active',
      updated_at = now(),
      current_period_starts_at = NULL,
      current_period_ends_at = NULL,
      pending_tariff_id = NULL,
      tariff_snapshot = NULL;

  INSERT INTO public.admin_audit_log (
    organization_id, actor_id, action, target_id, details, status
  ) VALUES (
    v_organization_id,
    p_actor_id,
    'saas_registration_tariff_assign',
    p_tariff_id::text,
    jsonb_build_object(
      'reason', 'clinic first tariff choice',
      'before', NULL,
      'after', jsonb_build_object('tariffId', p_tariff_id)
    ),
    'ok'
  );

  IF v_has_prior_trial THEN
    RETURN jsonb_build_object('outcome', 'payment_required');
  END IF;

  SELECT policy.*
  INTO v_policy
  FROM public.saas_trial_policy AS policy
  WHERE policy.key = 'global'
    AND policy.is_active
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'payment_required');
  END IF;

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

  IF v_trial_id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'payment_required');
  END IF;

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
