-- R1 clinic member invites RLS/grants overlay.
--
-- UP:
--   psql <approved-test-or-host-connection> -v ON_ERROR_STOP=1 -f deploy/postgres/organization-member-invites-rls.sql
--
-- DOWN / rollback:
--   psql <approved-test-or-host-connection> -v ON_ERROR_STOP=1 -v organization_member_invites_down=1 -f deploy/postgres/organization-member-invites-rls.sql
--
-- This file intentionally contains no connection strings. Operators provide the approved TEST/prod
-- connection context. It does not grant BYPASSRLS and does not weaken existing tables.

\set ON_ERROR_STOP on
\pset pager off

\if :{?organization_member_invites_down}
\else
\set organization_member_invites_down 0
\endif

SELECT 1 / (:'organization_member_invites_down' IN ('0', '1'))::int
  AS organization_member_invites_down_is_valid;

SELECT pg_get_userbyid(c.relowner) AS organization_member_invites_owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'organization_member_invites'
  AND c.relkind IN ('r', 'p') \gset

SELECT quote_ident(:'organization_member_invites_owner') AS organization_member_invites_owner_ident \gset

BEGIN;

\if :organization_member_invites_down
DROP FUNCTION IF EXISTS app.email_auth_find_latest_pending_email_challenge_for_user(uuid, bigint);
DROP FUNCTION IF EXISTS app.email_auth_find_latest_email_challenge_for_user(uuid, bigint);
DROP FUNCTION IF EXISTS app.email_auth_find_email_challenge_for_consume(uuid, uuid);
DROP FUNCTION IF EXISTS app.email_auth_verify_user_email(uuid, text);
DROP FUNCTION IF EXISTS app.email_auth_find_email_owner_conflict(uuid, text);
DROP FUNCTION IF EXISTS app.email_auth_increment_email_challenge_attempts(uuid);
DROP FUNCTION IF EXISTS app.email_auth_find_email_challenge_for_confirm(uuid, uuid);
DROP FUNCTION IF EXISTS app.email_auth_upsert_email_send_cooldown(uuid, text);
DROP FUNCTION IF EXISTS app.email_auth_delete_email_challenge_by_id(uuid);
-- C-2 step 4: purpose stamp accessor added alongside insert (0249). Not a widened insert
-- signature -- see that migration's header for why.
DROP FUNCTION IF EXISTS app.email_auth_set_email_challenge_purpose(uuid, text);
DROP FUNCTION IF EXISTS app.email_auth_insert_email_challenge(uuid, text, text, bigint);
DROP FUNCTION IF EXISTS app.email_auth_delete_email_challenges_for_user(uuid);
DROP FUNCTION IF EXISTS app.email_auth_find_email_send_cooldown(uuid, text);
DROP FUNCTION IF EXISTS app.email_otp_public_find_email_send_cooldown_by_email(text);
DROP FUNCTION IF EXISTS app.email_otp_public_find_latest_email_challenge_by_email(text, bigint);
DROP FUNCTION IF EXISTS app.email_otp_public_consume_latest_challenge(text, text);
DROP FUNCTION IF EXISTS app.email_otp_public_find_user_by_email(text);
DROP FUNCTION IF EXISTS app.email_otp_public_register_patient(text, text, text, text);
DROP FUNCTION IF EXISTS app.email_otp_public_delete_unverified_registration(uuid);
DROP FUNCTION IF EXISTS app.accept_org_invite(text, uuid, text);
DROP FUNCTION IF EXISTS app.lookup_pending_org_invite(text);

DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."organization_member_invites";
ALTER TABLE "public"."organization_member_invites" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."organization_member_invites" DISABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_staff') THEN
    REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."organization_member_invites" FROM app_staff;
  END IF;
END $$;
\else
SELECT (
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_patient')
  AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner' AND rolbypassrls AND NOT rolcanlogin)
  AND EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app')
  AND to_regclass('public.organization_member_invites') IS NOT NULL
  AND to_regclass('public.be_organizations') IS NOT NULL
  AND to_regclass('public.platform_users') IS NOT NULL
  AND to_regclass('public.email_challenges') IS NOT NULL
  AND to_regclass('public.email_send_cooldowns') IS NOT NULL
  AND to_regclass('public.be_organization_members') IS NOT NULL
  AND to_regclass('public.be_specialists') IS NOT NULL
)::int AS organization_member_invites_accept_preflight_ok \gset

\if :organization_member_invites_accept_preflight_ok
\else
\echo 'FATAL: prerequisites missing -- app_patient, BYPASSRLS NOLOGIN app_owner, schema app, invites/orgs/users/members/specialists tables must all exist.'
SELECT 1 / 0 AS organization_member_invites_accept_abort;
\endif

ALTER TABLE "public"."organization_member_invites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."organization_member_invites" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."organization_member_invites";
-- Direct runtime table access is staff+organization scoped and therefore fails closed without a
-- protected principal. Pre-session lookup/accept is exposed only through the narrow SECURITY
-- DEFINER functions below, owned by the existing NOLOGIN/BYPASSRLS app_owner security boundary.
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."organization_member_invites"
  FOR ALL
  USING (
    app.is_staff()
    AND app.current_org_id() IS NOT NULL
    AND "organization_id" = app.current_org_id()
  )
  WITH CHECK (
    app.is_staff()
    AND app.current_org_id() IS NOT NULL
    AND "organization_id" = app.current_org_id()
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_staff') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."organization_member_invites" TO app_staff;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO app_owner;
GRANT SELECT, UPDATE ON TABLE public.organization_member_invites TO app_owner;
GRANT SELECT ON TABLE public.be_organizations TO app_owner;
GRANT SELECT, UPDATE ON TABLE public.platform_users TO app_owner;
GRANT SELECT, INSERT, UPDATE ON TABLE public.be_organization_members TO app_owner;
-- C4A correction: accept_org_invite re-checks clinic_team entitlement/seat capacity atomically,
-- so it needs read access to the tariff catalog and per-org overrides too.
GRANT SELECT ON TABLE public.saas_tariffs TO app_owner;
GRANT SELECT ON TABLE public.saas_org_entitlement_overrides TO app_owner;
-- app.email_otp_public_consume_latest_challenge(text, text) (defined below, owned by app_owner)
-- SELECTs/UPDATEs/DELETEs public.email_challenges directly. This overlay is the canonical,
-- every-deploy-reapplied home for that function's full lifecycle (owner, EXECUTE grants); the
-- table grant belongs alongside it, not only in the one-shot migration
-- apps/webapp/db/drizzle-migrations/0232_email_otp_atomic_consume.sql (which never re-runs and
-- never carried this grant -- confirmed missing from every deploy/postgres/*.sql; the only place it
-- existed was a live hotfix applied directly on TEST, which a fresh deploy/prod cutover would lose,
-- breaking every client email-code login). app_owner is BYPASSRLS (clears any RLS on this table),
-- but BYPASSRLS does not substitute for the base table GRANT.
GRANT SELECT, UPDATE, DELETE ON TABLE public.email_challenges TO app_owner;

CREATE OR REPLACE FUNCTION app.lookup_pending_org_invite(p_token_hash text)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  invited_email text,
  invited_role text,
  status text,
  expires_at timestamptz,
  created_by_platform_user_id uuid,
  accepted_by_platform_user_id uuid,
  accepted_membership_id uuid,
  created_at timestamptz,
  accepted_at timestamptz,
  organization_title text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT
    i.id,
    i.organization_id,
    i.invited_email,
    i.invited_role,
    i.status,
    i.expires_at,
    i.created_by_platform_user_id,
    i.accepted_by_platform_user_id,
    i.accepted_membership_id,
    i.created_at,
    i.accepted_at,
    o.title AS organization_title
  FROM public.organization_member_invites AS i
  LEFT JOIN public.be_organizations AS o ON o.id = i.organization_id
  WHERE i.token_hash = p_token_hash
  LIMIT 1
$$;

COMMENT ON FUNCTION app.lookup_pending_org_invite(text) IS
  'Narrow invite-token lookup for bootstrap accept flow. EXECUTE only for app_patient; no table grants to nonstaff roles.';

CREATE OR REPLACE FUNCTION app.accept_org_invite(
  p_token_hash text,
  p_platform_user_id uuid,
  p_expected_email text
)
RETURNS TABLE (
  ok boolean,
  code text,
  organization_id uuid,
  membership_id uuid,
  platform_user_id uuid,
  specialist_id uuid,
  role text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  v_invite record;
  v_user record;
  v_expected_email text := lower(btrim(p_expected_email));
  v_display_name text;
  v_specialist_id uuid;
  v_membership_id uuid;
  v_membership_specialist_id uuid;
  v_clinic_team_enabled boolean;
  v_seat_limit integer;
  v_seat_used integer;
  v_seat_overage_price_minor integer;
  v_invite_organization_id uuid;
BEGIN
  -- Resolve the organization first, then acquire the same organization-wide lock used by invite
  -- creation. The authoritative row is selected FOR UPDATE only after the advisory lock so create,
  -- resend and accept paths have one lock order and cannot deadlock or oversubscribe each other.
  SELECT i.organization_id
  INTO v_invite_organization_id
  FROM public.organization_member_invites AS i
  WHERE i.token_hash = p_token_hash
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'invalid_token'::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('clinic_invite_seats:' || v_invite_organization_id::text, 0)
  );

  SELECT i.*
  INTO v_invite
  FROM public.organization_member_invites AS i
  WHERE i.token_hash = p_token_hash
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'invalid_token'::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  IF v_invite.status <> 'pending' THEN
    RETURN QUERY SELECT false, 'reused_token'::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  IF v_invite.expires_at <= now() THEN
    UPDATE public.organization_member_invites AS i
    SET status = 'expired'
    WHERE i.id = v_invite.id
      AND i.status = 'pending';

    RETURN QUERY SELECT false, 'expired_token'::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  IF v_invite.invited_email <> v_expected_email THEN
    RETURN QUERY SELECT false, 'email_mismatch'::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  SELECT u.id, u.display_name, u.email_normalized
  INTO v_user
  FROM public.platform_users AS u
  WHERE u.id = p_platform_user_id
    AND u.merged_into_id IS NULL
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND OR v_user.email_normalized IS DISTINCT FROM v_invite.invited_email THEN
    RETURN QUERY SELECT false, 'email_mismatch'::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  -- C4A correction: fail closed and atomic against the CURRENT clinic_team entitlement, not the
  -- entitlement at invite-creation time. An invite issued before a downgrade/OFF must not activate
  -- ANY clinic-team membership growth — this applies to every invited role, including `admin`,
  -- which never consumes a numeric seat but still grows the paid clinic-team capability. Mirrors
  -- resolveClinicSeatLimit's override > tariff precedence. `clinic_team` is a numeric seats
  -- mechanic: the tariff includes it by configuring included_seats, not by writing the legacy
  -- mechanics JSON. This check is duplicated here because it must run inside this same FOR
  -- UPDATE-locked transaction to be atomic. Checked, and denied, before any
  -- platform_users/membership/invite mutation below.
  SELECT COALESCE(
    (SELECT eo.enabled FROM public.saas_org_entitlement_overrides AS eo
     WHERE eo.organization_id = v_invite.organization_id AND eo.mechanic = 'clinic_team'),
    (SELECT t.included_seats IS NOT NULL
     FROM public.be_organizations AS o
     JOIN public.saas_tariffs AS t ON t.id = o.tariff_id
     WHERE o.id = v_invite.organization_id),
    false
  ) INTO v_clinic_team_enabled;

  IF NOT v_clinic_team_enabled THEN
    RETURN QUERY SELECT false, 'entitlement_disabled'::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  -- Numeric seat CAPACITY remains doctor-only: an `admin` invite never consumes or is blocked by
  -- seat count, only by the entitlement gate above. Mirrors resolveClinicSeatLimit's override >
  -- tariff precedence (src/modules/org-entitlements/service.ts). `i.id <>
  -- v_invite.id` excludes this invite's own prior pending reservation from the pending count:
  -- accepting does not add a NEW reservation on top of the one already held since it was created.
  IF v_invite.invited_role = 'doctor' THEN
    SELECT COALESCE(
      (SELECT eo.seat_limit_override FROM public.saas_org_entitlement_overrides AS eo
       WHERE eo.organization_id = v_invite.organization_id AND eo.mechanic = 'clinic_team'),
      (SELECT t.included_seats
       FROM public.be_organizations AS o
       JOIN LATERAL app.saas_billing_effective_tariff(o.id, o.tariff_id) AS t ON true
       WHERE o.id = v_invite.organization_id)
    ) + COALESCE((SELECT s.paid_additional_seats FROM public.saas_billing_subscriptions AS s
      WHERE s.organization_id = v_invite.organization_id AND s.source = 'paid_subscription'), 0)
    INTO v_seat_limit;

    SELECT
      (SELECT COUNT(*) FROM public.be_organization_members AS m
       WHERE m.organization_id = v_invite.organization_id AND m.status = 'active' AND m.specialist_id IS NOT NULL)
      +
      (SELECT COUNT(*) FROM public.organization_member_invites AS i
       WHERE i.organization_id = v_invite.organization_id AND i.status = 'pending' AND i.expires_at > now()
         AND i.invited_role = 'doctor' AND i.id <> v_invite.id)
      +
      (SELECT COUNT(*) FROM public.organization_member_invites AS i
       JOIN public.be_organization_members AS m ON m.id = i.accepted_membership_id
       WHERE i.organization_id = v_invite.organization_id AND i.status = 'accepted'
         AND i.invited_role = 'doctor' AND m.status = 'active' AND m.specialist_id IS NULL)
    INTO v_seat_used;

    IF v_seat_limit IS NULL OR v_seat_used >= v_seat_limit THEN
      RETURN QUERY SELECT false, 'seat_limit_reached'::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid, NULL::text;
      RETURN;
    END IF;
  END IF;

  v_display_name := COALESCE(NULLIF(btrim(v_user.display_name), ''), split_part(v_invite.invited_email, '@', 1), v_invite.invited_email);

  UPDATE public.platform_users AS u
  SET role = 'doctor',
      email = COALESCE(u.email, v_invite.invited_email),
      email_normalized = COALESCE(u.email_normalized, v_invite.invited_email),
      email_verified_at = COALESCE(u.email_verified_at, now()),
      updated_at = now()
  WHERE u.id = v_user.id;

  -- R1: create the membership only. Auto-provisioning a be_specialists profile is DEFERRED:
  -- be_specialists is FORCE-RLS with a staff+org policy (app.is_staff() AND organization_id =
  -- app.current_org_id(), where current_org_id() reads app.principal_context by backend_pid). A
  -- pre-session SECURITY DEFINER cannot satisfy that without a staff principal context — the same
  -- pre-session staff-provisioning gap that specialist-signup provisioning has under enforce. The
  -- invited doctor becomes an active member now; their bookable specialist profile is provisioned
  -- later from a proper staff context (clinic member management, R3 / signup-provisioning fix).
  v_specialist_id := NULL;

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
    v_invite.organization_id,
    v_user.id,
    v_invite.invited_role,
    v_specialist_id,
    'active',
    now(),
    now()
  )
  ON CONFLICT (organization_id, platform_user_id)
  DO UPDATE SET
    role = EXCLUDED.role,
    specialist_id = EXCLUDED.specialist_id,
    status = 'active',
    updated_at = now()
  RETURNING id, specialist_id INTO v_membership_id, v_membership_specialist_id;

  UPDATE public.organization_member_invites AS i
  SET status = 'accepted',
      accepted_by_platform_user_id = v_user.id,
      accepted_membership_id = v_membership_id,
      accepted_at = now()
  WHERE i.id = v_invite.id;

  RETURN QUERY SELECT
    true,
    NULL::text,
    v_invite.organization_id,
    v_membership_id,
    v_user.id,
    v_membership_specialist_id,
    v_invite.invited_role;
END
$$;

COMMENT ON FUNCTION app.accept_org_invite(text, uuid, text) IS
  'Narrow SECURITY DEFINER accept operation for organization member invites. Performs token lock, email/user check, current clinic_team entitlement re-check for ALL invited roles plus seat capacity re-check for doctor invites (fail-closed, leaves the invite pending on denial), membership activation, and single-use invite update without granting app_patient table writes. Specialist provisioning is deferred to the first valid staff session.';

ALTER FUNCTION app.lookup_pending_org_invite(text) OWNER TO app_owner;
ALTER FUNCTION app.accept_org_invite(text, uuid, text) OWNER TO app_owner;

REVOKE ALL ON FUNCTION app.lookup_pending_org_invite(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.accept_org_invite(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lookup_pending_org_invite(text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.accept_org_invite(text, uuid, text) TO app_patient;

CREATE OR REPLACE FUNCTION app.email_otp_public_find_user_by_email(p_email_norm text)
RETURNS TABLE (user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  WITH RECURSIVE chain AS (
    SELECT u.id, u.merged_into_id, 0 AS depth, ARRAY[u.id] AS path
    FROM public.platform_users AS u
    WHERE u.email_normalized = lower(btrim(p_email_norm))
    UNION ALL
    SELECT u.id, u.merged_into_id, chain.depth + 1, chain.path || u.id
    FROM public.platform_users AS u
    JOIN chain ON u.id = chain.merged_into_id
    WHERE chain.depth < 5 AND NOT u.id = ANY(chain.path)
  )
  SELECT chain.id FROM chain
  ORDER BY (chain.merged_into_id IS NULL) DESC, chain.depth DESC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app.email_otp_public_register_patient(
  p_email_norm text, p_last_name text, p_first_name text, p_patronymic text
)
RETURNS TABLE (ok boolean, code text, user_id uuid, was_created boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  v_email_norm text := lower(btrim(p_email_norm));
  v_last_name text := NULLIF(btrim(p_last_name), '');
  v_first_name text := NULLIF(btrim(p_first_name), '');
  v_patronymic text := NULLIF(btrim(p_patronymic), '');
  v_existing public.platform_users%ROWTYPE;
  v_user_id uuid;
BEGIN
  IF v_email_norm = '' THEN RETURN QUERY SELECT false, 'invalid_email'::text, NULL::uuid, false; RETURN; END IF;
  IF v_last_name IS NULL OR v_first_name IS NULL THEN RETURN QUERY SELECT false, 'invalid_fio'::text, NULL::uuid, false; RETURN; END IF;
  SELECT u.* INTO v_existing FROM public.platform_users AS u WHERE u.email_normalized = v_email_norm AND u.merged_into_id IS NULL LIMIT 1;
  IF FOUND THEN
    IF v_existing.email_verified_at IS NULL
      AND v_existing.role = 'client'
      AND v_existing.last_name IS NOT NULL
      AND v_existing.first_name IS NOT NULL THEN
      RETURN QUERY SELECT true, 'pending_registration'::text, v_existing.id, false;
    ELSE
      RETURN QUERY SELECT false, 'duplicate_email'::text, NULL::uuid, false;
    END IF;
    RETURN;
  END IF;
  INSERT INTO public.platform_users (display_name, last_name, first_name, patronymic, email, email_normalized, role)
  VALUES (concat_ws(' ', v_last_name, v_first_name, v_patronymic), v_last_name, v_first_name, v_patronymic, v_email_norm, v_email_norm, 'client')
  ON CONFLICT (email_normalized) WHERE merged_into_id IS NULL AND email_normalized IS NOT NULL DO NOTHING
  RETURNING id INTO v_user_id;
  IF v_user_id IS NULL THEN RETURN QUERY SELECT false, 'duplicate_email'::text, NULL::uuid, false; RETURN; END IF;
  RETURN QUERY SELECT true, NULL::text, v_user_id, true;
END
$$;

CREATE OR REPLACE FUNCTION app.email_otp_public_delete_unverified_registration(p_user_id uuid)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  DELETE FROM public.platform_users
  WHERE id = p_user_id AND role = 'client' AND merged_into_id IS NULL AND email_verified_at IS NULL
$$;

-- Invite acceptance still needs this compatibility bootstrap operation. Public
-- email OTP login itself calls the lookup-only accessor above.
CREATE OR REPLACE FUNCTION app.email_otp_public_find_or_create_user(p_email_norm text)
RETURNS TABLE (user_id uuid, was_created boolean)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_existing_id uuid;
  v_merged_id uuid;
  v_canonical_id uuid;
  v_inserted_id uuid;
  v_display_name text := COALESCE(NULLIF(split_part(p_email_norm, '@', 1), ''), p_email_norm);
BEGIN
  SELECT u.id
  INTO v_existing_id
  FROM public.platform_users AS u
  WHERE u.email_normalized = p_email_norm
    AND u.merged_into_id IS NULL
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN QUERY SELECT v_existing_id, false;
    RETURN;
  END IF;

  SELECT u.id
  INTO v_merged_id
  FROM public.platform_users AS u
  WHERE u.email_normalized = p_email_norm
    AND u.merged_into_id IS NOT NULL
  ORDER BY u.created_at ASC
  LIMIT 1;

  IF v_merged_id IS NOT NULL THEN
    WITH RECURSIVE chain AS (
      SELECT u.id, u.merged_into_id, 0 AS depth, ARRAY[u.id] AS path
      FROM public.platform_users AS u
      WHERE u.id = v_merged_id
      UNION ALL
      SELECT u.id, u.merged_into_id, c.depth + 1, c.path || u.id
      FROM public.platform_users AS u
      JOIN chain AS c ON u.id = c.merged_into_id
      WHERE c.depth < 5
        AND NOT u.id = ANY(c.path)
    )
    SELECT c.id
    INTO v_canonical_id
    FROM chain AS c
    ORDER BY (c.merged_into_id IS NULL) DESC, c.depth DESC
    LIMIT 1;

    IF v_canonical_id IS NOT NULL THEN
      RETURN QUERY SELECT v_canonical_id, false;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.platform_users (email, email_normalized, display_name, role)
  VALUES (p_email_norm, p_email_norm, v_display_name, 'client')
  ON CONFLICT (email_normalized) WHERE merged_into_id IS NULL AND email_normalized IS NOT NULL DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NOT NULL THEN
    RETURN QUERY SELECT v_inserted_id, true;
    RETURN;
  END IF;

  SELECT u.id
  INTO v_existing_id
  FROM public.platform_users AS u
  WHERE u.email_normalized = p_email_norm
    AND u.merged_into_id IS NULL
  LIMIT 1;

  IF v_existing_id IS NULL THEN
    RAISE EXCEPTION 'email_otp_public_find_or_create_user_failed';
  END IF;

  RETURN QUERY SELECT v_existing_id, false;
END
$$;

CREATE OR REPLACE FUNCTION app.email_otp_public_find_latest_email_challenge_by_email(
  p_email_norm text,
  p_now_sec bigint
)
RETURNS TABLE (id uuid, user_id uuid, code_hash text, expires_at bigint, attempts integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT c.id, c.user_id, c.code_hash, c.expires_at, c.attempts::integer
  FROM public.email_challenges AS c
  WHERE c.email = p_email_norm
    AND c.expires_at > p_now_sec
  ORDER BY c.created_at DESC
  LIMIT 1
$$;

-- Keep this runtime overlay semantically aligned with migration 0232/0249. The caller
-- passes only the application-side OTP hash; public challenge table access remains closed.
CREATE OR REPLACE FUNCTION app.email_otp_public_consume_latest_challenge(
  p_email_normalized text,
  p_code_hash text
)
RETURNS TABLE (ok boolean, code text, user_id uuid, retry_after_seconds integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  v_email_normalized text := lower(btrim(p_email_normalized));
  v_now_sec bigint := extract(epoch FROM clock_timestamp())::bigint;
  v_challenge public.email_challenges%ROWTYPE;
  v_latest_challenge_id uuid;
  v_target_user public.platform_users%ROWTYPE;
  v_conflict_user_id uuid;
  v_next_attempts integer;
  -- C-2 step 4 (0249): the three purposes that legitimately share this one anonymous confirm
  -- engine. See 0249's header for the residual login-vs-clinic_invite gap this does NOT close.
  v_allowed_purposes CONSTANT text[] := ARRAY['login', 'public_registration', 'clinic_invite'];
BEGIN
  IF v_email_normalized = '' THEN
    RETURN QUERY SELECT false, 'expired_code'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;
  IF p_code_hash IS NULL OR btrim(p_code_hash) = '' THEN
    RETURN QUERY SELECT false, 'invalid_code'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;

  PERFORM 1
  FROM public.platform_users AS candidate
  WHERE candidate.id IN (
    SELECT challenge.user_id
    FROM public.email_challenges AS challenge
    WHERE challenge.email = v_email_normalized
  )
  ORDER BY candidate.id
  FOR UPDATE;

  LOOP
    SELECT challenge.*
    INTO v_challenge
    FROM public.email_challenges AS challenge
    WHERE challenge.email = v_email_normalized
    ORDER BY challenge.created_at DESC, challenge.id DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN QUERY SELECT false, 'expired_code'::text, NULL::uuid, NULL::integer;
      RETURN;
    END IF;

    SELECT challenge.id
    INTO v_latest_challenge_id
    FROM public.email_challenges AS challenge
    WHERE challenge.email = v_email_normalized
    ORDER BY challenge.created_at DESC, challenge.id DESC
    LIMIT 1;
    EXIT WHEN v_latest_challenge_id = v_challenge.id;
  END LOOP;

  SELECT platform_user.*
  INTO v_target_user
  FROM public.platform_users AS platform_user
  WHERE platform_user.id = v_challenge.user_id
  FOR UPDATE;

  IF NOT FOUND OR v_target_user.merged_into_id IS NOT NULL THEN
    DELETE FROM public.email_challenges WHERE id = v_challenge.id;
    RETURN QUERY SELECT false, 'email_conflict'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;
  IF v_challenge.expires_at <= v_now_sec THEN
    DELETE FROM public.email_challenges WHERE id = v_challenge.id;
    RETURN QUERY SELECT false, 'expired_code'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;
  IF v_challenge.attempts >= 5 THEN
    DELETE FROM public.email_challenges WHERE id = v_challenge.id;
    RETURN QUERY SELECT false, 'too_many_attempts'::text, NULL::uuid, 600;
    RETURN;
  END IF;
  -- C-2 step 4 (OWASP ASVS V6.6.2 / NIST SP 800-63B §5.1.3): a purpose mismatch is folded into the
  -- EXACT SAME branch as a wrong code hash -- same attempts increment, same result, same shape
  -- (ASVS 6.3.8 uniform response). NULL purpose (pre-migration rows) is grandfathered in.
  IF v_challenge.code_hash <> p_code_hash
     OR NOT (v_challenge.purpose IS NULL OR v_challenge.purpose = ANY(v_allowed_purposes))
  THEN
    UPDATE public.email_challenges
    SET attempts = attempts + 1
    WHERE id = v_challenge.id
    RETURNING attempts::integer INTO v_next_attempts;
    IF v_next_attempts >= 5 THEN
      DELETE FROM public.email_challenges WHERE id = v_challenge.id;
      RETURN QUERY SELECT false, 'too_many_attempts'::text, NULL::uuid, 600;
      RETURN;
    END IF;
    RETURN QUERY SELECT false, 'invalid_code'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;

  SELECT conflict.id
  INTO v_conflict_user_id
  FROM public.platform_users AS conflict
  WHERE conflict.email_normalized = v_email_normalized
    AND conflict.merged_into_id IS NULL
    AND conflict.id <> v_target_user.id
  ORDER BY conflict.id
  LIMIT 1;
  IF FOUND THEN
    DELETE FROM public.email_challenges WHERE user_id = v_target_user.id;
    RETURN QUERY SELECT false, 'email_conflict'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;

  UPDATE public.platform_users
  SET email = v_email_normalized,
      email_normalized = v_email_normalized,
      email_verified_at = clock_timestamp()
  WHERE id = v_target_user.id;
  DELETE FROM public.email_challenges WHERE user_id = v_target_user.id;
  RETURN QUERY SELECT true, NULL::text, v_target_user.id, NULL::integer;
END
$$;

CREATE OR REPLACE FUNCTION app.email_otp_public_find_email_send_cooldown_by_email(p_email_norm text)
RETURNS TABLE (last_sent_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT c.last_sent_at
  FROM public.email_send_cooldowns AS c
  WHERE c.email_normalized = p_email_norm
  ORDER BY c.last_sent_at DESC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app.email_auth_find_email_send_cooldown(p_user_id uuid, p_email_norm text)
RETURNS TABLE (last_sent_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT c.last_sent_at
  FROM public.email_send_cooldowns AS c
  WHERE c.user_id = p_user_id
    AND c.email_normalized = p_email_norm
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app.email_auth_delete_email_challenges_for_user(p_user_id uuid)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  DELETE FROM public.email_challenges WHERE user_id = p_user_id
$$;

CREATE OR REPLACE FUNCTION app.email_auth_insert_email_challenge(
  p_user_id uuid,
  p_email text,
  p_code_hash text,
  p_expires_at bigint
)
RETURNS uuid
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  INSERT INTO public.email_challenges (user_id, email, code_hash, expires_at, attempts)
  VALUES (p_user_id, p_email, p_code_hash, p_expires_at, 0)
  RETURNING id
$$;

-- C-2 step 4 (0249): minimal, additive purpose-stamp accessor. NOT a widened insert signature --
-- app.email_auth_insert_email_challenge's 4-arg signature is pinned by exact arg-type list across
-- deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql's GRANT/REVOKE lines. Callers insert the
-- challenge exactly as before, then immediately stamp its purpose with this second call.
CREATE OR REPLACE FUNCTION app.email_auth_set_email_challenge_purpose(
  p_challenge_id uuid,
  p_purpose text
)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  UPDATE public.email_challenges SET purpose = p_purpose WHERE id = p_challenge_id
$$;

CREATE OR REPLACE FUNCTION app.email_auth_delete_email_challenge_by_id(p_challenge_id uuid)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  DELETE FROM public.email_challenges WHERE id = p_challenge_id
$$;

CREATE OR REPLACE FUNCTION app.email_auth_upsert_email_send_cooldown(p_user_id uuid, p_email_norm text)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  INSERT INTO public.email_send_cooldowns (user_id, email_normalized, last_sent_at)
  VALUES (p_user_id, p_email_norm, now())
  ON CONFLICT (user_id, email_normalized) DO UPDATE SET last_sent_at = now()
$$;

-- C-2 step 4 (0249): adds `purpose` to the output. Argument signature is unchanged (only the
-- RETURNS TABLE column list grows), so DROP + CREATE (not OR REPLACE, which refuses a return-type
-- change) is used, and no GRANT/REVOKE line anywhere needs to move.
DROP FUNCTION IF EXISTS app.email_auth_find_email_challenge_for_confirm(uuid, uuid);

CREATE FUNCTION app.email_auth_find_email_challenge_for_confirm(
  p_challenge_id uuid,
  p_user_id uuid
)
RETURNS TABLE (id uuid, email text, code_hash text, expires_at bigint, attempts integer, purpose text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT c.id, c.email, c.code_hash, c.expires_at, c.attempts::integer, c.purpose
  FROM public.email_challenges AS c
  WHERE c.id = p_challenge_id
    AND c.user_id = p_user_id
$$;

-- Keep this runtime overlay semantically aligned with migration 0247. The old absolute-set
-- accessor (`SET attempts = p_attempts`, the value computed by the CALLER from an earlier, separate
-- read) is the lost-update bug 0247 fixes: two concurrent wrong-code confirms against the same
-- challenge could both read attempts=N and both write N+1, losing an increment. It is dropped, not
-- left reachable, so a stale caller cannot reintroduce that bug; a fresh TEST provision that runs
-- this overlay after the migration must not resurrect it.
DROP FUNCTION IF EXISTS app.email_auth_update_email_challenge_attempts(uuid, integer);

CREATE OR REPLACE FUNCTION app.email_auth_increment_email_challenge_attempts(
  p_challenge_id uuid
)
RETURNS TABLE (attempts integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
#variable_conflict use_column
BEGIN
  PERFORM 1 FROM public.email_challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.email_challenges
  SET attempts = attempts + 1
  WHERE id = p_challenge_id
  RETURNING public.email_challenges.attempts::integer;
END
$$;

CREATE OR REPLACE FUNCTION app.email_auth_find_email_owner_conflict(p_user_id uuid, p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_users AS u
    WHERE u.id <> p_user_id
      AND u.merged_into_id IS NULL
      AND u.email_normalized = lower(btrim(p_email))
  )
$$;

CREATE OR REPLACE FUNCTION app.email_auth_verify_user_email(p_user_id uuid, p_email text)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  UPDATE public.platform_users
  SET email = p_email,
      email_normalized = lower(btrim(p_email)),
      email_verified_at = now(),
      updated_at = now()
  WHERE id = p_user_id
$$;

DROP FUNCTION IF EXISTS app.email_auth_find_email_challenge_for_consume(uuid, uuid);

CREATE FUNCTION app.email_auth_find_email_challenge_for_consume(
  p_challenge_id uuid,
  p_user_id uuid
)
RETURNS TABLE (id uuid, code_hash text, expires_at bigint, attempts integer, purpose text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT c.id, c.code_hash, c.expires_at, c.attempts::integer, c.purpose
  FROM public.email_challenges AS c
  WHERE c.id = p_challenge_id
    AND c.user_id = p_user_id
$$;

DROP FUNCTION IF EXISTS app.email_auth_find_latest_email_challenge_for_user(uuid, bigint);

CREATE FUNCTION app.email_auth_find_latest_email_challenge_for_user(
  p_user_id uuid,
  p_now_sec bigint
)
RETURNS TABLE (id uuid, code_hash text, expires_at bigint, attempts integer, purpose text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT c.id, c.code_hash, c.expires_at, c.attempts::integer, c.purpose
  FROM public.email_challenges AS c
  WHERE c.user_id = p_user_id
    AND c.expires_at > p_now_sec
  ORDER BY c.created_at DESC
  LIMIT 1
$$;

DROP FUNCTION IF EXISTS app.email_auth_find_latest_pending_email_challenge_for_user(uuid, bigint);

CREATE FUNCTION app.email_auth_find_latest_pending_email_challenge_for_user(
  p_user_id uuid,
  p_now_sec bigint
)
RETURNS TABLE (id uuid, email text, code_hash text, expires_at bigint, attempts integer, purpose text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT c.id, c.email, c.code_hash, c.expires_at, c.attempts::integer, c.purpose
  FROM public.email_challenges AS c
  WHERE c.user_id = p_user_id
    AND c.expires_at > p_now_sec
  ORDER BY c.created_at DESC
  LIMIT 1
$$;

COMMENT ON FUNCTION app.email_otp_public_find_user_by_email(text) IS
  'SECURITY DEFINER lookup for public email OTP login; it never creates platform_users.';
COMMENT ON FUNCTION app.email_otp_public_find_or_create_user(text) IS
  'SECURITY DEFINER invite-acceptance bootstrap accessor; public email OTP login uses lookup-only accessor.';
COMMENT ON FUNCTION app.email_otp_public_register_patient(text, text, text, text) IS
  'SECURITY DEFINER structured public patient registration; derives display_name and never overwrites pending FIO.';
COMMENT ON FUNCTION app.email_otp_public_delete_unverified_registration(uuid) IS
  'SECURITY DEFINER rollback for a newly-created public email OTP patient registration after delivery failure.';
COMMENT ON FUNCTION app.email_otp_public_consume_latest_challenge(text, text) IS
  'Atomic SECURITY DEFINER public email-OTP consume: receives only a code hash, locks principal then latest challenge, verifies/claims email and consumes exactly once.';
COMMENT ON FUNCTION app.email_auth_insert_email_challenge(uuid, text, text, bigint) IS
  'SECURITY DEFINER accessor for email OTP challenge creation under app_patient without email_challenges table grants.';
COMMENT ON FUNCTION app.email_auth_set_email_challenge_purpose(uuid, text) IS
  'C-2 step 4: stamps the purpose an email challenge was minted for, immediately after app.email_auth_insert_email_challenge creates it. A NEW accessor rather than widening insert''s pinned 4-arg signature.';

ALTER FUNCTION app.email_otp_public_find_user_by_email(text) OWNER TO :organization_member_invites_owner_ident;
ALTER FUNCTION app.email_otp_public_find_or_create_user(text) OWNER TO :organization_member_invites_owner_ident;
ALTER FUNCTION app.email_otp_public_register_patient(text, text, text, text) OWNER TO :organization_member_invites_owner_ident;
ALTER FUNCTION app.email_otp_public_delete_unverified_registration(uuid) OWNER TO :organization_member_invites_owner_ident;
ALTER FUNCTION app.email_otp_public_find_latest_email_challenge_by_email(text, bigint) OWNER TO :organization_member_invites_owner_ident;
ALTER FUNCTION app.email_otp_public_consume_latest_challenge(text, text) OWNER TO app_owner;
ALTER FUNCTION app.email_otp_public_find_email_send_cooldown_by_email(text) OWNER TO :organization_member_invites_owner_ident;
ALTER FUNCTION app.email_auth_find_email_send_cooldown(uuid, text) OWNER TO :organization_member_invites_owner_ident;
ALTER FUNCTION app.email_auth_delete_email_challenges_for_user(uuid) OWNER TO :organization_member_invites_owner_ident;
ALTER FUNCTION app.email_auth_insert_email_challenge(uuid, text, text, bigint) OWNER TO :organization_member_invites_owner_ident;
ALTER FUNCTION app.email_auth_set_email_challenge_purpose(uuid, text) OWNER TO :organization_member_invites_owner_ident;
ALTER FUNCTION app.email_auth_delete_email_challenge_by_id(uuid) OWNER TO :organization_member_invites_owner_ident;
ALTER FUNCTION app.email_auth_upsert_email_send_cooldown(uuid, text) OWNER TO :organization_member_invites_owner_ident;
ALTER FUNCTION app.email_auth_find_email_challenge_for_confirm(uuid, uuid) OWNER TO :organization_member_invites_owner_ident;
ALTER FUNCTION app.email_auth_increment_email_challenge_attempts(uuid) OWNER TO :organization_member_invites_owner_ident;
ALTER FUNCTION app.email_auth_find_email_owner_conflict(uuid, text) OWNER TO :organization_member_invites_owner_ident;
ALTER FUNCTION app.email_auth_verify_user_email(uuid, text) OWNER TO :organization_member_invites_owner_ident;
ALTER FUNCTION app.email_auth_find_email_challenge_for_consume(uuid, uuid) OWNER TO :organization_member_invites_owner_ident;
ALTER FUNCTION app.email_auth_find_latest_email_challenge_for_user(uuid, bigint) OWNER TO :organization_member_invites_owner_ident;
ALTER FUNCTION app.email_auth_find_latest_pending_email_challenge_for_user(uuid, bigint) OWNER TO :organization_member_invites_owner_ident;

REVOKE ALL ON FUNCTION app.email_otp_public_find_user_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_otp_public_find_or_create_user(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_otp_public_register_patient(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_otp_public_delete_unverified_registration(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_otp_public_find_latest_email_challenge_by_email(text, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_otp_public_consume_latest_challenge(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_otp_public_find_email_send_cooldown_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_auth_find_email_send_cooldown(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_auth_delete_email_challenges_for_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_auth_insert_email_challenge(uuid, text, text, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_auth_set_email_challenge_purpose(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_auth_delete_email_challenge_by_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_auth_upsert_email_send_cooldown(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_auth_find_email_challenge_for_confirm(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_auth_increment_email_challenge_attempts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_auth_find_email_owner_conflict(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_auth_verify_user_email(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_auth_find_email_challenge_for_consume(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_auth_find_latest_email_challenge_for_user(uuid, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_auth_find_latest_pending_email_challenge_for_user(uuid, bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.email_otp_public_find_user_by_email(text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_otp_public_find_or_create_user(text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_otp_public_register_patient(text, text, text, text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_otp_public_delete_unverified_registration(uuid) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_otp_public_find_latest_email_challenge_by_email(text, bigint) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_otp_public_consume_latest_challenge(text, text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_otp_public_find_email_send_cooldown_by_email(text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_auth_find_email_send_cooldown(uuid, text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_auth_delete_email_challenges_for_user(uuid) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_auth_insert_email_challenge(uuid, text, text, bigint) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_auth_set_email_challenge_purpose(uuid, text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_auth_delete_email_challenge_by_id(uuid) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_auth_upsert_email_send_cooldown(uuid, text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_auth_find_email_challenge_for_confirm(uuid, uuid) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_auth_increment_email_challenge_attempts(uuid) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_auth_find_email_owner_conflict(uuid, text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_auth_verify_user_email(uuid, text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_auth_find_email_challenge_for_consume(uuid, uuid) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_auth_find_latest_email_challenge_for_user(uuid, bigint) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_auth_find_latest_pending_email_challenge_for_user(uuid, bigint) TO app_patient;
\endif

COMMIT;

\if :organization_member_invites_down
\echo 'organization_member_invites RLS/grants/functions DOWN complete.'
\else
\echo 'organization_member_invites RLS/grants/functions UP complete.'
\endif
