-- TEMPORARY LOCAL MIGRATION NUMBER 0356
--
-- Login is dead on both doors (owner report 2026-08-04). Cause 1 of 2: fourteen-plus SECURITY
-- DEFINER accessors that touch `public.platform_users` are owned by the migrator role
-- (`bcb_webapp_dev_user` in DEV / `bersoncarebot_test` on TEST), not `app_owner`. Under
-- `platform_users` FORCE RLS (landed with D15b/4), a SECURITY DEFINER function's effective
-- privileges are its OWNER's, not BYPASSRLS unless the owner itself is BYPASSRLS. The migrator role
-- is not a member of `app_identity_bootstrap` (the role the `platform_users_identity_bootstrap_select`
-- policy checks), so every one of these functions silently sees zero rows instead of raising --
-- reproduced live: `app.email_otp_public_find_user_by_email('dimmdao@yandex.ru')` returns 0 rows
-- under `SET ROLE bcb_webapp_dev_user` even though the row exists, while the sibling
-- `app.find_platform_user_ids_by_any_confirmed_email` (already `app_owner`-owned) finds it. Public
-- email login therefore always answers the anti-enumeration "code sent" response and never sends.
--
-- Fix: re-home these functions on `app_owner` (NOLOGIN, BYPASSRLS, zero members, not
-- request-reachable) -- the exact idiom already used for their 24 siblings
-- (`app.find_platform_user_ids_by_any_confirmed_email`, `app.password_login_complete`, etc.; see
-- migration 0240's header for the canonical shape). Nothing in any function BODY changes here --
-- ownership only.
--
-- Selection query (re-run to confirm this is still the exact set before repeating this fix):
--   SELECT p.proname, p.proowner::regrole::text
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'app' AND p.prosecdef
--     AND pg_get_functiondef(p.oid) ILIKE '%platform_users%';
--
-- Reviewed for BYPASSRLS safety (owner note, 2026-08-04): every function below either (a) narrows
-- by an exact-match argument (email/user id) the same way the already-`app_owner` siblings do, or
-- (b) scopes to the CURRENT session's own identity via `app.current_patient_user_id()` /
-- `app.current_integrator_user_id()` / `app.require_staff_security_self_user_id()`, or (c) is a
-- trigger function bound to the triggering row (not independently callable with an arbitrary id).
-- `app.list_platform_organization_members(p_organization_id)` is scoped by its organization_id
-- argument and is called ONLY from the `platform.operations` API boundary
-- (`requirePlatformOperationsApiContext`), a platform-wide (cross-org, by design) capability --
-- granting BYPASSRLS here does not widen what that boundary already allows. None of the 15 read or
-- write outside the shape their own arguments/session identity already select, so none are excluded.
DO $accessor_owner$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    ALTER FUNCTION app.bump_platform_user_session_epoch_self() OWNER TO app_owner;
    -- These three capabilities are owned by closure overlays rather than the Drizzle chain. They
    -- already existed on the old long-lived TEST when 0356 was authored, but do not exist yet on a
    -- fresh PROD-copy transition; their overlays create and pin them after migrations.
    IF to_regprocedure('app.email_auth_verify_user_email(uuid,text)') IS NOT NULL THEN
      ALTER FUNCTION app.email_auth_verify_user_email(uuid, text) OWNER TO app_owner;
    END IF;
    ALTER FUNCTION app.email_otp_public_delete_unverified_registration(uuid) OWNER TO app_owner;
    IF to_regprocedure('app.email_otp_public_find_or_create_user(text)') IS NOT NULL THEN
      ALTER FUNCTION app.email_otp_public_find_or_create_user(text) OWNER TO app_owner;
    END IF;
    ALTER FUNCTION app.email_otp_public_find_user_by_email(text) OWNER TO app_owner;
    ALTER FUNCTION app.email_otp_public_register_patient(text, text, text, text) OWNER TO app_owner;
    IF to_regprocedure('app.email_password_delete_unverified_registration(uuid)') IS NOT NULL THEN
      ALTER FUNCTION app.email_password_delete_unverified_registration(uuid) OWNER TO app_owner;
    END IF;
    ALTER FUNCTION app.email_password_find_login_candidate(text) OWNER TO app_owner;
    ALTER FUNCTION app.email_password_register_pending(text, text, text, text, text, text) OWNER TO app_owner;
    ALTER FUNCTION app.is_platform_registration_analytics_user_excluded(uuid) OWNER TO app_owner;
    ALTER FUNCTION app.list_platform_organization_members(uuid) OWNER TO app_owner;
    ALTER FUNCTION app.patient_done_reminder_occurrence(text) OWNER TO app_owner;
    ALTER FUNCTION app.patient_skip_reminder_occurrence(uuid, text, text) OWNER TO app_owner;
    ALTER FUNCTION app.patient_snooze_reminder_occurrence(uuid, text, integer) OWNER TO app_owner;
    ALTER FUNCTION app.propagate_staff_session_version_to_session_epoch() OWNER TO app_owner;
  END IF;
END
$accessor_owner$;
