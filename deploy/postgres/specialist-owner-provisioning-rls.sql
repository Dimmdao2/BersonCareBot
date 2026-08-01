-- Specialist owner provisioning RLS/grants overlay.
--
-- UP:
--   psql <approved-test-or-host-connection> -v ON_ERROR_STOP=1 -f deploy/postgres/specialist-owner-provisioning-rls.sql
--
-- DOWN / rollback:
--   psql <approved-test-or-host-connection> -v ON_ERROR_STOP=1 -v specialist_owner_provisioning_down=1 -f deploy/postgres/specialist-owner-provisioning-rls.sql
--
-- This file intentionally contains no connection strings. Operators provide the approved TEST
-- connection context. It does not grant BYPASSRLS to any login/app role and does not weaken
-- existing tables.
--
-- Owner seam (taskdb follow-up, root cause of stalled specialist self-signup): app.
-- provision_specialist_owner(uuid) INSERTs into public.be_organizations, which has FORCE ROW
-- LEVEL SECURITY and no INSERT policy. Under FORCE, even a table's own owner is policy-bound
-- unless it carries BYPASSRLS -- so when this function was owned by the migrator role (NOLOGIN
-- false, NOBYPASSRLS), the very first write of every self-signup provisioning attempt raised
-- "new row violates row-level security policy" and rolled back the whole transaction. app_owner
-- (NOLOGIN + BYPASSRLS, zero SET ROLE members, already the trusted definer-owner of
-- app.is_staff()/app.current_org_id()/app.current_patient_user_id() -- see
-- deploy/postgres/p2-b-protected-principal-context.sql) is not request-reachable and is only ever
-- invoked through specifically-granted-and-owned SECURITY DEFINER functions. This function derives
-- the acting user exclusively from the signed principal (app.require_staff_security_self_user_id(),
-- itself reading the locked app.principal_context) and never from a caller argument, and it rejects
-- a second active org membership under a row lock -- so reassigning it to app_owner is safe: no
-- caller can widen what it does, only what row-security wall it clears. Two sibling overlays
-- already resolve their own reassignment target dynamically from this function's current owner
-- (deploy/postgres/reference-catalog-rls.sql's :"provisioning_owner" \gset, and the \gexec grant in
-- deploy/postgres/c5a-platform-operations-runtime.sql) and both run later in the same deploy pass,
-- so flipping the owner here cascades seed_reference_catalog_snapshot()/its be_organizations AFTER
-- trigger and the start_provisioned_organization_trial() EXECUTE grant onto app_owner automatically
-- -- no edits needed in either sibling file. Proved read-only against TEST inside BEGIN;...;ROLLBACK
-- (never committed): the full per-write chain passes under FORCE after this reassignment plus the
-- three narrow grants below.

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
DROP FUNCTION IF EXISTS app.start_provisioned_organization_trial();
DROP FUNCTION IF EXISTS app.provision_specialist_owner(uuid);
DROP FUNCTION IF EXISTS app.current_provisioned_owner_organization();
\else
SELECT (
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient')
  AND EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app')
  AND to_regclass('public.specialist_signup_intents') IS NOT NULL
  AND to_regclass('public.platform_users') IS NOT NULL
  AND to_regclass('public.be_organizations') IS NOT NULL
  AND to_regclass('public.be_organization_members') IS NOT NULL
  AND to_regclass('public.be_specialists') IS NOT NULL
  AND to_regclass('public.organization_slug_claims') IS NOT NULL
  AND to_regclass('public.clinic_public_directory_entries') IS NOT NULL
  AND to_regclass('public.saas_tariffs') IS NOT NULL
  AND to_regclass('public.saas_trial_policy') IS NOT NULL
  AND to_regclass('public.saas_registration_tariff_policy') IS NOT NULL
  AND to_regclass('public.saas_organization_trials') IS NOT NULL
  AND to_regclass('public.reference_catalog_baselines') IS NOT NULL
  AND to_regprocedure('app.seed_reference_catalog_snapshot(uuid)') IS NOT NULL
  AND to_regprocedure('app.require_staff_security_self_user_id()') IS NOT NULL
  AND has_function_privilege(
    :'specialist_owner_provisioning_owner',
    'app.require_staff_security_self_user_id()',
    'EXECUTE'
  )
  AND EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'app_owner'
      AND rolcanlogin = false
      AND rolbypassrls = true
  )
)::int AS specialist_owner_provisioning_preflight_ok \gset

\if :specialist_owner_provisioning_preflight_ok
\else
\echo 'FATAL: prerequisites missing -- app_patient, app_owner (NOLOGIN+BYPASSRLS), schema app, signup/users/orgs/members and reference catalog baseline must all exist.'
SELECT 1 / 0 AS specialist_owner_provisioning_abort;
\endif

-- Retire the former caller-targeted overload before exposing the self-scoped replacement.
DROP FUNCTION IF EXISTS app.provision_specialist_owner(uuid, uuid);
DROP FUNCTION IF EXISTS app.current_provisioned_owner_organization();

CREATE FUNCTION app.current_provisioned_owner_organization()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT member.organization_id
  FROM public.be_organization_members AS member
  INNER JOIN public.be_organizations AS organization
    ON organization.id = member.organization_id
   AND organization.is_active
  WHERE member.platform_user_id = app.current_patient_user_id()
    AND member.role = 'owner'
    AND member.status = 'active'
  ORDER BY member.created_at DESC
  LIMIT 1
$function$;

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
  v_specialist_id uuid;
  v_unique_constraint_name text;
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

    IF NOT FOUND
      OR v_intent.provisioned_organization_id IS NULL
      OR v_intent.provisioned_membership_id IS NULL THEN
      RETURN QUERY SELECT false, 'specialist_signup_intent_not_found'::text, NULL::uuid, NULL::uuid, NULL::uuid;
      RETURN;
    END IF;

    -- Already provisioned: re-running stays idempotent. A pre-fix intent can still carry a NULL
    -- provisioned_specialist_id (the exact dead-workspace defect this function now closes) --
    -- fall through to the shared specialist-backfill block below instead of returning it bare.
    v_organization_id := v_intent.provisioned_organization_id;
    v_membership_id := v_intent.provisioned_membership_id;
    v_specialist_id := v_intent.provisioned_specialist_id;
  END IF;

  IF v_organization_id IS NULL THEN
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

    -- Pre-cutover intents can still carry no slug. Keep the established recovery code so confirm
    -- asks for the address without consuming the still-valid e-mail challenge.
    IF v_intent.organization_slug IS NULL THEN
      RETURN QUERY SELECT false, 'specialist_signup_slug_reservation_not_found'::text, NULL::uuid, NULL::uuid, NULL::uuid;
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

    UPDATE public.platform_users AS u
    SET role = 'doctor',
        display_name = v_intent.specialist_full_name,
        updated_at = now()
    WHERE u.id = v_user.id;

    v_organization_id := gen_random_uuid();

    -- The global UNIQUE(slug) index is the only ownership arbiter. The organization insert and its
    -- current claim share a subtransaction: if another registration commits this slug first, the
    -- losing provisional organization is rolled back before returning the stable public error.
    BEGIN
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

      INSERT INTO public.organization_slug_claims (
        slug,
        kind,
        organization_id,
        created_by_platform_user_id,
        created_at,
        updated_at
      )
      VALUES (
        lower(v_intent.organization_slug),
        'current',
        v_organization_id,
        v_user.id,
        now(),
        now()
      );
    EXCEPTION
      WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_unique_constraint_name = CONSTRAINT_NAME;
        IF v_unique_constraint_name = 'uq_organization_slug_claims_slug' THEN
          RETURN QUERY SELECT false, 'slug_unavailable'::text, NULL::uuid, NULL::uuid, NULL::uuid;
          RETURN;
        END IF;
        RAISE;
    END;

    INSERT INTO public.clinic_public_directory_entries (
      organization_id,
      slug,
      display_name,
      is_published,
      published_at,
      created_at,
      updated_at
    )
    VALUES (
      v_organization_id,
      lower(v_intent.organization_slug),
      v_intent.organization_title,
      true,
      now(),
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

    -- Narrow platform-owned capability derives this exact organization from the signed principal
    -- and fresh owner membership. It updates commercial state and creates the trial in this same
    -- transaction; any failure rolls the complete provisioning command back.
    PERFORM app.start_provisioned_organization_trial();

    -- Same SECURITY DEFINER transaction: the new organization is not observable without its own
    -- independent catalog snapshot. The helper only inserts the current repo-managed baseline.
    PERFORM app.seed_reference_catalog_snapshot(v_organization_id);
  END IF;

  -- Bind the registering person's own bookable specialist in the SAME transaction as the
  -- organization/membership: a membership left with specialist_id NULL makes
  -- resolveLaunchCapabilities() withhold clinical.workspace forever (owner-reported dead
  -- workspace). Column set mirrors ensureOwnBookableSpecialist()'s identical invited-staff
  -- backfill (pgOrganizationProvisioning.ts). Guarded on v_specialist_id IS NULL so re-running
  -- provisioning for an already-provisioned intent never creates a second specialist.
  IF v_specialist_id IS NULL THEN
    INSERT INTO public.be_specialists (
      organization_id,
      full_name,
      is_active,
      sort_order,
      created_at,
      updated_at
    )
    VALUES (
      v_organization_id,
      v_intent.specialist_full_name,
      true,
      0,
      now(),
      now()
    )
    RETURNING id INTO v_specialist_id;

    UPDATE public.be_organization_members
    SET specialist_id = v_specialist_id,
        updated_at = now()
    WHERE id = v_membership_id
      AND specialist_id IS NULL;
  END IF;

  UPDATE public.specialist_signup_intents AS i
  SET status = 'provisioned',
      provisioned_organization_id = v_organization_id,
      provisioned_membership_id = v_membership_id,
      provisioned_specialist_id = v_specialist_id,
      provisioned_at = now()
  WHERE i.id = v_intent.id;

  RETURN QUERY SELECT true, NULL::text, v_organization_id, v_specialist_id, v_membership_id;
END
$$;

COMMENT ON FUNCTION app.provision_specialist_owner(uuid) IS
  'Signed identity-self specialist owner provisioning. Atomically inserts the signup slug as current under the global UNIQUE index, publishes the directory row, creates the organization and binds the registering person''s own specialist; retry is idempotent.';

-- Owner-exempt trusted seam: app_owner is NOLOGIN + BYPASSRLS with zero SET ROLE members (asserted
-- in the preflight above). provision_specialist_owner AND current_provisioned_owner_organization()
-- both move to app_owner: the latter SELECTs public.be_organizations (FORCE RLS, only
-- app_platform_settings/app_staff-scoped policies -- the migrator matches none of them, so under
-- its old ownership this SELECT silently returned zero rows and start_provisioned_organization_trial
-- raised provisioned_owner_organization_required on every real call; proved read-only against TEST
-- inside BEGIN;...;ROLLBACK, never committed). It stays called only from
-- app.start_provisioned_organization_trial() (owned by app_platform_settings, already granted
-- EXECUTE on it directly in deploy/postgres/c5a-platform-operations-runtime.sql) -- that grant is a
-- plain GRANT, unaffected by this reassignment. seed_reference_catalog_snapshot() is re-owned
-- dynamically by deploy/postgres/reference-catalog-rls.sql (its :"provisioning_owner" resolves from
-- provision_specialist_owner's current owner and that overlay runs later in the same deploy pass),
-- which also carries the matching reference_categories/reference_items table grants -- so it ends
-- the deploy owned by app_owner too, without any edit in this file.
ALTER FUNCTION app.provision_specialist_owner(uuid) OWNER TO app_owner;
ALTER FUNCTION app.current_provisioned_owner_organization() OWNER TO app_owner;
ALTER FUNCTION app.seed_reference_catalog_snapshot(uuid) OWNER TO :specialist_owner_provisioning_owner_ident;
GRANT SELECT ON TABLE public.reference_catalog_baselines TO :specialist_owner_provisioning_owner_ident;

REVOKE ALL ON FUNCTION app.provision_specialist_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.current_provisioned_owner_organization() FROM PUBLIC, app_staff, app_patient;
REVOKE ALL ON FUNCTION app.seed_reference_catalog_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.provision_specialist_owner(uuid) TO app_patient;

-- app_owner now runs both reassigned function bodies. It needs EXECUTE on the one sibling helper
-- provision_specialist_owner calls directly (app.require_staff_security_self_user_id(); the other
-- two direct calls -- start_provisioned_organization_trial() and seed_reference_catalog_snapshot()
-- -- resolve their own EXECUTE/ownership onto app_owner dynamically from the two sibling overlays
-- noted above) and base table ACL on the rows either function body reads/writes directly (BYPASSRLS
-- clears FORCE RLS itself, but table-level GRANT is a separate, still-required gate -- confirmed:
-- app_owner already has pre-existing SELECT on public.be_organizations and
-- public.be_organization_members from unrelated features, sufficient for
-- current_provisioned_owner_organization()'s read; only the four grants below were missing).
-- be_specialists is FORCE-RLS with a staff+org policy (see organization-member-invites-rls.sql);
-- app_owner clears it via BYPASSRLS (asserted in the preflight above), so only the table-level
-- INSERT grant is needed for the same-transaction specialist bind above.
GRANT EXECUTE ON FUNCTION app.require_staff_security_self_user_id() TO app_owner;
GRANT INSERT ON TABLE public.be_organizations TO app_owner;
GRANT SELECT, UPDATE ON TABLE public.specialist_signup_intents TO app_owner;
GRANT INSERT ON TABLE public.be_specialists TO app_owner;
GRANT SELECT, INSERT ON TABLE public.organization_slug_claims TO app_owner;
GRANT INSERT ON TABLE public.clinic_public_directory_entries TO app_owner;

SELECT 1 / (
  EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'app.provision_specialist_owner(uuid)'::regprocedure
      AND pg_get_userbyid(p.proowner) = 'app_owner'
  )
  AND EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'app.current_provisioned_owner_organization()'::regprocedure
      AND pg_get_userbyid(p.proowner) = 'app_owner'
  )
  AND has_function_privilege('app_owner', 'app.require_staff_security_self_user_id()', 'EXECUTE')
  AND has_table_privilege('app_owner', 'public.be_organizations', 'INSERT')
  AND has_table_privilege('app_owner', 'public.be_organizations', 'SELECT')
  AND has_table_privilege('app_owner', 'public.be_organization_members', 'SELECT')
  AND has_table_privilege('app_owner', 'public.specialist_signup_intents', 'SELECT')
  AND has_table_privilege('app_owner', 'public.specialist_signup_intents', 'UPDATE')
  AND has_table_privilege('app_owner', 'public.be_specialists', 'INSERT')
  AND has_table_privilege('app_owner', 'public.organization_slug_claims', 'SELECT')
  AND has_table_privilege('app_owner', 'public.organization_slug_claims', 'INSERT')
  AND NOT has_table_privilege('app_owner', 'public.organization_slug_claims', 'UPDATE')
  AND has_table_privilege('app_owner', 'public.clinic_public_directory_entries', 'INSERT')
)::int AS specialist_owner_provisioning_seam_ready;
\endif

COMMIT;
