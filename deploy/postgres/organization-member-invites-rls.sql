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
DROP FUNCTION IF EXISTS app.email_auth_update_email_challenge_attempts(uuid, integer);
DROP FUNCTION IF EXISTS app.email_auth_find_email_challenge_for_confirm(uuid, uuid);
DROP FUNCTION IF EXISTS app.email_auth_upsert_email_send_cooldown(uuid, text);
DROP FUNCTION IF EXISTS app.email_auth_delete_email_challenge_by_id(uuid);
DROP FUNCTION IF EXISTS app.email_auth_insert_email_challenge(uuid, text, text, bigint);
DROP FUNCTION IF EXISTS app.email_auth_delete_email_challenges_for_user(uuid);
DROP FUNCTION IF EXISTS app.email_auth_find_email_send_cooldown(uuid, text);
DROP FUNCTION IF EXISTS app.email_otp_public_find_email_send_cooldown_by_email(text);
DROP FUNCTION IF EXISTS app.email_otp_public_find_latest_email_challenge_by_email(text, bigint);
DROP FUNCTION IF EXISTS app.email_otp_public_find_or_create_user(text);
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
\echo 'FATAL: prerequisites missing -- app_patient, schema app, invites/orgs/users/members/specialists tables must all exist.'
SELECT 1 / 0 AS organization_member_invites_accept_abort;
\endif

ALTER TABLE "public"."organization_member_invites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."organization_member_invites" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON "public"."organization_member_invites";
CREATE POLICY "saas_org_dormant_p0_8_3" ON "public"."organization_member_invites"
  FOR ALL
  USING (
    NULLIF(current_setting('app.org', true), '') IS NULL
    OR "organization_id" = NULLIF(current_setting('app.org', true), '')::uuid
  )
  WITH CHECK (
    NULLIF(current_setting('app.org', true), '') IS NULL
    OR "organization_id" = NULLIF(current_setting('app.org', true), '')::uuid
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_staff') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."organization_member_invites" TO app_staff;
  END IF;
END $$;

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
SET search_path = public, pg_catalog
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
SET search_path = public, pg_catalog
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
BEGIN
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
  'Narrow SECURITY DEFINER accept operation for organization member invites. Performs token lock, email/user check, membership/specialist provisioning, and single-use invite update without granting app_patient table writes.';

ALTER FUNCTION app.lookup_pending_org_invite(text) OWNER TO :organization_member_invites_owner_ident;
ALTER FUNCTION app.accept_org_invite(text, uuid, text) OWNER TO :organization_member_invites_owner_ident;

REVOKE ALL ON FUNCTION app.lookup_pending_org_invite(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.accept_org_invite(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lookup_pending_org_invite(text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.accept_org_invite(text, uuid, text) TO app_patient;

CREATE OR REPLACE FUNCTION app.email_otp_public_find_or_create_user(p_email_norm text)
RETURNS TABLE (user_id uuid, was_created boolean)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
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
SET search_path = public, pg_catalog
AS $$
  SELECT c.id, c.user_id, c.code_hash, c.expires_at, c.attempts::integer
  FROM public.email_challenges AS c
  WHERE c.email = p_email_norm
    AND c.expires_at > p_now_sec
  ORDER BY c.created_at DESC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app.email_otp_public_find_email_send_cooldown_by_email(p_email_norm text)
RETURNS TABLE (last_sent_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
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
SET search_path = public, pg_catalog
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
SET search_path = public, pg_catalog
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
SET search_path = public, pg_catalog
AS $$
  INSERT INTO public.email_challenges (user_id, email, code_hash, expires_at, attempts)
  VALUES (p_user_id, p_email, p_code_hash, p_expires_at, 0)
  RETURNING id
$$;

CREATE OR REPLACE FUNCTION app.email_auth_delete_email_challenge_by_id(p_challenge_id uuid)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  DELETE FROM public.email_challenges WHERE id = p_challenge_id
$$;

CREATE OR REPLACE FUNCTION app.email_auth_upsert_email_send_cooldown(p_user_id uuid, p_email_norm text)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  INSERT INTO public.email_send_cooldowns (user_id, email_normalized, last_sent_at)
  VALUES (p_user_id, p_email_norm, now())
  ON CONFLICT (user_id, email_normalized) DO UPDATE SET last_sent_at = now()
$$;

CREATE OR REPLACE FUNCTION app.email_auth_find_email_challenge_for_confirm(
  p_challenge_id uuid,
  p_user_id uuid
)
RETURNS TABLE (id uuid, email text, code_hash text, expires_at bigint, attempts integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT c.id, c.email, c.code_hash, c.expires_at, c.attempts::integer
  FROM public.email_challenges AS c
  WHERE c.id = p_challenge_id
    AND c.user_id = p_user_id
$$;

CREATE OR REPLACE FUNCTION app.email_auth_update_email_challenge_attempts(
  p_challenge_id uuid,
  p_attempts integer
)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  UPDATE public.email_challenges
  SET attempts = p_attempts
  WHERE id = p_challenge_id
$$;

CREATE OR REPLACE FUNCTION app.email_auth_find_email_owner_conflict(p_user_id uuid, p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
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
SET search_path = public, pg_catalog
AS $$
  UPDATE public.platform_users
  SET email = p_email,
      email_normalized = lower(btrim(p_email)),
      email_verified_at = now(),
      updated_at = now()
  WHERE id = p_user_id
$$;

CREATE OR REPLACE FUNCTION app.email_auth_find_email_challenge_for_consume(
  p_challenge_id uuid,
  p_user_id uuid
)
RETURNS TABLE (id uuid, code_hash text, expires_at bigint, attempts integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT c.id, c.code_hash, c.expires_at, c.attempts::integer
  FROM public.email_challenges AS c
  WHERE c.id = p_challenge_id
    AND c.user_id = p_user_id
$$;

CREATE OR REPLACE FUNCTION app.email_auth_find_latest_email_challenge_for_user(
  p_user_id uuid,
  p_now_sec bigint
)
RETURNS TABLE (id uuid, code_hash text, expires_at bigint, attempts integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT c.id, c.code_hash, c.expires_at, c.attempts::integer
  FROM public.email_challenges AS c
  WHERE c.user_id = p_user_id
    AND c.expires_at > p_now_sec
  ORDER BY c.created_at DESC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app.email_auth_find_latest_pending_email_challenge_for_user(
  p_user_id uuid,
  p_now_sec bigint
)
RETURNS TABLE (id uuid, email text, code_hash text, expires_at bigint, attempts integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT c.id, c.email, c.code_hash, c.expires_at, c.attempts::integer
  FROM public.email_challenges AS c
  WHERE c.user_id = p_user_id
    AND c.expires_at > p_now_sec
  ORDER BY c.created_at DESC
  LIMIT 1
$$;

COMMENT ON FUNCTION app.email_otp_public_find_or_create_user(text) IS
  'SECURITY DEFINER accessor for public email OTP start under app_patient without platform_users INSERT grant.';
COMMENT ON FUNCTION app.email_auth_insert_email_challenge(uuid, text, text, bigint) IS
  'SECURITY DEFINER accessor for email OTP challenge creation under app_patient without email_challenges table grants.';

ALTER FUNCTION app.email_otp_public_find_or_create_user(text) OWNER TO :organization_member_invites_owner_ident;
ALTER FUNCTION app.email_otp_public_find_latest_email_challenge_by_email(text, bigint) OWNER TO :organization_member_invites_owner_ident;
ALTER FUNCTION app.email_otp_public_find_email_send_cooldown_by_email(text) OWNER TO :organization_member_invites_owner_ident;
ALTER FUNCTION app.email_auth_find_email_send_cooldown(uuid, text) OWNER TO :organization_member_invites_owner_ident;
ALTER FUNCTION app.email_auth_delete_email_challenges_for_user(uuid) OWNER TO :organization_member_invites_owner_ident;
ALTER FUNCTION app.email_auth_insert_email_challenge(uuid, text, text, bigint) OWNER TO :organization_member_invites_owner_ident;
ALTER FUNCTION app.email_auth_delete_email_challenge_by_id(uuid) OWNER TO :organization_member_invites_owner_ident;
ALTER FUNCTION app.email_auth_upsert_email_send_cooldown(uuid, text) OWNER TO :organization_member_invites_owner_ident;
ALTER FUNCTION app.email_auth_find_email_challenge_for_confirm(uuid, uuid) OWNER TO :organization_member_invites_owner_ident;
ALTER FUNCTION app.email_auth_update_email_challenge_attempts(uuid, integer) OWNER TO :organization_member_invites_owner_ident;
ALTER FUNCTION app.email_auth_find_email_owner_conflict(uuid, text) OWNER TO :organization_member_invites_owner_ident;
ALTER FUNCTION app.email_auth_verify_user_email(uuid, text) OWNER TO :organization_member_invites_owner_ident;
ALTER FUNCTION app.email_auth_find_email_challenge_for_consume(uuid, uuid) OWNER TO :organization_member_invites_owner_ident;
ALTER FUNCTION app.email_auth_find_latest_email_challenge_for_user(uuid, bigint) OWNER TO :organization_member_invites_owner_ident;
ALTER FUNCTION app.email_auth_find_latest_pending_email_challenge_for_user(uuid, bigint) OWNER TO :organization_member_invites_owner_ident;

REVOKE ALL ON FUNCTION app.email_otp_public_find_or_create_user(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_otp_public_find_latest_email_challenge_by_email(text, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_otp_public_find_email_send_cooldown_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_auth_find_email_send_cooldown(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_auth_delete_email_challenges_for_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_auth_insert_email_challenge(uuid, text, text, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_auth_delete_email_challenge_by_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_auth_upsert_email_send_cooldown(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_auth_find_email_challenge_for_confirm(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_auth_update_email_challenge_attempts(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_auth_find_email_owner_conflict(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_auth_verify_user_email(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_auth_find_email_challenge_for_consume(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_auth_find_latest_email_challenge_for_user(uuid, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.email_auth_find_latest_pending_email_challenge_for_user(uuid, bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.email_otp_public_find_or_create_user(text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_otp_public_find_latest_email_challenge_by_email(text, bigint) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_otp_public_find_email_send_cooldown_by_email(text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_auth_find_email_send_cooldown(uuid, text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_auth_delete_email_challenges_for_user(uuid) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_auth_insert_email_challenge(uuid, text, text, bigint) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_auth_delete_email_challenge_by_id(uuid) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_auth_upsert_email_send_cooldown(uuid, text) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_auth_find_email_challenge_for_confirm(uuid, uuid) TO app_patient;
GRANT EXECUTE ON FUNCTION app.email_auth_update_email_challenge_attempts(uuid, integer) TO app_patient;
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
