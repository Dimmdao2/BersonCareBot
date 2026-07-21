-- Specialist owner provisioning RLS/grants overlay.
--
-- UP:
--   psql <approved-test-or-host-connection> -v ON_ERROR_STOP=1 -f deploy/postgres/specialist-owner-provisioning-rls.sql
--
-- DOWN / rollback:
--   psql <approved-test-or-host-connection> -v ON_ERROR_STOP=1 -v specialist_owner_provisioning_down=1 -f deploy/postgres/specialist-owner-provisioning-rls.sql
--
-- This file intentionally contains no connection strings. Operators provide the approved TEST
-- connection context. It does not grant BYPASSRLS and does not weaken existing tables.

\set ON_ERROR_STOP on
\pset pager off

\if :{?specialist_owner_provisioning_down}
\else
\set specialist_owner_provisioning_down 0
\endif

SELECT 1 / (:'specialist_owner_provisioning_down' IN ('0', '1'))::int
  AS specialist_owner_provisioning_down_is_valid;

SELECT pg_get_userbyid(c.relowner) AS specialist_owner_provisioning_owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'specialist_signup_intents'
  AND c.relkind IN ('r', 'p') \gset

SELECT quote_ident(:'specialist_owner_provisioning_owner') AS specialist_owner_provisioning_owner_ident \gset

BEGIN;

\if :specialist_owner_provisioning_down
DROP FUNCTION IF EXISTS app.provision_specialist_owner(uuid);
\else
SELECT (
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient')
  AND EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app')
  AND to_regclass('public.specialist_signup_intents') IS NOT NULL
  AND to_regclass('public.platform_users') IS NOT NULL
  AND to_regclass('public.be_organizations') IS NOT NULL
  AND to_regclass('public.be_organization_members') IS NOT NULL
  AND to_regclass('public.saas_tariffs') IS NOT NULL
  AND to_regclass('public.saas_trial_policy') IS NOT NULL
  AND to_regclass('public.saas_organization_trials') IS NOT NULL
  AND to_regclass('public.reference_catalog_baselines') IS NOT NULL
  AND to_regprocedure('app.seed_reference_catalog_snapshot(uuid)') IS NOT NULL
  AND to_regprocedure('app.require_staff_security_self_user_id()') IS NOT NULL
  AND has_function_privilege(
    :'specialist_owner_provisioning_owner',
    'app.require_staff_security_self_user_id()',
    'EXECUTE'
  )
)::int AS specialist_owner_provisioning_preflight_ok \gset

\if :specialist_owner_provisioning_preflight_ok
\else
\echo 'FATAL: prerequisites missing -- app_patient, schema app, signup/users/orgs/members and reference catalog baseline must all exist.'
SELECT 1 / 0 AS specialist_owner_provisioning_abort;
\endif

-- Retire the former caller-targeted overload before exposing the self-scoped replacement.
DROP FUNCTION IF EXISTS app.provision_specialist_owner(uuid, uuid);

CREATE OR REPLACE FUNCTION app.provision_specialist_owner(p_challenge_id uuid)
RETURNS TABLE (
  ok boolean,
  code text,
  organization_id uuid,
  specialist_id uuid,
  membership_id uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  v_intent record;
  v_user record;
  v_platform_user_id uuid;
  v_organization_id uuid;
  v_membership_id uuid;
  v_trial_policy record;
  v_trial_started_at timestamptz;
  v_has_trial_policy boolean := false;
  v_start_trial boolean := false;
BEGIN
  v_platform_user_id := app.require_staff_security_self_user_id();

  SELECT i.*
  INTO v_intent
  FROM public.specialist_signup_intents AS i
  WHERE i.user_id = v_platform_user_id
    AND i.challenge_id = p_challenge_id
    AND i.status = 'pending'
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT i.*
    INTO v_intent
    FROM public.specialist_signup_intents AS i
    WHERE i.user_id = v_platform_user_id
      AND i.challenge_id = p_challenge_id
      AND i.status = 'provisioned'
    LIMIT 1
    FOR UPDATE;

    IF FOUND
      AND v_intent.provisioned_organization_id IS NOT NULL
      AND v_intent.provisioned_membership_id IS NOT NULL THEN
      RETURN QUERY SELECT
        true,
        NULL::text,
        v_intent.provisioned_organization_id,
        v_intent.provisioned_specialist_id,
        v_intent.provisioned_membership_id;
      RETURN;
    END IF;

    RETURN QUERY SELECT false, 'specialist_signup_intent_not_found'::text, NULL::uuid, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  SELECT u.id
  INTO v_user
  FROM public.platform_users AS u
  WHERE u.id = v_platform_user_id
    AND u.merged_into_id IS NULL
    AND u.email_verified_at IS NOT NULL
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'specialist_signup_user_not_verified'::text, NULL::uuid, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  -- Lock the canonical identity before checking memberships so concurrent self-provision attempts
  -- cannot both observe an empty membership set and create two owner organizations.
  PERFORM 1
  FROM public.be_organization_members AS m
  WHERE m.platform_user_id = v_user.id
    AND m.status = 'active'
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RETURN QUERY SELECT false, 'specialist_signup_active_membership_exists'::text, NULL::uuid, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  -- The active policy is selected inside the same SECURITY DEFINER transaction as organization
  -- creation. Only organization_provisioned starts here; email_verified/manual remain truthful
  -- deferred states. No active policy means no trial, never a fabricated default or an outage.
  SELECT policy.*
  INTO v_trial_policy
  FROM public.saas_trial_policy AS policy
  JOIN public.saas_tariffs AS tariff
    ON tariff.id = policy.tariff_id
   AND tariff.is_active
  WHERE policy.key = 'global'
    AND policy.is_active
  LIMIT 1
  FOR UPDATE OF policy;
  v_has_trial_policy := FOUND;
  IF v_has_trial_policy THEN
    v_start_trial := v_trial_policy.start_event = 'organization_provisioned';
  END IF;

  UPDATE public.platform_users AS u
  SET role = 'doctor',
      display_name = v_intent.specialist_full_name,
      updated_at = now()
  WHERE u.id = v_user.id;

  v_organization_id := gen_random_uuid();

  INSERT INTO public.be_organizations (
    id,
    title,
    is_active,
    sort_order,
    tariff_id,
    commercial_access_state,
    created_at,
    updated_at
  )
  VALUES (
    v_organization_id,
    v_intent.organization_title,
    true,
    0,
    CASE WHEN v_start_trial THEN v_trial_policy.tariff_id ELSE NULL END,
    CASE
      WHEN v_start_trial THEN 'active'
      WHEN v_has_trial_policy THEN 'trial_pending'
      ELSE 'no_trial'
    END,
    now(),
    now()
  );

  IF v_start_trial THEN
    v_trial_started_at := clock_timestamp();
    INSERT INTO public.saas_organization_trials (
    organization_id,
    tariff_id,
    started_at,
    ends_at,
    grace_ends_at,
    post_trial_behavior,
    post_trial_tariff_id,
    status,
    created_by
  ) VALUES (
    v_organization_id,
    v_trial_policy.tariff_id,
    v_trial_started_at,
    v_trial_started_at + make_interval(days => v_trial_policy.duration_days),
    v_trial_started_at + make_interval(days => v_trial_policy.duration_days + v_trial_policy.grace_days),
    v_trial_policy.post_trial_behavior,
    v_trial_policy.post_trial_tariff_id,
    'active',
    v_user.id
    );

    INSERT INTO public.admin_audit_log (
    organization_id,
    actor_id,
    action,
    target_id,
    details,
    status
  ) VALUES (
    v_organization_id,
    v_user.id,
    'saas_trial_start',
    v_organization_id::text,
    jsonb_build_object(
      'reason', 'automatic organization provisioning trial',
      'before', NULL,
      'after', jsonb_build_object(
        'tariffId', v_trial_policy.tariff_id,
        'durationDays', v_trial_policy.duration_days,
        'graceDays', v_trial_policy.grace_days,
        'startEvent', v_trial_policy.start_event,
        'postTrialBehavior', v_trial_policy.post_trial_behavior,
        'postTrialTariffId', v_trial_policy.post_trial_tariff_id
      )
    ),
    'ok'
    );
  END IF;

  INSERT INTO public.be_organization_members (
    organization_id,
    platform_user_id,
    role,
    specialist_id,
    status,
    created_at,
    updated_at
  )
  VALUES (
    v_organization_id,
    v_user.id,
    'owner',
    NULL,
    'active',
    now(),
    now()
  )
  RETURNING id INTO v_membership_id;

  -- Same SECURITY DEFINER transaction: the new organization is not observable without its own
  -- independent catalog snapshot. The helper only inserts the current repo-managed baseline.
  PERFORM app.seed_reference_catalog_snapshot(v_organization_id);

  UPDATE public.specialist_signup_intents AS i
  SET status = 'provisioned',
      provisioned_organization_id = v_organization_id,
      provisioned_membership_id = v_membership_id,
      provisioned_specialist_id = NULL,
      provisioned_at = now()
  WHERE i.id = v_intent.id;

  RETURN QUERY SELECT true, NULL::text, v_organization_id, NULL::uuid, v_membership_id;
END
$$;

COMMENT ON FUNCTION app.provision_specialist_owner(uuid) IS
  'Signed identity-self specialist owner provisioning. Rejects a second active staff organization and defers be_specialists to a real staff principal.';

ALTER FUNCTION app.provision_specialist_owner(uuid) OWNER TO :specialist_owner_provisioning_owner_ident;
ALTER FUNCTION app.seed_reference_catalog_snapshot(uuid) OWNER TO :specialist_owner_provisioning_owner_ident;
GRANT SELECT ON TABLE public.reference_catalog_baselines TO :specialist_owner_provisioning_owner_ident;

REVOKE ALL ON FUNCTION app.provision_specialist_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.seed_reference_catalog_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.provision_specialist_owner(uuid) TO app_patient;
\endif

COMMIT;
