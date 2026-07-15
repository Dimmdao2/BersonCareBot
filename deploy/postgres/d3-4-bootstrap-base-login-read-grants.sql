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
--
-- Rollback:
--   Re-run with -v d3_4_bootstrap_grants_down=1.

\set ON_ERROR_STOP on
\pset pager off

\if :{?d3_4_bootstrap_base_role}
\else
\echo 'FATAL: missing required psql variable d3_4_bootstrap_base_role.'
SELECT 1 / 0 AS d3_4_bootstrap_base_role_missing;
\endif

SELECT 1 / (
  length(:'d3_4_bootstrap_base_role') > 0
  AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'d3_4_bootstrap_base_role')
)::int AS d3_4_bootstrap_base_role_exists;

SELECT 1 / (
  EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = :'d3_4_bootstrap_base_role'
      AND rolbypassrls = false
  )
)::int AS d3_4_bootstrap_base_role_no_rls_bypass;

SELECT 1 / (
  NOT pg_has_role(:'d3_4_bootstrap_base_role', 'app_staff', 'MEMBER')
)::int AS d3_4_bootstrap_base_role_not_staff_member;

SELECT 1 / (
  pg_has_role(:'d3_4_bootstrap_base_role', 'app_patient', 'MEMBER')
)::int AS d3_4_bootstrap_base_role_is_patient_member;

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
REVOKE EXECUTE ON FUNCTION app.current_org_id() FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.current_patient_user_id() FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.current_integrator_user_id() FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.close_active_user_phone_history(uuid) FROM :"d3_4_bootstrap_base_role";
\endif
REVOKE EXECUTE ON FUNCTION app.is_staff() FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.get_public_config_bool(text) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.current_patient_has_password_credentials() FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.current_patient_has_web_oauth_binding() FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_password_register_pending(text, text, text, text) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_password_delete_unverified_registration(uuid) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_password_find_user_id_by_email_challenge(uuid) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.create_specialist_signup_intent(uuid, uuid, text, text, text) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.get_pending_specialist_signup_intent(uuid, uuid) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.get_specialist_signup_intent_by_challenge(uuid) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.provision_specialist_owner(uuid, uuid) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.lookup_pending_org_invite(text) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.accept_org_invite(text, uuid, text) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_otp_public_find_or_create_user(text) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_otp_public_find_latest_email_challenge_by_email(text, bigint) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_otp_public_find_email_send_cooldown_by_email(text) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_auth_find_email_send_cooldown(uuid, text) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_auth_delete_email_challenges_for_user(uuid) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_auth_insert_email_challenge(uuid, text, text, bigint) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_auth_delete_email_challenge_by_id(uuid) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_auth_upsert_email_send_cooldown(uuid, text) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_auth_find_email_challenge_for_confirm(uuid, uuid) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_auth_update_email_challenge_attempts(uuid, integer) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_auth_find_email_owner_conflict(uuid, text) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_auth_verify_user_email(uuid, text) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_auth_find_email_challenge_for_consume(uuid, uuid) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_auth_find_latest_email_challenge_for_user(uuid, bigint) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_auth_find_latest_pending_email_challenge_for_user(uuid, bigint) FROM :"d3_4_bootstrap_base_role";

REVOKE SELECT ON TABLE public.be_organization_members FROM :"d3_4_bootstrap_base_role";
REVOKE SELECT ON TABLE public.platform_users FROM :"d3_4_bootstrap_base_role";
REVOKE SELECT ON TABLE public.user_channel_bindings FROM :"d3_4_bootstrap_base_role";
REVOKE SELECT ON TABLE public.be_external_entity_mappings FROM :"d3_4_bootstrap_base_role";
REVOKE SELECT ON TABLE public.be_specialist_service_availability FROM :"d3_4_bootstrap_base_role";
REVOKE SELECT ON TABLE public.be_branches FROM :"d3_4_bootstrap_base_role";
REVOKE SELECT ON TABLE public.be_clinic_services FROM :"d3_4_bootstrap_base_role";
REVOKE SELECT ON TABLE public.be_specialists FROM :"d3_4_bootstrap_base_role";

REVOKE SELECT, INSERT, UPDATE ON TABLE public.user_phone_history FROM :"d3_4_bootstrap_base_role";
REVOKE SELECT, INSERT, UPDATE ON TABLE public.platform_user_contacts FROM :"d3_4_bootstrap_base_role";

REVOKE USAGE ON SCHEMA app FROM :"d3_4_bootstrap_base_role";
REVOKE USAGE ON SCHEMA public FROM :"d3_4_bootstrap_base_role";
\echo 'D3.4 bootstrap/base-login grants DOWN complete.'
\quit
\endif

GRANT USAGE ON SCHEMA public, app TO :"d3_4_bootstrap_base_role";

\if :d3_4_has_p2_b_context_bundle
GRANT EXECUTE ON FUNCTION app.release_principal_context() TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.current_org_id() TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.current_patient_user_id() TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.current_integrator_user_id() TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.close_active_user_phone_history(uuid) TO :"d3_4_bootstrap_base_role";
\endif
GRANT EXECUTE ON FUNCTION app.is_staff() TO :"d3_4_bootstrap_base_role";

-- Narrow SECURITY DEFINER pre-auth surface. These functions own their validation and expose only
-- the bootstrap operations used by email auth, invite acceptance, and specialist signup. Direct
-- table grants for their sensitive backing tables remain absent from the base login.
GRANT EXECUTE ON FUNCTION app.get_public_config_bool(text) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.current_patient_has_password_credentials() TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.current_patient_has_web_oauth_binding() TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_password_register_pending(text, text, text, text) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_password_delete_unverified_registration(uuid) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_password_find_user_id_by_email_challenge(uuid) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.create_specialist_signup_intent(uuid, uuid, text, text, text) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.get_pending_specialist_signup_intent(uuid, uuid) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.get_specialist_signup_intent_by_challenge(uuid) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.provision_specialist_owner(uuid, uuid) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.lookup_pending_org_invite(text) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.accept_org_invite(text, uuid, text) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_otp_public_find_or_create_user(text) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_otp_public_find_latest_email_challenge_by_email(text, bigint) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_otp_public_find_email_send_cooldown_by_email(text) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_auth_find_email_send_cooldown(uuid, text) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_auth_delete_email_challenges_for_user(uuid) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_auth_insert_email_challenge(uuid, text, text, bigint) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_auth_delete_email_challenge_by_id(uuid) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_auth_upsert_email_send_cooldown(uuid, text) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_auth_find_email_challenge_for_confirm(uuid, uuid) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_auth_update_email_challenge_attempts(uuid, integer) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_auth_find_email_owner_conflict(uuid, text) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_auth_verify_user_email(uuid, text) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_auth_find_email_challenge_for_consume(uuid, uuid) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_auth_find_latest_email_challenge_for_user(uuid, bigint) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_auth_find_latest_pending_email_challenge_for_user(uuid, bigint) TO :"d3_4_bootstrap_base_role";

-- Proven locked TEST bootstrap read surface, 2026-07-14 D3.4:
-- session identity, first staff membership lookup, and public booking tenant resolution only.
-- Do not add clinical/media/content/full-settings tables here; those must run after SET ROLE
-- app_staff/app_patient or through a narrow accessor.
GRANT SELECT ON TABLE public.be_organization_members TO :"d3_4_bootstrap_base_role";
GRANT SELECT ON TABLE public.platform_users TO :"d3_4_bootstrap_base_role";
GRANT SELECT ON TABLE public.user_channel_bindings TO :"d3_4_bootstrap_base_role";
GRANT SELECT ON TABLE public.be_external_entity_mappings TO :"d3_4_bootstrap_base_role";
GRANT SELECT ON TABLE public.be_specialist_service_availability TO :"d3_4_bootstrap_base_role";
GRANT SELECT ON TABLE public.be_branches TO :"d3_4_bootstrap_base_role";
GRANT SELECT ON TABLE public.be_clinic_services TO :"d3_4_bootstrap_base_role";
GRANT SELECT ON TABLE public.be_specialists TO :"d3_4_bootstrap_base_role";

-- D2 FB#1 phone/contact write surface, composed here intentionally.
GRANT SELECT, INSERT, UPDATE ON TABLE public.user_phone_history TO :"d3_4_bootstrap_base_role";
GRANT SELECT, INSERT, UPDATE ON TABLE public.platform_user_contacts TO :"d3_4_bootstrap_base_role";

\echo 'D3.4 bootstrap/base-login grants UP complete.'
