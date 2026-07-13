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
DROP FUNCTION IF EXISTS app.provision_specialist_owner(uuid, uuid);
\else
SELECT (
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient')
  AND EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app')
  AND to_regclass('public.specialist_signup_intents') IS NOT NULL
  AND to_regclass('public.platform_users') IS NOT NULL
  AND to_regclass('public.be_organizations') IS NOT NULL
  AND to_regclass('public.be_organization_members') IS NOT NULL
)::int AS specialist_owner_provisioning_preflight_ok \gset

\if :specialist_owner_provisioning_preflight_ok
\else
\echo 'FATAL: prerequisites missing -- app_patient, schema app, signup intents/users/orgs/members tables must all exist.'
SELECT 1 / 0 AS specialist_owner_provisioning_abort;
\endif

CREATE OR REPLACE FUNCTION app.provision_specialist_owner(
  p_platform_user_id uuid,
  p_challenge_id uuid
)
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
SET search_path = public, pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  v_intent record;
  v_user record;
  v_organization_id uuid;
  v_membership_id uuid;
BEGIN
  SELECT i.*
  INTO v_intent
  FROM public.specialist_signup_intents AS i
  WHERE i.user_id = p_platform_user_id
    AND i.challenge_id = p_challenge_id
    AND i.status = 'pending'
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT i.*
    INTO v_intent
    FROM public.specialist_signup_intents AS i
    WHERE i.user_id = p_platform_user_id
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
  WHERE u.id = p_platform_user_id
    AND u.merged_into_id IS NULL
    AND u.email_verified_at IS NOT NULL
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'specialist_signup_user_not_verified'::text, NULL::uuid, NULL::uuid, NULL::uuid;
    RETURN;
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
    created_at,
    updated_at
  )
  VALUES (
    v_organization_id,
    v_intent.organization_title,
    true,
    0,
    now(),
    now()
  );

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

COMMENT ON FUNCTION app.provision_specialist_owner(uuid, uuid) IS
  'Narrow SECURITY DEFINER specialist owner provisioning for pre-session signup. Creates organization and owner membership only; be_specialists is deferred to a real staff principal.';

ALTER FUNCTION app.provision_specialist_owner(uuid, uuid) OWNER TO :specialist_owner_provisioning_owner_ident;

REVOKE ALL ON FUNCTION app.provision_specialist_owner(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.provision_specialist_owner(uuid, uuid) TO app_patient;
\endif

COMMIT;
