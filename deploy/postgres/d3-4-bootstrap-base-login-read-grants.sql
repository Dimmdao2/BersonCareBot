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
REVOKE EXECUTE ON FUNCTION app.current_patient_has_password_credentials() FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.current_patient_has_web_oauth_binding() FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_password_register_pending(text, text, text, text, text, text) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_password_delete_unverified_registration(uuid) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_password_find_user_id_by_email_challenge(uuid) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.email_password_find_login_candidate(text) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.create_specialist_signup_intent(uuid, text, text, text) FROM :"d3_4_bootstrap_base_role";
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
REVOKE EXECUTE ON FUNCTION app.resolve_public_booking_organization(uuid, uuid, uuid) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.resolve_public_organization_slug(text) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.resolve_public_organization_by_slug(text) FROM :"d3_4_bootstrap_base_role";
REVOKE EXECUTE ON FUNCTION app.resolve_payment_webhook_organization(text, text, text) FROM :"d3_4_bootstrap_base_role";

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
GRANT EXECUTE ON FUNCTION app.current_patient_has_password_credentials() TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.current_patient_has_web_oauth_binding() TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_password_register_pending(text, text, text, text, text, text) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_password_delete_unverified_registration(uuid) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_password_find_user_id_by_email_challenge(uuid) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.email_password_find_login_candidate(text) TO :"d3_4_bootstrap_base_role";
GRANT EXECUTE ON FUNCTION app.create_specialist_signup_intent(uuid, text, text, text) TO :"d3_4_bootstrap_base_role";
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
  AND (SELECT count(*) = 1 FROM direct_memberships)
  AND EXISTS (
    SELECT 1
    FROM direct_memberships membership
    JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
    WHERE granted_role.rolname = 'app_patient'
      AND NOT membership.admin_option
      AND NOT membership.inherit_option
      AND membership.set_option
  )
  AND NOT EXISTS (
    SELECT 1
    FROM reachable_roles reachable
    JOIN pg_roles granted_role ON granted_role.oid = reachable.roleid
    WHERE granted_role.rolname <> 'app_patient'
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
