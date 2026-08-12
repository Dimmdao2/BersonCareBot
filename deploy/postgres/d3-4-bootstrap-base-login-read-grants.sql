-- D3.4 bootstrap/base-login direct read grant closure.
--
-- Purpose:
--   Grant the C0 nonstaff bootstrap base login the direct, least-privilege surface
--   proven missing by the locked TEST product smoke while bootstrap remains the base
--   login after RESET ROLE. This artifact deliberately includes the D2 FB#1
--   phone/contact write surface so the broader bootstrap grant package can be
--   applied by one TEST wrapper hook.
--
-- Required psql variable:
--   - d3_4_bootstrap_base_role
--   - d3_4_media_worker_runtime_role (TEST/default composition only)
-- Optional psql variable:
--   - d3_4_skip_media_worker=1 (DEV webapp-only composition; no media role is read or mutated)
--   - d3_4_skip_bootstrap_role_normalization=1 (DEV only; preflight must already prove C0 topology)
--
-- Rollback:
--   Re-run with -v d3_4_bootstrap_grants_down=1.

\set ON_ERROR_STOP on
\pset pager off

-- D15b/4: idempotent role creation for the platform_users identity-bootstrap RLS branch (this file
-- grants membership in it to the bootstrap base role below). Included, not re-defined here, so this
-- file and integrator-login-public-identity-grants.sql share one definition.
\ir d15b4-platform-users-identity-bootstrap-role.sql

\if :{?d3_4_bootstrap_base_role}
\else
\echo 'FATAL: missing required psql variable d3_4_bootstrap_base_role.'
SELECT 1 / 0 AS d3_4_bootstrap_base_role_missing;
\endif

\if :{?d3_4_skip_media_worker}
\else
\set d3_4_skip_media_worker 0
\endif

SELECT 1 / (:'d3_4_skip_media_worker' IN ('0', '1'))::int
  AS d3_4_skip_media_worker_is_boolean;

\if :{?d3_4_skip_bootstrap_role_normalization}
\else
\set d3_4_skip_bootstrap_role_normalization 0
\endif

SELECT 1 / (:'d3_4_skip_bootstrap_role_normalization' IN ('0', '1'))::int
  AS d3_4_skip_bootstrap_role_normalization_is_boolean;

-- Only the explicit DEV webapp-only composition may rely on an earlier validate-only C0 preflight.
-- Reject both partial opt-ins so TEST/default can never skip cluster-global normalization accidentally.
SELECT 1 / (
  :'d3_4_skip_bootstrap_role_normalization' = :'d3_4_skip_media_worker'
)::int AS d3_4_skip_flags_form_exact_supported_composition;

SELECT 1 / (
  length(:'d3_4_bootstrap_base_role') > 0
  AND EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = :'d3_4_bootstrap_base_role'
      AND rolcanlogin
      AND NOT rolsuper
  )
)::int AS d3_4_bootstrap_base_role_exists;

SELECT 1 / (
  to_regprocedure('app.read_public_runtime_setting(text,text)') IS NOT NULL
  AND to_regprocedure('app.read_webapp_server_runtime_setting(text,text)') IS NOT NULL
  AND to_regprocedure('app.resolve_public_booking_organization(uuid,uuid,uuid)') IS NOT NULL
  AND to_regprocedure('app.resolve_public_organization_slug(text)') IS NOT NULL
  AND to_regprocedure('app.resolve_public_organization_by_slug(text)') IS NOT NULL
  AND to_regprocedure('app.resolve_payment_webhook_organization(text,text,text)') IS NOT NULL
  AND to_regprocedure('app.is_organization_slug_available(text)') IS NOT NULL
)::int AS d3_4_webapp_runtime_accessors_exist;

\if :d3_4_skip_media_worker
\if :{?d3_4_media_worker_runtime_role}
\echo 'FATAL: d3_4_media_worker_runtime_role must be absent when d3_4_skip_media_worker=1.'
SELECT 1 / 0 AS d3_4_skip_media_worker_role_must_be_absent;
\endif
\else
\if :{?d3_4_media_worker_runtime_role}
\else
\echo 'FATAL: missing required psql variable d3_4_media_worker_runtime_role.'
SELECT 1 / 0 AS d3_4_media_worker_runtime_role_missing;
\endif

SELECT 1 / (
  length(:'d3_4_media_worker_runtime_role') > 0
  AND EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = :'d3_4_media_worker_runtime_role'
      AND rolsuper = false
      AND rolbypassrls = false
  )
)::int AS d3_4_media_worker_runtime_role_is_restricted;

-- D3.4 precedes the C4 overlay and therefore has to accept both supported media
-- runtime shapes. A legacy deployment reaches the media surface through
-- app_worker. A C4-provisioned deployment is deliberately detached from that
-- role and may SET ROLE only into its dedicated terminal capability.
-- Refuse a mixed shape: it would hide stale authority instead of preserving compatibility.
WITH media_login AS (
  SELECT oid, rolinherit
  FROM pg_roles
  WHERE rolname = :'d3_4_media_worker_runtime_role'
), direct_memberships AS (
  SELECT
    count(membership.roleid) AS direct_membership_count,
    count(*) FILTER (
      WHERE granted.rolname = 'app_worker'
        AND membership.admin_option = false
        AND membership.inherit_option = true
        AND membership.set_option = true
    ) AS exact_legacy_worker_edge_count,
    count(*) FILTER (
      WHERE granted.rolname = 'app_operational_media_worker'
        AND membership.admin_option = false
        AND membership.inherit_option = false
        AND membership.set_option = true
    ) AS exact_media_set_only_edge_count
  FROM media_login
  LEFT JOIN pg_auth_members membership ON membership.member = media_login.oid
  LEFT JOIN pg_roles granted ON granted.oid = membership.roleid
)
SELECT 1 / (
  NOT pg_has_role(:'d3_4_media_worker_runtime_role', 'app_staff', 'MEMBER')
  AND NOT pg_has_role(:'d3_4_media_worker_runtime_role', 'app_patient', 'MEMBER')
  AND (
    (
      (SELECT rolinherit = true FROM media_login)
      AND (SELECT direct_membership_count = 1 FROM direct_memberships)
      AND (SELECT exact_legacy_worker_edge_count = 1 FROM direct_memberships)
    )
    OR (
      (SELECT rolinherit = false FROM media_login)
      AND (SELECT direct_membership_count = 1 FROM direct_memberships)
      AND (SELECT exact_media_set_only_edge_count = 1 FROM direct_memberships)
    )
  )
)::int AS d3_4_media_worker_runtime_role_has_exact_supported_capability;
\endif

-- P2-B owns the protected principal-context helper bundle. The TEST wrapper may
-- intentionally skip P2-B in legacy-guc mode, so D3.4 accepts either the complete
-- bundle or no bundle and refuses a partially installed state.
SELECT
  (to_regprocedure('app.release_principal_context()') IS NOT NULL)::int
    AS d3_4_has_release_principal_context,
  (to_regprocedure('app.current_org_id()') IS NOT NULL)::int
    AS d3_4_has_current_org_id,
  (to_regprocedure('app.current_patient_user_id()') IS NOT NULL)::int
    AS d3_4_has_current_patient_user_id,
  (to_regprocedure('app.current_integrator_user_id()') IS NOT NULL)::int
    AS d3_4_has_current_integrator_user_id,
  (to_regprocedure('app.close_active_user_phone_history(uuid)') IS NOT NULL)::int
    AS d3_4_has_close_active_user_phone_history
\gset

SELECT 1 / (
  (
    :d3_4_has_release_principal_context
    + :d3_4_has_current_org_id
    + :d3_4_has_current_patient_user_id
    + :d3_4_has_current_integrator_user_id
    + :d3_4_has_close_active_user_phone_history
  ) IN (0, 5)
)::int AS d3_4_p2_b_context_bundle_is_complete_or_absent;

SELECT (
  :d3_4_has_release_principal_context
  + :d3_4_has_current_org_id
  + :d3_4_has_current_patient_user_id
  + :d3_4_has_current_integrator_user_id
  + :d3_4_has_close_active_user_phone_history
  = 5
)::int AS d3_4_has_p2_b_context_bundle
\gset

\if :{?d3_4_bootstrap_grants_down}
\if :d3_4_has_p2_b_context_bundle
REVOKE EXECUTE ON FUNCTION app.release_principal_context() FROM :"d3_4_bootstrap_base_role";
\if :d3_4_skip_media_worker
\else
REVOKE EXECUTE ON FUNCTION app.release_principal_context() FROM :"d3_4_media_worker_runtime_role";
\endif
REVOKE EXECUTE ON FUNCTION app.current_org_id() FROM :"d3_4_bootstrap_base_role";
\if :d3_4_skip_media_worker
\else
REVOKE EXECUTE ON FUNCTION app.current_org_id() FROM :"d3_4_media_worker_runtime_role";
\endif
REVOKE EXECUTE ON FUNCTION app.current_patient_user_id() FROM :"d3_4_bootstrap_base_role";
\if :d3_4_skip_media_worker
\else
REVOKE EXECUTE ON FUNCTION app.current_patient_user_id() FROM :"d3_4_media_worker_runtime_role";
\endif
REVOKE EXECUTE ON FUNCTION app.current_integrator_user_id() FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.close_active_user_phone_history(uuid) FROM :"d3_4_bootstrap_base_role";
\if :d3_4_skip_media_worker
\else
REVOKE EXECUTE ON FUNCTION app.is_staff() FROM :"d3_4_media_worker_runtime_role";
\endif
\endif
REVOKE EXECUTE ON FUNCTION app.is_staff() FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.get_public_config_bool(text) FROM :"d3_4_bootstrap_base_role";
-- 0240: WHERE-guarded so an environment mid-rollback (function not yet migrated) is a no-op rather
-- than an error; mirrors the same absent-function tolerance the ownership normalization uses.
SELECT format('REVOKE EXECUTE ON FUNCTION app.is_smtp_outbound_configured() FROM %I', :'d3_4_bootstrap_base_role')
WHERE to_regprocedure('app.is_smtp_outbound_configured()') IS NOT NULL \gexec
-- 0357: same absent-function tolerance for the preferred-auth-channel accessor below.
SELECT format('REVOKE EXECUTE ON FUNCTION app.get_preferred_auth_channel_code(uuid) FROM %I', :'d3_4_bootstrap_base_role')
WHERE to_regprocedure('app.get_preferred_auth_channel_code(uuid)') IS NOT NULL \gexec
SELECT format('REVOKE EXECUTE ON FUNCTION app.is_sms_provider_configured() FROM %I', :'d3_4_bootstrap_base_role')
WHERE to_regprocedure('app.is_sms_provider_configured()') IS NOT NULL \gexec
SELECT format('REVOKE EXECUTE ON FUNCTION app.is_telegram_login_configured() FROM %I', :'d3_4_bootstrap_base_role')
WHERE to_regprocedure('app.is_telegram_login_configured()') IS NOT NULL \gexec
SELECT format('REVOKE EXECUTE ON FUNCTION app.is_max_bot_configured() FROM %I', :'d3_4_bootstrap_base_role')
WHERE to_regprocedure('app.is_max_bot_configured()') IS NOT NULL \gexec
SELECT format('REVOKE EXECUTE ON FUNCTION app.read_saas_billing_payment_provider() FROM %I', :'d3_4_bootstrap_base_role')
WHERE to_regprocedure('app.read_saas_billing_payment_provider()') IS NOT NULL \gexec
-- 0342 (#1057 B0.3): WHERE-guarded like its saas-billing sibling immediately above, so a DB that
-- predates 0342 is a no-op rather than a FATAL.
SELECT format('REVOKE EXECUTE ON FUNCTION app.resolve_saas_billing_invoice_for_webhook(text, text) FROM %I', :'d3_4_bootstrap_base_role')
WHERE to_regprocedure('app.resolve_saas_billing_invoice_for_webhook(text, text)') IS NOT NULL \gexec
-- 0351: WHERE-guarded, same as the other post-2026-07-25 additions above -- absent function
-- (migration 0343 not yet applied) is a no-op rather than an error.
SELECT format('REVOKE EXECUTE ON FUNCTION app.read_webapp_preauth_provider_setting(text) FROM %I', :'d3_4_bootstrap_base_role')
WHERE to_regprocedure('app.read_webapp_preauth_provider_setting(text)') IS NOT NULL \gexec
REVOKE EXECUTE ON FUNCTION app.current_patient_has_password_credentials() FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.current_patient_has_web_oauth_binding() FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_password_register_pending(text, text, text, text, text, text) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_password_delete_unverified_registration(uuid) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_password_find_user_id_by_email_challenge(uuid) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_password_find_login_candidate(text) FROM :"d3_4_bootstrap_base_role";
-- 0342 (F5/F6, Track D / #987 D27): equal-rights login resolver — primary OR confirmed OAuth
-- secondary email. WHERE-guarded: absent function (migration 0342 not yet applied) is a no-op.
SELECT format('REVOKE EXECUTE ON FUNCTION app.find_platform_user_ids_by_any_confirmed_email(text) FROM %I', :'d3_4_bootstrap_base_role')
WHERE to_regprocedure('app.find_platform_user_ids_by_any_confirmed_email(text)') IS NOT NULL \gexec
SELECT format('REVOKE EXECUTE ON FUNCTION app.password_login_read_altcha_secret() FROM %I', :'d3_4_bootstrap_base_role')
WHERE to_regprocedure('app.password_login_read_altcha_secret()') IS NOT NULL \gexec
SELECT format('REVOKE EXECUTE ON FUNCTION app.password_login_issue_altcha_challenge(text,uuid,text,timestamptz) FROM %I', :'d3_4_bootstrap_base_role')
WHERE to_regprocedure('app.password_login_issue_altcha_challenge(text,uuid,text,timestamptz)') IS NOT NULL \gexec
SELECT format('REVOKE EXECUTE ON FUNCTION app.password_login_acquire(text,text,uuid,text) FROM %I', :'d3_4_bootstrap_base_role')
WHERE to_regprocedure('app.password_login_acquire(text,text,uuid,text)') IS NOT NULL \gexec
SELECT format('REVOKE EXECUTE ON FUNCTION app.password_login_complete(uuid,boolean) FROM %I', :'d3_4_bootstrap_base_role')
WHERE to_regprocedure('app.password_login_complete(uuid,boolean)') IS NOT NULL \gexec
SELECT format('REVOKE EXECUTE ON FUNCTION app.password_credentials_replace_self(text,text) FROM %I', :'d3_4_bootstrap_base_role')
WHERE to_regprocedure('app.password_credentials_replace_self(text,text)') IS NOT NULL \gexec
SELECT format('REVOKE EXECUTE ON FUNCTION app.password_credentials_upsert_self(text,text) FROM %I', :'d3_4_bootstrap_base_role')
WHERE to_regprocedure('app.password_credentials_upsert_self(text,text)') IS NOT NULL \gexec
SELECT format('REVOKE EXECUTE ON FUNCTION app.set_staff_security_self_password_hash(text) FROM %I', :'d3_4_bootstrap_base_role')
WHERE to_regprocedure('app.set_staff_security_self_password_hash(text)') IS NOT NULL \gexec
REVOKE EXECUTE ON FUNCTION app.is_organization_slug_available(text) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.create_specialist_signup_intent(uuid, text, text, text, text) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.get_pending_specialist_signup_intent(uuid, uuid) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.get_specialist_signup_intent_by_challenge(uuid) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.provision_specialist_owner(uuid) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.get_public_reference_baseline(text) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.lookup_pending_org_invite(text) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.accept_org_invite(text, uuid, text) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_otp_public_find_user_by_email(text) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_otp_public_find_or_create_user(text) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_otp_public_register_patient(text, text, text, text) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_otp_public_delete_unverified_registration(uuid) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_otp_public_find_latest_email_challenge_by_email(text, bigint) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_otp_public_consume_latest_challenge(text, text) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_otp_public_find_email_send_cooldown_by_email(text) FROM :"d3_4_bootstrap_base_role";
-- 0246 A-3 anonymous booking phone-OTP pair (see the matching GRANTs in the UP section below).
SELECT format(
  'REVOKE EXECUTE ON FUNCTION app.phone_otp_public_booking_issue_challenge(text, text, text, integer, integer, text, jsonb) FROM %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.phone_otp_public_booking_issue_challenge(text, text, text, integer, integer, text, jsonb)') IS NOT NULL \gexec
SELECT format(
  'REVOKE EXECUTE ON FUNCTION app.phone_otp_public_booking_consume_challenge(text, text, integer, integer) FROM %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.phone_otp_public_booking_consume_challenge(text, text, integer, integer)') IS NOT NULL \gexec
-- 0252 phone auth/profile-bind store seam. These paths remain on this NOINHERIT login because their
-- bootstrap principal never SET ROLEs; app_patient-only EXECUTE would therefore be unreachable.
SELECT format(
  'REVOKE EXECUTE ON FUNCTION app.phone_challenge_store_upsert(text, text, bigint, text, jsonb, integer) FROM %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.phone_challenge_store_upsert(text, text, bigint, text, jsonb, integer)') IS NOT NULL \gexec
SELECT format(
  'REVOKE EXECUTE ON FUNCTION app.phone_challenge_store_read(text) FROM %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.phone_challenge_store_read(text)') IS NOT NULL \gexec
SELECT format(
  'REVOKE EXECUTE ON FUNCTION app.phone_challenge_store_delete(text) FROM %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.phone_challenge_store_delete(text)') IS NOT NULL \gexec
SELECT format(
  'REVOKE EXECUTE ON FUNCTION app.phone_challenge_store_delete_by_phone(text) FROM %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.phone_challenge_store_delete_by_phone(text)') IS NOT NULL \gexec
SELECT format(
  'REVOKE EXECUTE ON FUNCTION app.phone_challenge_store_increment_attempts(text, bigint) FROM %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.phone_challenge_store_increment_attempts(text, bigint)') IS NOT NULL \gexec
SELECT format(
  'REVOKE EXECUTE ON FUNCTION app.phone_auth_find_otp_lock(text) FROM %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.phone_auth_find_otp_lock(text)') IS NOT NULL \gexec
SELECT format(
  'REVOKE EXECUTE ON FUNCTION app.phone_auth_find_latest_challenge_created_at(text) FROM %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.phone_auth_find_latest_challenge_created_at(text)') IS NOT NULL \gexec
SELECT format(
  'REVOKE EXECUTE ON FUNCTION app.phone_auth_register_otp_lockout(text, bigint) FROM %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.phone_auth_register_otp_lockout(text, bigint)') IS NOT NULL \gexec
SELECT format(
  'REVOKE EXECUTE ON FUNCTION app.phone_auth_reset_otp_lockout(text) FROM %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.phone_auth_reset_otp_lockout(text)') IS NOT NULL \gexec
-- 0254 shared auth limiter: anonymous confirm routes stay on this bare NOINHERIT login.
SELECT format(
  'REVOKE EXECUTE ON FUNCTION app.auth_rate_limit_prune_scope(text, timestamptz, integer) FROM %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.auth_rate_limit_prune_scope(text, timestamptz, integer)') IS NOT NULL \gexec
SELECT format(
  'REVOKE EXECUTE ON FUNCTION app.auth_rate_limit_prune_key(text, text, timestamptz) FROM %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.auth_rate_limit_prune_key(text, text, timestamptz)') IS NOT NULL \gexec
SELECT format(
  'REVOKE EXECUTE ON FUNCTION app.auth_rate_limit_count(text, text) FROM %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.auth_rate_limit_count(text, text)') IS NOT NULL \gexec
SELECT format(
  'REVOKE EXECUTE ON FUNCTION app.auth_rate_limit_record(text, text) FROM %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.auth_rate_limit_record(text, text)') IS NOT NULL \gexec
-- 0258 bootstrap auth tables: exact action signatures only; the five backing tables stay denied.
WITH bootstrap_auth_accessor(signature) AS (
  VALUES
    ('app.auth_channel_link_replace_secret(uuid, text, text, timestamptz)'),
    ('app.auth_channel_link_read_secret(text, text)'),
    ('app.auth_channel_link_mark_secret_used(uuid)'),
    ('app.auth_channel_link_lock_unused_secret(uuid)'),
    ('app.auth_channel_link_mark_secret_used_if_unused(uuid)'),
    ('app.auth_email_setup_revoke_active(uuid, text)'),
    ('app.auth_email_setup_insert(uuid, text, text, timestamptz, text, uuid)'),
    ('app.auth_email_setup_delete(uuid)'),
    ('app.auth_email_setup_read(text)'),
    ('app.auth_email_setup_mark_used(uuid)'),
    ('app.auth_oauth_list_user_providers(uuid)'),
    ('app.auth_oauth_find_user(text, text)'),
    ('app.auth_oauth_upsert_binding(uuid, text, text, text)'),
    ('app.auth_login_token_create(text, uuid, text, timestamptz)'),
    ('app.auth_login_token_read(text)'),
    ('app.auth_login_token_expire_past()'),
    ('app.auth_login_token_confirm(text)'),
    ('app.auth_login_token_mark_session_issued(text)'),
    ('app.auth_phone_bind_lock_channel_binding(text, text)'),
    ('app.auth_phone_bind_upsert_channel_binding(uuid, text, text)'),
    ('app.passkey_issue_challenge(uuid, text, uuid, text, text, text, timestamptz)'),
    ('app.passkey_read_challenge(uuid, text)'),
    ('app.passkey_read_credential(text)'),
    ('app.passkey_complete_authentication(uuid, text, bigint, bigint, text, boolean)')
)
SELECT format(
  'REVOKE EXECUTE ON FUNCTION %s FROM %I',
  signature,
  :'d3_4_bootstrap_base_role'
)
FROM bootstrap_auth_accessor
WHERE to_regprocedure(signature) IS NOT NULL
\gexec
REVOKE EXECUTE ON FUNCTION app.email_auth_find_email_send_cooldown(uuid, text) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_auth_delete_email_challenges_for_user(uuid) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_auth_insert_email_challenge(uuid, text, text, bigint) FROM :"d3_4_bootstrap_base_role";
-- C-2 step 4 (0249): purpose-stamp accessor, called immediately after insert in the same request --
-- same bootstrap-reachability requirement as the insert accessor immediately above. WHERE-guarded
-- like the 0246/0247 additions above it, so a DB that predates 0249 is a no-op rather than a FATAL.
SELECT format(
  'REVOKE EXECUTE ON FUNCTION app.email_auth_set_email_challenge_purpose(uuid, text) FROM %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.email_auth_set_email_challenge_purpose(uuid, text)') IS NOT NULL \gexec
REVOKE EXECUTE ON FUNCTION app.email_auth_delete_email_challenge_by_id(uuid) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_auth_upsert_email_send_cooldown(uuid, text) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_auth_find_email_challenge_for_confirm(uuid, uuid) FROM :"d3_4_bootstrap_base_role";
-- 0247 renamed this from an absolute-set accessor to an atomic increment; guarded the same way as
-- the 0246 booking pair above since a DB that predates 0247 would otherwise FATAL on a REVOKE
-- against a function that does not exist yet.
SELECT format(
  'REVOKE EXECUTE ON FUNCTION app.email_auth_increment_email_challenge_attempts(uuid) FROM %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.email_auth_increment_email_challenge_attempts(uuid)') IS NOT NULL \gexec
REVOKE EXECUTE ON FUNCTION app.email_auth_find_email_owner_conflict(uuid, text) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_auth_verify_user_email(uuid, text) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_auth_find_email_challenge_for_consume(uuid, uuid) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_auth_find_latest_email_challenge_for_user(uuid, bigint) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_auth_find_latest_pending_email_challenge_for_user(uuid, bigint) FROM :"d3_4_bootstrap_base_role";
-- D27-C fix round 2 (migration 0363): the accessor now takes only the challenge id and composes
-- the email itself from public.email_challenges -- the 5-arg (text, jsonb, integer, timestamptz,
-- smallint) signature that accepted caller-built message content no longer exists. WHERE-guarded
-- like the other post-D3.4-vintage additions since this function is new.
-- D27-C fix round 3 (migration 0370): a required ownership-token argument was added -- the 1-arg
-- (uuid) signature that trusted a bare challenge_id no longer exists either.
SELECT format(
  'REVOKE EXECUTE ON FUNCTION app.email_auth_enqueue_otp_delivery(uuid, uuid) FROM %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.email_auth_enqueue_otp_delivery(uuid, uuid)') IS NOT NULL \gexec
-- D27-C fix round 2 (migration 0363): stashes the plaintext OTP for delivery composition, called
-- immediately after insert in the same request -- same bootstrap-reachability requirement as
-- email_auth_set_email_challenge_purpose above.
SELECT format(
  'REVOKE EXECUTE ON FUNCTION app.email_auth_set_email_challenge_delivery_code(uuid, text) FROM %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.email_auth_set_email_challenge_delivery_code(uuid, text)') IS NOT NULL \gexec
-- 0248 (C-2 decaying OTP lockout): same bootstrap-reachability requirement as its email_auth_find_*
-- siblings above -- checkEmailOtpLock() is the first DB call inside startEmailChallenge(), which the
-- forgot-password flow (api/auth/email-password/forgot) calls under a bootstrap-stamped principal
-- that never SET ROLEs. WHERE-guarded like the other post-D3.4-vintage additions in this file, so a
-- DB that predates 0248 is a no-op rather than a FATAL.
SELECT format(
  'REVOKE EXECUTE ON FUNCTION app.email_auth_find_email_otp_lock(uuid) FROM %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.email_auth_find_email_otp_lock(uuid)') IS NOT NULL \gexec
-- 0248 (C-2 decaying OTP lockout), same reasoning as the read-only find above but for its two
-- write siblings: verifyChallengeCodeRow (emailAuth.ts) calls resetEmailOtpLockoutForUser() on a
-- correct code and registerEmailOtpLockoutForUser() on the attempt that exhausts the max-attempts
-- counter -- both from inside consumeEmailChallengeCode/consumeLatestEmailChallengeCodeForUser,
-- which api/auth/email-password/reset:POST calls under a bootstrap-stamped principal that never
-- SET ROLEs. Without this, a correct password-reset code hits "permission denied for function
-- email_auth_reset_email_otp_lockout" on its own success path. WHERE-guarded like their find_*
-- sibling, so a DB that predates 0248 is a no-op rather than a FATAL.
SELECT format(
  'REVOKE EXECUTE ON FUNCTION app.email_auth_register_email_otp_lockout(uuid) FROM %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.email_auth_register_email_otp_lockout(uuid)') IS NOT NULL \gexec
SELECT format(
  'REVOKE EXECUTE ON FUNCTION app.email_auth_reset_email_otp_lockout(uuid) FROM %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.email_auth_reset_email_otp_lockout(uuid)') IS NOT NULL \gexec
REVOKE EXECUTE ON FUNCTION app.resolve_public_booking_organization(uuid, uuid, uuid) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.resolve_public_organization_slug(text) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.resolve_public_organization_by_slug(text) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.resolve_payment_webhook_organization(text, text, text) FROM :"d3_4_bootstrap_base_role";

REVOKE SELECT ON TABLE public.be_organization_members FROM :"d3_4_bootstrap_base_role";
REVOKE SELECT ON TABLE public.platform_users FROM :"d3_4_bootstrap_base_role";
REVOKE app_identity_bootstrap FROM :"d3_4_bootstrap_base_role";
REVOKE SELECT ON TABLE public.user_channel_bindings FROM :"d3_4_bootstrap_base_role";
REVOKE SELECT ON TABLE public.be_external_entity_mappings FROM :"d3_4_bootstrap_base_role";
REVOKE SELECT ON TABLE public.be_specialist_service_availability FROM :"d3_4_bootstrap_base_role";
REVOKE SELECT ON TABLE public.be_branches FROM :"d3_4_bootstrap_base_role";
REVOKE SELECT ON TABLE public.be_clinic_services FROM :"d3_4_bootstrap_base_role";
REVOKE SELECT ON TABLE public.be_specialists FROM :"d3_4_bootstrap_base_role";

REVOKE SELECT, INSERT, UPDATE ON TABLE public.user_phone_history FROM :"d3_4_bootstrap_base_role";
REVOKE SELECT, INSERT, UPDATE ON TABLE public.platform_user_contacts FROM :"d3_4_bootstrap_base_role";
\if :d3_4_skip_media_worker
\else
REVOKE SELECT ON TABLE public.app_runtime_settings FROM :"d3_4_media_worker_runtime_role";
\endif

REVOKE USAGE ON SCHEMA app FROM :"d3_4_bootstrap_base_role";
\if :d3_4_skip_media_worker
\else
REVOKE USAGE ON SCHEMA app FROM :"d3_4_media_worker_runtime_role";
\endif
REVOKE USAGE ON SCHEMA public FROM :"d3_4_bootstrap_base_role";
\echo 'D3.4 bootstrap/base-login grants DOWN complete.'
\quit
\endif

-- Normalize only the discovered nonstaff/bootstrap login. The separate staff pool is not
-- passed to this artifact and its topology remains untouched. Strip every stale direct edge,
-- then rebuild the single SET-only patient lifecycle used by classified requests. DEV skips
-- only this cluster-global block after its wrapper has already proven the exact C0 topology.
\if :d3_4_skip_bootstrap_role_normalization
\else
ALTER ROLE :"d3_4_bootstrap_base_role"
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
SELECT format(
  'REVOKE %I FROM %I',
  granted_role.rolname,
  member_role.rolname
)
FROM pg_auth_members membership
JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
JOIN pg_roles member_role ON member_role.oid = membership.member
WHERE member_role.rolname = :'d3_4_bootstrap_base_role'
  AND granted_role.rolname <> 'app_patient'
ORDER BY granted_role.rolname
\gexec
REVOKE ADMIN OPTION FOR app_patient FROM :"d3_4_bootstrap_base_role";
GRANT app_patient TO :"d3_4_bootstrap_base_role"
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
\endif
REVOKE SELECT ON TABLE public.app_runtime_settings, public.system_settings
  FROM :"d3_4_bootstrap_base_role";
REVOKE SELECT ON TABLE public.be_payment_provider_events, public.be_payment_intents
  FROM :"d3_4_bootstrap_base_role";

-- Rebuild the six bootstrap accessor ACLs from an exact closed set. REVOKE on the base first
-- removes any stale WITH GRANT OPTION before the plain EXECUTE grants are restored.
REVOKE ALL PRIVILEGES ON FUNCTION app.read_public_runtime_setting(text, text)
  FROM :"d3_4_bootstrap_base_role" CASCADE;
REVOKE ALL PRIVILEGES ON FUNCTION app.read_webapp_server_runtime_setting(text, text)
  FROM :"d3_4_bootstrap_base_role" CASCADE;
REVOKE ALL PRIVILEGES ON FUNCTION app.read_public_runtime_setting(text, text) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION app.read_webapp_server_runtime_setting(text, text) FROM PUBLIC;
SELECT format(
  'REVOKE ALL PRIVILEGES ON FUNCTION %s FROM %I CASCADE',
  procedure.oid::regprocedure,
  pg_get_userbyid(privilege.grantee)
)
FROM pg_proc procedure
CROSS JOIN LATERAL aclexplode(
  COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
) privilege
WHERE procedure.oid IN (
    'app.read_public_runtime_setting(text,text)'::regprocedure,
    'app.read_webapp_server_runtime_setting(text,text)'::regprocedure,
    'app.resolve_public_booking_organization(uuid,uuid,uuid)'::regprocedure,
    'app.resolve_public_organization_slug(text)'::regprocedure,
    'app.resolve_public_organization_by_slug(text)'::regprocedure,
    'app.resolve_payment_webhook_organization(text,text,text)'::regprocedure
  )
  AND privilege.privilege_type = 'EXECUTE'
  AND privilege.grantee NOT IN (
    0,
    procedure.proowner,
    (SELECT oid FROM pg_roles WHERE rolname = :'d3_4_bootstrap_base_role')
  )
  AND NOT (
    procedure.oid IN (
      'app.resolve_public_booking_organization(uuid,uuid,uuid)'::regprocedure,
      'app.resolve_public_organization_slug(text)'::regprocedure,
      'app.resolve_public_organization_by_slug(text)'::regprocedure,
      'app.resolve_payment_webhook_organization(text,text,text)'::regprocedure
    )
    AND privilege.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'app_patient')
  )
ORDER BY procedure.oid::regprocedure::text, privilege.grantee
\gexec
GRANT EXECUTE ON FUNCTION app.read_public_runtime_setting(text, text)
  TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.read_webapp_server_runtime_setting(text, text)
  TO :"d3_4_bootstrap_base_role";

-- Public booking and payment webhooks must resolve their organization before a tenant principal can be installed.
-- D3.4 makes app_patient SET-only, so inherited EXECUTE is deliberately unavailable at this
-- bootstrap point. Restore only the four SECURITY DEFINER tenant resolvers directly; their
-- overlays own the app_patient grants and the backing tables remain hidden from app_patient.
REVOKE ALL PRIVILEGES ON FUNCTION app.resolve_public_booking_organization(uuid, uuid, uuid)
  FROM :"d3_4_bootstrap_base_role" CASCADE;
REVOKE ALL PRIVILEGES ON FUNCTION app.resolve_public_booking_organization(uuid, uuid, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_public_booking_organization(uuid, uuid, uuid) TO :"d3_4_bootstrap_base_role";
REVOKE ALL PRIVILEGES ON FUNCTION app.resolve_public_organization_slug(text)
  FROM :"d3_4_bootstrap_base_role" CASCADE;
REVOKE ALL PRIVILEGES ON FUNCTION app.resolve_public_organization_slug(text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_public_organization_slug(text) TO :"d3_4_bootstrap_base_role";
REVOKE ALL PRIVILEGES ON FUNCTION app.resolve_public_organization_by_slug(text)
  FROM :"d3_4_bootstrap_base_role" CASCADE;
REVOKE ALL PRIVILEGES ON FUNCTION app.resolve_public_organization_by_slug(text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_public_organization_by_slug(text) TO :"d3_4_bootstrap_base_role";
REVOKE ALL PRIVILEGES ON FUNCTION app.resolve_payment_webhook_organization(text, text, text)
  FROM :"d3_4_bootstrap_base_role" CASCADE;
REVOKE ALL PRIVILEGES ON FUNCTION app.resolve_payment_webhook_organization(text, text, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_payment_webhook_organization(text, text, text) TO :"d3_4_bootstrap_base_role";

GRANT USAGE ON SCHEMA public, app TO :"d3_4_bootstrap_base_role";
\if :d3_4_skip_media_worker
\else
GRANT USAGE ON SCHEMA app TO :"d3_4_media_worker_runtime_role";
\endif
REVOKE EXECUTE ON FUNCTION app.staff_user_has_password_credentials(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.staff_user_has_password_credentials(uuid) TO app_staff;

\if :d3_4_has_p2_b_context_bundle
REVOKE EXECUTE ON FUNCTION app.release_principal_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.release_principal_context() TO :"d3_4_bootstrap_base_role";
\if :d3_4_skip_media_worker
\else
GRANT EXECUTE ON FUNCTION app.release_principal_context() TO :"d3_4_media_worker_runtime_role";
\endif
-- Phase4 grants these policy-evaluation helpers to app_worker. Grant them directly to the exact
-- media runtime too: pg_has_role(..., 'member') can make the worker policy branch true even for a
-- NOINHERIT member, while inherited function privileges would still be unavailable. D3.4 must not
-- grant install/reset/signing or unrelated current-integrator helpers.
GRANT EXECUTE ON FUNCTION app.current_org_id() TO :"d3_4_bootstrap_base_role";
\if :d3_4_skip_media_worker
\else
GRANT EXECUTE ON FUNCTION app.current_org_id() TO :"d3_4_media_worker_runtime_role";
\endif
GRANT EXECUTE ON FUNCTION app.current_patient_user_id() TO :"d3_4_bootstrap_base_role";
\if :d3_4_skip_media_worker
\else
GRANT EXECUTE ON FUNCTION app.current_patient_user_id() TO :"d3_4_media_worker_runtime_role";
\endif
GRANT EXECUTE ON FUNCTION app.current_integrator_user_id() TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.close_active_user_phone_history(uuid) TO :"d3_4_bootstrap_base_role";
\if :d3_4_skip_media_worker
\else
GRANT EXECUTE ON FUNCTION app.is_staff() TO :"d3_4_media_worker_runtime_role";
\endif
\endif
GRANT EXECUTE ON FUNCTION app.is_staff() TO :"d3_4_bootstrap_base_role";

-- Generic server-audience runtime config only. RLS in 0188 exposes global server rows to
-- app_worker members and hides authenticated-client rows; restricted system_settings stays denied.
\if :d3_4_skip_media_worker
\else
GRANT SELECT ON TABLE public.app_runtime_settings TO :"d3_4_media_worker_runtime_role";
\endif

-- Narrow SECURITY DEFINER pre-auth surface. These functions own their validation and expose only
-- the bootstrap operations used by email auth, invite acceptance, and specialist signup. Direct
-- table grants for their sensitive backing tables remain absent from the base login.
GRANT EXECUTE ON FUNCTION app.get_public_config_bool(text) TO :"d3_4_bootstrap_base_role";
-- 0240: boolean-only "is outbound SMTP configured?" accessor for the public login screen
-- (authChannelPolicy.ts:isSmtpConfigured). Same class of grant as get_public_config_bool above —
-- never exposes host/user/password/from, only their presence. WHERE-guarded: absent function
-- (older DB, migration 0240 not yet applied) is a no-op rather than a FATAL here.
SELECT format('GRANT EXECUTE ON FUNCTION app.is_smtp_outbound_configured() TO %I', :'d3_4_bootstrap_base_role')
WHERE to_regprocedure('app.is_smtp_outbound_configured()') IS NOT NULL \gexec
-- 0357: phone/start's automatic-channel resolution (resolveAuthOtpChannel) needs the caller's
-- preferred_for_auth channel_code before a session exists. Narrow SECURITY DEFINER accessor by
-- exact user id, no table grant to this login (see migration 0357's header for the full trace).
SELECT format('GRANT EXECUTE ON FUNCTION app.get_preferred_auth_channel_code(uuid) TO %I', :'d3_4_bootstrap_base_role')
WHERE to_regprocedure('app.get_preferred_auth_channel_code(uuid)') IS NOT NULL \gexec
SELECT format('GRANT EXECUTE ON FUNCTION app.is_sms_provider_configured() TO %I', :'d3_4_bootstrap_base_role')
WHERE to_regprocedure('app.is_sms_provider_configured()') IS NOT NULL \gexec
SELECT format('GRANT EXECUTE ON FUNCTION app.is_telegram_login_configured() TO %I', :'d3_4_bootstrap_base_role')
WHERE to_regprocedure('app.is_telegram_login_configured()') IS NOT NULL \gexec
SELECT format('GRANT EXECUTE ON FUNCTION app.is_max_bot_configured() TO %I', :'d3_4_bootstrap_base_role')
WHERE to_regprocedure('app.is_max_bot_configured()') IS NOT NULL \gexec
-- SaaS webhook bootstrap needs the exact platform provider credentials to verify the callback.
-- The fixed-key function exposes no arbitrary setting selector and no table grant.
SELECT format('GRANT EXECUTE ON FUNCTION app.read_saas_billing_payment_provider() TO %I', :'d3_4_bootstrap_base_role')
WHERE to_regprocedure('app.read_saas_billing_payment_provider()') IS NOT NULL \gexec
-- 0342 (#1057 B0.3): once the signature is verified, the same webhook resolves its invoice by
-- provider ref, still before the organization is known. Narrow SECURITY DEFINER resolver, no table
-- grant to this login — see the migration's own header for the full trace.
SELECT format('GRANT EXECUTE ON FUNCTION app.resolve_saas_billing_invoice_for_webhook(text, text) TO %I', :'d3_4_bootstrap_base_role')
WHERE to_regprocedure('app.resolve_saas_billing_invoice_for_webhook(text, text)') IS NOT NULL \gexec
-- TEST owner findings 2026-08-03 (D1): oauth/start, oauth/callback/{yandex,google,apple} and
-- telegram-login all read an OAuth/Telegram credential before a session exists. The fixed-key
-- function exposes exactly those 12 keys, never a caller-controlled key, never table access.
SELECT format('GRANT EXECUTE ON FUNCTION app.read_webapp_preauth_provider_setting(text) TO %I', :'d3_4_bootstrap_base_role')
WHERE to_regprocedure('app.read_webapp_preauth_provider_setting(text)') IS NOT NULL \gexec
GRANT EXECUTE ON FUNCTION app.current_patient_has_password_credentials() TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.current_patient_has_web_oauth_binding() TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_password_register_pending(text, text, text, text, text, text) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_password_delete_unverified_registration(uuid) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_password_find_user_id_by_email_challenge(uuid) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_password_find_login_candidate(text) TO :"d3_4_bootstrap_base_role";
SELECT format('GRANT EXECUTE ON FUNCTION app.find_platform_user_ids_by_any_confirmed_email(text) TO %I', :'d3_4_bootstrap_base_role')
WHERE to_regprocedure('app.find_platform_user_ids_by_any_confirmed_email(text)') IS NOT NULL \gexec
SELECT format('GRANT EXECUTE ON FUNCTION app.password_login_read_altcha_secret() TO %I', :'d3_4_bootstrap_base_role')
WHERE to_regprocedure('app.password_login_read_altcha_secret()') IS NOT NULL \gexec
SELECT format('GRANT EXECUTE ON FUNCTION app.password_login_issue_altcha_challenge(text,uuid,text,timestamptz) TO %I', :'d3_4_bootstrap_base_role')
WHERE to_regprocedure('app.password_login_issue_altcha_challenge(text,uuid,text,timestamptz)') IS NOT NULL \gexec
SELECT format('GRANT EXECUTE ON FUNCTION app.password_login_acquire(text,text,uuid,text) TO %I', :'d3_4_bootstrap_base_role')
WHERE to_regprocedure('app.password_login_acquire(text,text,uuid,text)') IS NOT NULL \gexec
SELECT format('GRANT EXECUTE ON FUNCTION app.password_login_complete(uuid,boolean) TO %I', :'d3_4_bootstrap_base_role')
WHERE to_regprocedure('app.password_login_complete(uuid,boolean)') IS NOT NULL \gexec
SELECT format('GRANT EXECUTE ON FUNCTION app.password_credentials_replace_self(text,text) TO %I', :'d3_4_bootstrap_base_role')
WHERE to_regprocedure('app.password_credentials_replace_self(text,text)') IS NOT NULL \gexec
SELECT format('GRANT EXECUTE ON FUNCTION app.password_credentials_upsert_self(text,text) TO %I', :'d3_4_bootstrap_base_role')
WHERE to_regprocedure('app.password_credentials_upsert_self(text,text)') IS NOT NULL \gexec
-- 0274 retires the legacy reset function: it bypasses the atomic account+identifier state.
SELECT format('REVOKE EXECUTE ON FUNCTION app.set_staff_security_self_password_hash(text) FROM %I', :'d3_4_bootstrap_base_role')
WHERE to_regprocedure('app.set_staff_security_self_password_hash(text)') IS NOT NULL \gexec
GRANT EXECUTE ON FUNCTION app.is_organization_slug_available(text) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.create_specialist_signup_intent(uuid, text, text, text, text) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.get_pending_specialist_signup_intent(uuid, uuid) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.get_specialist_signup_intent_by_challenge(uuid) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.provision_specialist_owner(uuid) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.get_public_reference_baseline(text) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.lookup_pending_org_invite(text) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.accept_org_invite(text, uuid, text) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_otp_public_find_user_by_email(text) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_otp_public_find_or_create_user(text) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_otp_public_register_patient(text, text, text, text) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_otp_public_delete_unverified_registration(uuid) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_otp_public_find_latest_email_challenge_by_email(text, bigint) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_otp_public_consume_latest_challenge(text, text) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_otp_public_find_email_send_cooldown_by_email(text) TO :"d3_4_bootstrap_base_role";
-- 0246: the A-3 anonymous booking phone-OTP pair, the phone-side twin of the e-mail OTP accessors
-- immediately above. Both booking handlers stamp a `bootstrap` principal, and a bootstrap principal
-- never SET ROLEs (packages/db-principal/src/index.ts:applyDbPrincipalToConnection -> the
-- "bootstrap" case only clears app.* config) — so the request stays on this NOINHERIT login role
-- and a GRANT to app_patient alone buys it nothing. Reproduced live on DEV 2026-07-26: with EXECUTE
-- granted to app_patient and nothing else, the runtime login still answered
-- "permission denied for function phone_otp_public_booking_issue_challenge". Neither function
-- returns a challenge row: issue answers true/false, consume answers with the caller's own pinned
-- booking intent and the delivery channel — never the one-time code. WHERE-guarded like
-- is_smtp_outbound_configured above, so a DB without migration 0246 is a no-op rather than a FATAL.
SELECT format(
  'GRANT EXECUTE ON FUNCTION app.phone_otp_public_booking_issue_challenge(text, text, text, integer, integer, text, jsonb) TO %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.phone_otp_public_booking_issue_challenge(text, text, text, integer, integer, text, jsonb)') IS NOT NULL \gexec
SELECT format(
  'GRANT EXECUTE ON FUNCTION app.phone_otp_public_booking_consume_challenge(text, text, integer, integer) TO %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.phone_otp_public_booking_consume_challenge(text, text, integer, integer)') IS NOT NULL \gexec
-- 0252: same bootstrap/base-login reachability rule as the booking OTP pair immediately above.
SELECT format(
  'GRANT EXECUTE ON FUNCTION app.phone_challenge_store_upsert(text, text, bigint, text, jsonb, integer) TO %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.phone_challenge_store_upsert(text, text, bigint, text, jsonb, integer)') IS NOT NULL \gexec
SELECT format(
  'GRANT EXECUTE ON FUNCTION app.phone_challenge_store_read(text) TO %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.phone_challenge_store_read(text)') IS NOT NULL \gexec
SELECT format(
  'GRANT EXECUTE ON FUNCTION app.phone_challenge_store_delete(text) TO %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.phone_challenge_store_delete(text)') IS NOT NULL \gexec
SELECT format(
  'GRANT EXECUTE ON FUNCTION app.phone_challenge_store_delete_by_phone(text) TO %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.phone_challenge_store_delete_by_phone(text)') IS NOT NULL \gexec
SELECT format(
  'GRANT EXECUTE ON FUNCTION app.phone_challenge_store_increment_attempts(text, bigint) TO %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.phone_challenge_store_increment_attempts(text, bigint)') IS NOT NULL \gexec
SELECT format(
  'GRANT EXECUTE ON FUNCTION app.phone_auth_find_otp_lock(text) TO %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.phone_auth_find_otp_lock(text)') IS NOT NULL \gexec
SELECT format(
  'GRANT EXECUTE ON FUNCTION app.phone_auth_find_latest_challenge_created_at(text) TO %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.phone_auth_find_latest_challenge_created_at(text)') IS NOT NULL \gexec
SELECT format(
  'GRANT EXECUTE ON FUNCTION app.phone_auth_register_otp_lockout(text, bigint) TO %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.phone_auth_register_otp_lockout(text, bigint)') IS NOT NULL \gexec
SELECT format(
  'GRANT EXECUTE ON FUNCTION app.phone_auth_reset_otp_lockout(text) TO %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.phone_auth_reset_otp_lockout(text)') IS NOT NULL \gexec
-- 0254: same bare-login reachability rule as the bootstrap phone-auth accessors above.
SELECT format(
  'GRANT EXECUTE ON FUNCTION app.auth_rate_limit_prune_scope(text, timestamptz, integer) TO %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.auth_rate_limit_prune_scope(text, timestamptz, integer)') IS NOT NULL \gexec
SELECT format(
  'GRANT EXECUTE ON FUNCTION app.auth_rate_limit_prune_key(text, text, timestamptz) TO %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.auth_rate_limit_prune_key(text, text, timestamptz)') IS NOT NULL \gexec
SELECT format(
  'GRANT EXECUTE ON FUNCTION app.auth_rate_limit_count(text, text) TO %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.auth_rate_limit_count(text, text)') IS NOT NULL \gexec
SELECT format(
  'GRANT EXECUTE ON FUNCTION app.auth_rate_limit_record(text, text) TO %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.auth_rate_limit_record(text, text)') IS NOT NULL \gexec
-- 0258: all listed auth routes stamp bootstrap and therefore stay on this bare NOINHERIT login.
-- The functions repeat their own exact-key predicates; do not replace this with table privileges.
WITH bootstrap_auth_accessor(signature) AS (
  VALUES
    ('app.auth_channel_link_replace_secret(uuid, text, text, timestamptz)'),
    ('app.auth_channel_link_read_secret(text, text)'),
    ('app.auth_channel_link_mark_secret_used(uuid)'),
    ('app.auth_channel_link_lock_unused_secret(uuid)'),
    ('app.auth_channel_link_mark_secret_used_if_unused(uuid)'),
    ('app.auth_email_setup_revoke_active(uuid, text)'),
    ('app.auth_email_setup_insert(uuid, text, text, timestamptz, text, uuid)'),
    ('app.auth_email_setup_delete(uuid)'),
    ('app.auth_email_setup_read(text)'),
    ('app.auth_email_setup_mark_used(uuid)'),
    ('app.auth_oauth_list_user_providers(uuid)'),
    ('app.auth_oauth_find_user(text, text)'),
    ('app.auth_oauth_upsert_binding(uuid, text, text, text)'),
    ('app.auth_login_token_create(text, uuid, text, timestamptz)'),
    ('app.auth_login_token_read(text)'),
    ('app.auth_login_token_expire_past()'),
    ('app.auth_login_token_confirm(text)'),
    ('app.auth_login_token_mark_session_issued(text)'),
    ('app.auth_phone_bind_lock_channel_binding(text, text)'),
    ('app.auth_phone_bind_upsert_channel_binding(uuid, text, text)'),
    ('app.passkey_issue_challenge(uuid, text, uuid, text, text, text, timestamptz)'),
    ('app.passkey_read_challenge(uuid, text)'),
    ('app.passkey_read_credential(text)'),
    ('app.passkey_complete_authentication(uuid, text, bigint, bigint, text, boolean)')
)
SELECT format(
  'GRANT EXECUTE ON FUNCTION %s TO %I',
  signature,
  :'d3_4_bootstrap_base_role'
)
FROM bootstrap_auth_accessor
WHERE to_regprocedure(signature) IS NOT NULL
\gexec
GRANT EXECUTE ON FUNCTION app.email_auth_find_email_send_cooldown(uuid, text) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_auth_delete_email_challenges_for_user(uuid) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_auth_insert_email_challenge(uuid, text, text, bigint) TO :"d3_4_bootstrap_base_role";
-- C-2 step 4 (0249): see the matching REVOKE above for why this is WHERE-guarded and why it needs
-- the same bootstrap reachability as email_auth_insert_email_challenge immediately above it.
SELECT format(
  'GRANT EXECUTE ON FUNCTION app.email_auth_set_email_challenge_purpose(uuid, text) TO %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.email_auth_set_email_challenge_purpose(uuid, text)') IS NOT NULL \gexec
GRANT EXECUTE ON FUNCTION app.email_auth_delete_email_challenge_by_id(uuid) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_auth_upsert_email_send_cooldown(uuid, text) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_auth_find_email_challenge_for_confirm(uuid, uuid) TO :"d3_4_bootstrap_base_role";
-- 0247 renamed this from an absolute-set accessor to an atomic increment; guarded the same way as
-- the 0246 booking pair above so a DB that predates 0247 is a no-op rather than a FATAL.
SELECT format(
  'GRANT EXECUTE ON FUNCTION app.email_auth_increment_email_challenge_attempts(uuid) TO %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.email_auth_increment_email_challenge_attempts(uuid)') IS NOT NULL \gexec
GRANT EXECUTE ON FUNCTION app.email_auth_find_email_owner_conflict(uuid, text) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_auth_verify_user_email(uuid, text) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_auth_find_email_challenge_for_consume(uuid, uuid) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_auth_find_latest_email_challenge_for_user(uuid, bigint) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_auth_find_latest_pending_email_challenge_for_user(uuid, bigint) TO :"d3_4_bootstrap_base_role";
-- D27-C fix round 2 (migration 0363) / round 3 (migration 0370): see the matching REVOKE above.
SELECT format(
  'GRANT EXECUTE ON FUNCTION app.email_auth_enqueue_otp_delivery(uuid, uuid) TO %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.email_auth_enqueue_otp_delivery(uuid, uuid)') IS NOT NULL \gexec
-- D27-C fix round 2 (migration 0363): see the matching REVOKE above.
SELECT format(
  'GRANT EXECUTE ON FUNCTION app.email_auth_set_email_challenge_delivery_code(uuid, text) TO %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.email_auth_set_email_challenge_delivery_code(uuid, text)') IS NOT NULL \gexec
-- 0248 (C-2 decaying OTP lockout): see the matching REVOKE above for why this needs the same
-- bootstrap reachability as its email_auth_find_* siblings immediately above it.
SELECT format(
  'GRANT EXECUTE ON FUNCTION app.email_auth_find_email_otp_lock(uuid) TO %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.email_auth_find_email_otp_lock(uuid)') IS NOT NULL \gexec
-- 0248 (C-2 decaying OTP lockout), write pair: see the matching REVOKE above for why
-- resetEmailOtpLockoutForUser()/registerEmailOtpLockoutForUser() need the same bootstrap
-- reachability as email_auth_find_email_otp_lock immediately above.
SELECT format(
  'GRANT EXECUTE ON FUNCTION app.email_auth_register_email_otp_lockout(uuid) TO %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.email_auth_register_email_otp_lockout(uuid)') IS NOT NULL \gexec
SELECT format(
  'GRANT EXECUTE ON FUNCTION app.email_auth_reset_email_otp_lockout(uuid) TO %I',
  :'d3_4_bootstrap_base_role'
)
WHERE to_regprocedure('app.email_auth_reset_email_otp_lockout(uuid)') IS NOT NULL \gexec

-- Proven locked TEST bootstrap read surface, 2026-07-14 D3.4:
-- session identity, first staff membership lookup, and public booking tenant resolution only.
-- Do not add clinical/media/content/full-settings tables here; those must run after SET ROLE
-- app_staff/app_patient or through a narrow accessor.
GRANT SELECT ON TABLE public.be_organization_members TO :"d3_4_bootstrap_base_role";
GRANT SELECT ON TABLE public.platform_users TO :"d3_4_bootstrap_base_role";
-- D15b/4: public.platform_users now carries FORCE RLS; the plain table SELECT above is necessary
-- but no longer sufficient on its own (row visibility is policy-gated). Membership in
-- app_identity_bootstrap (deploy/postgres/d15b4-platform-users-identity-bootstrap-role.sql, applied
-- earlier in this same deploy) is what lets this bare bootstrap login actually see rows for
-- login-by-phone/email/oauth candidate lookup and the shared identity write engine, before any
-- session/org principal exists.
GRANT app_identity_bootstrap TO :"d3_4_bootstrap_base_role";
GRANT SELECT ON TABLE public.user_channel_bindings TO :"d3_4_bootstrap_base_role";
GRANT SELECT ON TABLE public.be_external_entity_mappings TO :"d3_4_bootstrap_base_role";
GRANT SELECT ON TABLE public.be_specialist_service_availability TO :"d3_4_bootstrap_base_role";
GRANT SELECT ON TABLE public.be_branches TO :"d3_4_bootstrap_base_role";
GRANT SELECT ON TABLE public.be_clinic_services TO :"d3_4_bootstrap_base_role";
GRANT SELECT ON TABLE public.be_specialists TO :"d3_4_bootstrap_base_role";

-- D2 FB#1 phone/contact write surface, composed here intentionally.
GRANT SELECT, INSERT, UPDATE ON TABLE public.user_phone_history TO :"d3_4_bootstrap_base_role";
GRANT SELECT, INSERT, UPDATE ON TABLE public.platform_user_contacts TO :"d3_4_bootstrap_base_role";

WITH RECURSIVE bootstrap_role AS (
  SELECT
    oid,
    rolcanlogin,
    rolsuper,
    rolcreatedb,
    rolcreaterole,
    rolinherit,
    rolreplication,
    rolbypassrls
  FROM pg_roles
  WHERE rolname = :'d3_4_bootstrap_base_role'
), direct_memberships AS (
  SELECT membership.*
  FROM pg_auth_members membership
  JOIN bootstrap_role ON bootstrap_role.oid = membership.member
), reachable_roles(roleid) AS (
  SELECT roleid FROM direct_memberships
  UNION
  SELECT membership.roleid
  FROM pg_auth_members membership
  JOIN reachable_roles reachable ON reachable.roleid = membership.member
), protected_tables AS (
  SELECT relation.relowner
  FROM pg_class relation
  WHERE relation.oid IN (
    'public.app_runtime_settings'::regclass,
    'public.system_settings'::regclass,
    'public.be_payment_provider_events'::regclass,
    'public.be_payment_intents'::regclass
  )
), runtime_accessors AS (
  SELECT procedure.oid, procedure.proowner, procedure.proacl
  FROM pg_proc procedure
  WHERE procedure.oid IN (
    'app.read_public_runtime_setting(text,text)'::regprocedure,
    'app.read_webapp_server_runtime_setting(text,text)'::regprocedure,
    'app.resolve_public_booking_organization(uuid,uuid,uuid)'::regprocedure,
    'app.resolve_public_organization_slug(text)'::regprocedure,
    'app.resolve_public_organization_by_slug(text)'::regprocedure,
    'app.resolve_payment_webhook_organization(text,text,text)'::regprocedure
  )
)
SELECT 1 / (
  (
    SELECT
      rolcanlogin
      AND NOT rolsuper
      AND NOT rolcreatedb
      AND NOT rolcreaterole
      AND NOT rolinherit
      AND NOT rolreplication
      AND NOT rolbypassrls
    FROM bootstrap_role
  )
  AND (SELECT count(*) = 2 FROM direct_memberships)
  AND EXISTS (
    SELECT 1
    FROM direct_memberships membership
    JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
    WHERE granted_role.rolname = 'app_patient'
      AND NOT membership.admin_option
      AND NOT membership.inherit_option
      AND membership.set_option
  )
  -- D15b/4: this bootstrap login is also a member of app_identity_bootstrap (GRANT above), the
  -- pre-session identity-resolution role platform_users_identity_bootstrap_* policies check via
  -- pg_has_role -- same shape as the app_patient membership this gate already required.
  AND EXISTS (
    SELECT 1
    FROM direct_memberships membership
    JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
    WHERE granted_role.rolname = 'app_identity_bootstrap'
      AND NOT membership.admin_option
      AND NOT membership.inherit_option
      AND membership.set_option
  )
  AND NOT EXISTS (
    SELECT 1
    FROM reachable_roles reachable
    JOIN pg_roles granted_role ON granted_role.oid = reachable.roleid
    WHERE granted_role.rolname NOT IN ('app_patient', 'app_identity_bootstrap')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM protected_tables protected
    CROSS JOIN bootstrap_role
    WHERE pg_has_role(bootstrap_role.oid, protected.relowner, 'MEMBER')
  )
  AND NOT has_table_privilege(
    :'d3_4_bootstrap_base_role', 'public.app_runtime_settings', 'SELECT'
  )
  AND NOT has_table_privilege(
    :'d3_4_bootstrap_base_role', 'public.system_settings', 'SELECT'
  )
  AND NOT has_table_privilege(
    :'d3_4_bootstrap_base_role', 'public.be_payment_provider_events', 'SELECT'
  )
  AND NOT has_table_privilege(
    :'d3_4_bootstrap_base_role', 'public.be_payment_intents', 'SELECT'
  )
  AND has_function_privilege(
    :'d3_4_bootstrap_base_role',
    'app.read_public_runtime_setting(text,text)',
    'EXECUTE'
  )
  AND has_function_privilege(
    :'d3_4_bootstrap_base_role',
    'app.read_webapp_server_runtime_setting(text,text)',
    'EXECUTE'
  )
  AND has_function_privilege(
    :'d3_4_bootstrap_base_role',
    'app.read_saas_billing_payment_provider()',
    'EXECUTE'
  )
  AND has_function_privilege(
    :'d3_4_bootstrap_base_role',
    'app.resolve_public_booking_organization(uuid,uuid,uuid)',
    'EXECUTE'
  )
  AND has_function_privilege(
    :'d3_4_bootstrap_base_role',
    'app.resolve_public_organization_slug(text)',
    'EXECUTE'
  )
  AND has_function_privilege(
    :'d3_4_bootstrap_base_role',
    'app.resolve_public_organization_by_slug(text)',
    'EXECUTE'
  )
  AND has_function_privilege(
    :'d3_4_bootstrap_base_role',
    'app.resolve_payment_webhook_organization(text,text,text)',
    'EXECUTE'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM runtime_accessors accessor
    CROSS JOIN bootstrap_role
    WHERE pg_has_role(bootstrap_role.oid, accessor.proowner, 'MEMBER')
  )
  AND 6 = (
    SELECT count(*)
    FROM runtime_accessors accessor
    CROSS JOIN bootstrap_role
    CROSS JOIN LATERAL aclexplode(
      COALESCE(accessor.proacl, acldefault('f', accessor.proowner))
    ) privilege
    WHERE privilege.privilege_type = 'EXECUTE'
      AND privilege.grantee = bootstrap_role.oid
      AND NOT privilege.is_grantable
  )
  AND 4 = (
    SELECT count(*)
    FROM runtime_accessors accessor
    CROSS JOIN LATERAL aclexplode(
      COALESCE(accessor.proacl, acldefault('f', accessor.proowner))
    ) privilege
    WHERE accessor.oid IN (
        'app.resolve_public_booking_organization(uuid,uuid,uuid)'::regprocedure,
        'app.resolve_public_organization_slug(text)'::regprocedure,
        'app.resolve_public_organization_by_slug(text)'::regprocedure,
        'app.resolve_payment_webhook_organization(text,text,text)'::regprocedure
      )
      AND privilege.privilege_type = 'EXECUTE'
      AND privilege.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'app_patient')
      AND NOT privilege.is_grantable
  )
  AND NOT EXISTS (
    SELECT 1
    FROM runtime_accessors accessor
    CROSS JOIN bootstrap_role
    CROSS JOIN LATERAL aclexplode(
      COALESCE(accessor.proacl, acldefault('f', accessor.proowner))
    ) privilege
    WHERE privilege.privilege_type <> 'EXECUTE'
      OR privilege.is_grantable
      OR (
        privilege.grantee NOT IN (accessor.proowner, bootstrap_role.oid)
        AND NOT (
          accessor.oid IN (
            'app.resolve_public_booking_organization(uuid,uuid,uuid)'::regprocedure,
            'app.resolve_public_organization_slug(text)'::regprocedure,
            'app.resolve_public_organization_by_slug(text)'::regprocedure,
            'app.resolve_payment_webhook_organization(text,text,text)'::regprocedure
          )
          AND privilege.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'app_patient')
        )
      )
  )
)::int AS d3_4_bootstrap_base_role_exact_topology_verified;

\echo 'D3.4 bootstrap/base-login grants UP complete.'
