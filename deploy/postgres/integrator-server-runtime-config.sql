-- Pin the generic integrator server-runtime accessor to the protected owner.
-- The exact API base login is normalized to NOINHERIT and receives EXECUTE only. It remains able
-- to SET ROLE for classified locked principals, but cannot ambiently inherit their table grants.

\set ON_ERROR_STOP on
\pset pager off

\if :{?integrator_runtime_config_role}
\else
\echo 'FATAL: missing integrator_runtime_config_role.'
SELECT 1 / 0 AS integrator_runtime_config_role_missing;
\endif

\if :{?integrator_runtime_config_grants_down}
REVOKE EXECUTE ON FUNCTION app.read_global_server_runtime_setting(text)
  FROM :"integrator_runtime_config_role";
REVOKE EXECUTE ON FUNCTION app.read_integrator_provider_runtime_setting(text)
  FROM :"integrator_runtime_config_role";
REVOKE EXECUTE ON FUNCTION app.read_integrator_smtp_outbound_setting()
  FROM :"integrator_runtime_config_role";
REVOKE EXECUTE ON FUNCTION app.record_global_email_delivery_attempt(
  text, text, text, text, text, integer, text, jsonb, timestamptz
) FROM :"integrator_runtime_config_role";
REVOKE EXECUTE ON FUNCTION app.read_integrator_auth_channel_setting(text)
  FROM :"integrator_runtime_config_role";
REVOKE EXECUTE ON FUNCTION app.read_integrator_platform_integration_availability()
  FROM :"integrator_runtime_config_role";
REVOKE EXECUTE ON FUNCTION app.open_or_touch_operator_incident(text, text, text, text, text)
  FROM :"integrator_runtime_config_role";
REVOKE EXECUTE ON FUNCTION app.read_integrator_runtime_setting(text)
  FROM :"integrator_runtime_config_role";
REVOKE EXECUTE ON FUNCTION app.read_integrator_google_calendar_setting(text, uuid)
  FROM :"integrator_runtime_config_role";
REVOKE EXECUTE ON FUNCTION app.read_integrator_clinic_delivery_credential(text, uuid)
  FROM :"integrator_runtime_config_role";
REVOKE EXECUTE ON FUNCTION app.read_operator_health_probe_config()
  FROM :"integrator_runtime_config_role";
REVOKE EXECUTE ON FUNCTION app.read_operational_verbose_log_flag()
  FROM :"integrator_runtime_config_role";
REVOKE EXECUTE ON FUNCTION app.release_principal_context()
  FROM :"integrator_runtime_config_role";
\echo 'Integrator server-runtime config grants DOWN complete.'
\quit
\endif

SELECT 1 / (
  EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = :'integrator_runtime_config_role'
      AND rolcanlogin
      AND NOT rolsuper
      AND NOT rolbypassrls
  )
  AND EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'app_owner'
      AND NOT rolcanlogin
      AND rolbypassrls
  )
  AND NOT pg_has_role(:'integrator_runtime_config_role', 'app_owner', 'MEMBER')
  -- D15b/4 (deploy/postgres/integrator-login-public-identity-grants.sql) also grants this role
  -- app_identity_bootstrap for the platform_users identity-bootstrap RLS policy branch -- a fourth
  -- legitimate direct membership alongside app_staff/app_patient/app_worker.
  AND 4 = (
    SELECT count(*)
    FROM pg_auth_members membership
    JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
    JOIN pg_roles member_role ON member_role.oid = membership.member
    WHERE member_role.rolname = :'integrator_runtime_config_role'
      AND granted_role.rolname IN ('app_staff', 'app_patient', 'app_worker', 'app_identity_bootstrap')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
    JOIN pg_roles member_role ON member_role.oid = membership.member
    WHERE member_role.rolname = :'integrator_runtime_config_role'
      AND (
        granted_role.rolname NOT IN ('app_staff', 'app_patient', 'app_worker', 'app_identity_bootstrap')
        OR membership.admin_option
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname IN ('app_runtime_settings', 'system_settings')
      AND pg_has_role(:'integrator_runtime_config_role', relation.relowner, 'MEMBER')
  )
  AND to_regprocedure('app.read_global_server_runtime_setting(text)') IS NOT NULL
  AND to_regprocedure('app.read_integrator_provider_runtime_setting(text)') IS NOT NULL
  AND to_regprocedure('app.read_integrator_smtp_outbound_setting()') IS NOT NULL
  AND to_regprocedure(
    'app.record_global_email_delivery_attempt(text,text,text,text,text,integer,text,jsonb,timestamptz)'
  ) IS NOT NULL
  AND to_regprocedure('app.read_integrator_auth_channel_setting(text)') IS NOT NULL
  AND to_regprocedure('app.read_integrator_platform_integration_availability()') IS NOT NULL
  AND to_regprocedure('app.open_or_touch_operator_incident(text,text,text,text,text)') IS NOT NULL
  AND to_regprocedure('app.install_signed_context(text,integer,bigint,uuid,uuid,bigint,text)') IS NOT NULL
  AND to_regprocedure('app.release_principal_context()') IS NOT NULL
)::int AS integrator_server_runtime_config_preflight;

ALTER ROLE :"integrator_runtime_config_role" NOINHERIT;
SELECT format(
  'GRANT %I TO %I WITH INHERIT FALSE, SET TRUE',
  granted_role.rolname,
  member_role.rolname
)
FROM pg_auth_members membership
JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
JOIN pg_roles member_role ON member_role.oid = membership.member
WHERE member_role.rolname = :'integrator_runtime_config_role'
  AND granted_role.rolname IN ('app_staff', 'app_patient', 'app_worker')
ORDER BY granted_role.rolname
\gexec
REVOKE SELECT ON TABLE public.app_runtime_settings, public.system_settings
  FROM :"integrator_runtime_config_role";
REVOKE INSERT ON TABLE integrator.delivery_attempt_logs
  FROM :"integrator_runtime_config_role";
REVOKE USAGE ON SEQUENCE integrator.delivery_attempt_logs_id_seq
  FROM :"integrator_runtime_config_role";
GRANT SELECT ON TABLE public.app_runtime_settings TO app_owner;
ALTER FUNCTION app.read_global_server_runtime_setting(text) OWNER TO app_owner;
ALTER FUNCTION app.read_integrator_provider_runtime_setting(text) OWNER TO app_owner;
ALTER FUNCTION app.read_integrator_smtp_outbound_setting() OWNER TO app_owner;
ALTER FUNCTION app.record_global_email_delivery_attempt(
  text, text, text, text, text, integer, text, jsonb, timestamptz
) OWNER TO app_owner;
ALTER FUNCTION app.read_integrator_auth_channel_setting(text) OWNER TO app_owner;
ALTER FUNCTION app.read_integrator_platform_integration_availability() OWNER TO app_owner;
ALTER FUNCTION app.open_or_touch_operator_incident(text, text, text, text, text) OWNER TO app_owner;
ALTER FUNCTION app.read_integrator_runtime_setting(text) OWNER TO app_owner;
ALTER FUNCTION app.read_integrator_google_calendar_setting(text, uuid) OWNER TO app_owner;
ALTER FUNCTION app.read_integrator_clinic_delivery_credential(text, uuid) OWNER TO app_owner;
ALTER FUNCTION app.read_operator_health_probe_config() OWNER TO app_owner;
ALTER FUNCTION app.read_operational_verbose_log_flag() OWNER TO app_owner;

-- 0244_public_app_base_url_runtime_setting registered app_base_url in the projection at
-- audience='public' for the anonymous landing page. The unique index backing this projection is
-- (key, scope) WHERE organization_id IS NULL -- audience is NOT part of the key -- so that INSERT's
-- ON CONFLICT ... DO UPDATE overwrote the audience='server' row 0191/0230 depend on instead of
-- adding a second row (two rows for one key are impossible by construction: verified on TEST,
-- no key in app_runtime_settings carries more than one audience). CREATE OR REPLACE here (this file
-- already owns this function's ownership/grants and runs LAST, after 0230 is replayed by
-- rehydrate_post_restore_runtime_overlays/e1-webapp-runtime-config.sql earlier in the same closure)
-- widens the accessor to accept the row at EITHER audience. This is safe in this direction only:
-- a server-side caller reading a value already published to anonymous visitors adds no exposure --
-- app_base_url is literally in every visitor's address bar (0244's own disclosure note). The reverse
-- (a public accessor reading 'server' rows) is NOT done here and must not be done elsewhere. Every
-- other filter (scope, organization_id, the key allowlist) is unchanged, and only the already-narrow
-- integrator_runtime_config_role holds EXECUTE on this function (revoked from PUBLIC below), so the
-- widened read is not reachable by any other caller.
CREATE OR REPLACE FUNCTION app.read_global_server_runtime_setting(p_key text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT setting.value_json
  FROM public.app_runtime_settings AS setting
  WHERE p_key IN ('app_base_url', 'error_tracking_enabled', 'error_tracking_dsn')
    AND setting.key = p_key
    AND setting.scope = 'admin'
    AND setting.audience IN ('server', 'public')
    AND setting.organization_id IS NULL
  LIMIT 1
$function$;

REVOKE ALL ON FUNCTION app.read_global_server_runtime_setting(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_global_server_runtime_setting(text)
  FROM app_staff, app_patient, app_worker;

-- ---------------------------------------------------------------------------
-- Non-secret integrator runtime settings.
--
-- Found 2026-08-07: no integrator role holds SELECT on public.system_settings, nor EXECUTE on
-- app.current_org_id() which that table's RLS policy calls, so EVERY direct read of it from this
-- app was a hard 42501 -- always, under every principal. It was invisible in the TEST journal only
-- because nobody had exercised the handlers. Reproduced by replaying each reader against the TEST
-- build; all six failed. What that silently cost, per reader:
--   * admin_/doctor_ messenger id lists -> `resolveMessengerStaffAdmin failed, treating as
--     non-admin`: a doctor or admin writing to the Telegram/MAX bot was NOT recognised as staff;
--   * operator_health_alert_config -> reportOperatorFailure returned before dispatching, so
--     operator critical alerts were never delivered at all;
--   * notif_template:* -> patients received the hardcoded default text, never the clinic's edit;
--   * app_display_timezone -> silently pinned to the compiled default;
--   * integrator_linked_phone_source -> the admin phone-resolution policy was ignored.
-- Same capability shape as the provider accessor above: fixed key allow-list, admin scope, global
-- row, EXECUTE only for the narrow integrator runtime login. Deliberately separate from that
-- accessor because this one must never be able to return a provider secret.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.read_integrator_runtime_setting(p_key text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT setting.value_json
  FROM public.system_settings AS setting
  WHERE p_key IN (
      'integrator_linked_phone_source',
      'admin_telegram_ids',
      'admin_max_ids',
      'doctor_telegram_ids',
      'doctor_max_ids',
      'operator_health_alert_config',
      'admin_incident_alert_config',
      'app_display_timezone',
      'notif_template:created:patient',
      'notif_template:created:doctor',
      'notif_template:cancelled:patient',
      'notif_template:cancelled:doctor',
      'notif_template:rescheduled:patient',
      'notif_template:rescheduled:doctor'
    )
    AND setting.key = p_key
    AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1
$function$;

-- Google Calendar connection values. Kept apart from the non-secret accessor above because the
-- platform OAuth identity and the per-clinic refresh token ARE credentials. The organization
-- argument decides which half of the allow-list is reachable, so a global call can never reach a
-- clinic row and a clinic call can never reach the platform secret. Exact organization match only:
-- a clinic connection must never inherit another clinic's calendar (mirrors the read it replaces).
CREATE OR REPLACE FUNCTION app.read_integrator_google_calendar_setting(
  p_key text,
  p_organization_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT setting.value_json
  FROM public.system_settings AS setting
  WHERE (
      (p_organization_id IS NULL
        AND p_key IN ('google_client_id', 'google_client_secret', 'google_redirect_uri')
        AND setting.organization_id IS NULL)
      OR
      (p_organization_id IS NOT NULL
        AND p_key IN ('google_calendar_enabled', 'google_calendar_id', 'google_refresh_token')
        AND setting.organization_id = p_organization_id)
    )
    AND setting.key = p_key
    AND setting.scope = 'admin'
  LIMIT 1
$function$;

-- Operator health probe cadence and the verbose-log flag. Both are read by BOTH the operational
-- contours (scheduler / delivery worker, whose grants live in c4-operational-runtime.sql) and by
-- this app's own API route and webhooks under the base login, so the body is created here -- this
-- file runs before the C4 overlay -- and each side grants only itself.
CREATE OR REPLACE FUNCTION app.read_operator_health_probe_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT setting.value_json
  FROM public.system_settings AS setting
  WHERE setting.key = 'operator_health_probe_config'
    AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION app.read_operational_verbose_log_flag()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT COALESCE((
    SELECT lower(COALESCE(setting.value_json ->> 'value', '')) IN ('true', '1')
    FROM public.system_settings AS setting
    WHERE setting.key = 'debug_forward_to_admin'
      AND setting.scope = 'admin'
      AND setting.organization_id IS NULL
    LIMIT 1
  ), false)
$function$;

REVOKE ALL ON FUNCTION app.read_operator_health_probe_config() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_operator_health_probe_config()
  FROM app_staff, app_patient, app_worker;
REVOKE ALL ON FUNCTION app.read_operational_verbose_log_flag() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_operational_verbose_log_flag()
  FROM app_staff, app_patient, app_worker;

-- Clinic-owned delivery credentials (tariff branding: the clinic's own Telegram/MAX bot, SMTP or
-- SMSC key). Same 42501 as everything else above, and the caller swallows it, so a clinic that had
-- paid for branding silently kept sending through the platform sender. Exact organization row
-- only; the tariff-mechanic gate stays in the caller, which runs before this read.
CREATE OR REPLACE FUNCTION app.read_integrator_clinic_delivery_credential(
  p_key text,
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT setting.value_json
  FROM public.system_settings AS setting
  WHERE p_organization_id IS NOT NULL
    AND p_key IN (
      'clinic_smtp_outbound',
      'clinic_smsc_api_key',
      'clinic_telegram_bot_token',
      'clinic_max_bot_api_key'
    )
    AND setting.key = p_key
    AND setting.scope = 'admin'
    AND setting.organization_id = p_organization_id
  LIMIT 1
$function$;

REVOKE ALL ON FUNCTION app.read_integrator_clinic_delivery_credential(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_integrator_clinic_delivery_credential(text, uuid)
  FROM app_staff, app_patient, app_worker;
REVOKE ALL ON FUNCTION app.read_integrator_runtime_setting(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_integrator_runtime_setting(text)
  FROM app_staff, app_patient, app_worker;
REVOKE ALL ON FUNCTION app.read_integrator_google_calendar_setting(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_integrator_google_calendar_setting(text, uuid)
  FROM app_staff, app_patient, app_worker;
REVOKE ALL PRIVILEGES ON FUNCTION app.read_integrator_provider_runtime_setting(text)
  FROM :"integrator_runtime_config_role" CASCADE;
DO $provider_runtime_acl_scrub$
DECLARE
  v_grantee_oid oid;
  v_grantee_name text;
BEGIN
  FOR v_grantee_oid, v_grantee_name IN
    SELECT DISTINCT privilege.grantee, role.rolname
    FROM pg_proc AS procedure
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS privilege
    LEFT JOIN pg_roles AS role ON role.oid = privilege.grantee
    WHERE procedure.oid = 'app.read_integrator_provider_runtime_setting(text)'::regprocedure
      AND privilege.grantee <> procedure.proowner
  LOOP
    IF v_grantee_oid = 0 THEN
      EXECUTE
        'REVOKE ALL PRIVILEGES ON FUNCTION app.read_integrator_provider_runtime_setting(text) FROM PUBLIC CASCADE';
    ELSE
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON FUNCTION app.read_integrator_provider_runtime_setting(text) FROM %I CASCADE',
        v_grantee_name
      );
    END IF;
  END LOOP;
END
$provider_runtime_acl_scrub$;
REVOKE ALL ON FUNCTION app.read_integrator_provider_runtime_setting(text)
  FROM PUBLIC, app_staff, app_patient, app_worker;
-- CREATE OR REPLACE preserves an existing function ACL. Reset the restricted SMTP capability
-- exactly so stale/unknown explicit grantees and grants delegated by the runtime login cannot survive.
REVOKE ALL PRIVILEGES ON FUNCTION app.read_integrator_smtp_outbound_setting()
  FROM :"integrator_runtime_config_role" CASCADE;
DO $smtp_acl_scrub$
DECLARE
  v_grantee_oid oid;
  v_grantee_name text;
BEGIN
  FOR v_grantee_oid, v_grantee_name IN
    SELECT DISTINCT privilege.grantee, role.rolname
    FROM pg_proc AS procedure
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS privilege
    LEFT JOIN pg_roles AS role ON role.oid = privilege.grantee
    WHERE procedure.oid = 'app.read_integrator_smtp_outbound_setting()'::regprocedure
      AND privilege.grantee <> procedure.proowner
  LOOP
    IF v_grantee_oid = 0 THEN
      EXECUTE
        'REVOKE ALL PRIVILEGES ON FUNCTION app.read_integrator_smtp_outbound_setting() FROM PUBLIC CASCADE';
    ELSE
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON FUNCTION app.read_integrator_smtp_outbound_setting() FROM %I CASCADE',
        v_grantee_name
      );
    END IF;
  END LOOP;
END
$smtp_acl_scrub$;
REVOKE ALL ON FUNCTION app.read_integrator_smtp_outbound_setting() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_integrator_smtp_outbound_setting()
  FROM app_staff, app_patient, app_worker;
-- Reset the delivery-audit capability just as strictly: the exact API login gets EXECUTE only,
-- while direct table INSERT and sequence USAGE stay revoked above.
REVOKE ALL PRIVILEGES ON FUNCTION app.record_global_email_delivery_attempt(
  text, text, text, text, text, integer, text, jsonb, timestamptz
) FROM :"integrator_runtime_config_role" CASCADE;
DO $delivery_audit_acl_scrub$
DECLARE
  v_grantee_oid oid;
  v_grantee_name text;
BEGIN
  FOR v_grantee_oid, v_grantee_name IN
    SELECT DISTINCT privilege.grantee, role.rolname
    FROM pg_proc AS procedure
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS privilege
    LEFT JOIN pg_roles AS role ON role.oid = privilege.grantee
    WHERE procedure.oid =
      'app.record_global_email_delivery_attempt(text,text,text,text,text,integer,text,jsonb,timestamptz)'::regprocedure
      AND privilege.grantee <> procedure.proowner
  LOOP
    IF v_grantee_oid = 0 THEN
      EXECUTE
        'REVOKE ALL PRIVILEGES ON FUNCTION app.record_global_email_delivery_attempt(text,text,text,text,text,integer,text,jsonb,timestamptz) FROM PUBLIC CASCADE';
    ELSE
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON FUNCTION app.record_global_email_delivery_attempt(text,text,text,text,text,integer,text,jsonb,timestamptz) FROM %I CASCADE',
        v_grantee_name
      );
    END IF;
  END LOOP;
END
$delivery_audit_acl_scrub$;
REVOKE ALL ON FUNCTION app.record_global_email_delivery_attempt(
  text, text, text, text, text, integer, text, jsonb, timestamptz
) FROM PUBLIC, app_staff, app_patient, app_worker;
-- Track D (docs/_TODO/runs/briefs/TRACK_D_LOGIN_DELIVERY_CAPABILITIES_BRIEF.md): reset the three
-- new capabilities exactly as strictly as the ones above, since CREATE OR REPLACE preserves an
-- existing function ACL across replays.
REVOKE ALL PRIVILEGES ON FUNCTION app.read_integrator_auth_channel_setting(text)
  FROM :"integrator_runtime_config_role" CASCADE;
DO $auth_channel_acl_scrub$
DECLARE
  v_grantee_oid oid;
  v_grantee_name text;
BEGIN
  FOR v_grantee_oid, v_grantee_name IN
    SELECT DISTINCT privilege.grantee, role.rolname
    FROM pg_proc AS procedure
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS privilege
    LEFT JOIN pg_roles AS role ON role.oid = privilege.grantee
    WHERE procedure.oid = 'app.read_integrator_auth_channel_setting(text)'::regprocedure
      AND privilege.grantee <> procedure.proowner
  LOOP
    IF v_grantee_oid = 0 THEN
      EXECUTE
        'REVOKE ALL PRIVILEGES ON FUNCTION app.read_integrator_auth_channel_setting(text) FROM PUBLIC CASCADE';
    ELSE
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON FUNCTION app.read_integrator_auth_channel_setting(text) FROM %I CASCADE',
        v_grantee_name
      );
    END IF;
  END LOOP;
END
$auth_channel_acl_scrub$;
REVOKE ALL ON FUNCTION app.read_integrator_auth_channel_setting(text)
  FROM PUBLIC, app_staff, app_patient, app_worker;
REVOKE ALL PRIVILEGES ON FUNCTION app.read_integrator_platform_integration_availability()
  FROM :"integrator_runtime_config_role" CASCADE;
DO $platform_availability_acl_scrub$
DECLARE
  v_grantee_oid oid;
  v_grantee_name text;
BEGIN
  FOR v_grantee_oid, v_grantee_name IN
    SELECT DISTINCT privilege.grantee, role.rolname
    FROM pg_proc AS procedure
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS privilege
    LEFT JOIN pg_roles AS role ON role.oid = privilege.grantee
    WHERE procedure.oid = 'app.read_integrator_platform_integration_availability()'::regprocedure
      AND privilege.grantee <> procedure.proowner
  LOOP
    IF v_grantee_oid = 0 THEN
      EXECUTE
        'REVOKE ALL PRIVILEGES ON FUNCTION app.read_integrator_platform_integration_availability() FROM PUBLIC CASCADE';
    ELSE
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON FUNCTION app.read_integrator_platform_integration_availability() FROM %I CASCADE',
        v_grantee_name
      );
    END IF;
  END LOOP;
END
$platform_availability_acl_scrub$;
REVOKE ALL ON FUNCTION app.read_integrator_platform_integration_availability()
  FROM PUBLIC, app_staff, app_patient, app_worker;
REVOKE ALL PRIVILEGES ON FUNCTION app.open_or_touch_operator_incident(text, text, text, text, text)
  FROM :"integrator_runtime_config_role" CASCADE;
DO $incident_open_acl_scrub$
DECLARE
  v_grantee_oid oid;
  v_grantee_name text;
BEGIN
  FOR v_grantee_oid, v_grantee_name IN
    SELECT DISTINCT privilege.grantee, role.rolname
    FROM pg_proc AS procedure
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS privilege
    LEFT JOIN pg_roles AS role ON role.oid = privilege.grantee
    WHERE procedure.oid = 'app.open_or_touch_operator_incident(text,text,text,text,text)'::regprocedure
      AND privilege.grantee <> procedure.proowner
  LOOP
    IF v_grantee_oid = 0 THEN
      EXECUTE
        'REVOKE ALL PRIVILEGES ON FUNCTION app.open_or_touch_operator_incident(text,text,text,text,text) FROM PUBLIC CASCADE';
    ELSE
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON FUNCTION app.open_or_touch_operator_incident(text,text,text,text,text) FROM %I CASCADE',
        v_grantee_name
      );
    END IF;
  END LOOP;
END
$incident_open_acl_scrub$;
-- Granted to app_operational_delivery_worker separately by deploy/postgres/c4-operational-runtime.sql;
-- that grant is a different managed role and is not touched by this scrub.
REVOKE ALL ON FUNCTION app.open_or_touch_operator_incident(text, text, text, text, text)
  FROM PUBLIC, app_staff, app_patient, app_worker;
REVOKE EXECUTE ON FUNCTION
  app.install_signed_context(text, integer, bigint, uuid, uuid, bigint, text),
  app.current_org_id(),
  app.current_patient_user_id(),
  app.current_integrator_user_id(),
  app.reset_principal_context(),
  app.close_active_user_phone_history(uuid),
  app.is_staff()
  FROM :"integrator_runtime_config_role";
GRANT USAGE ON SCHEMA app TO :"integrator_runtime_config_role";
GRANT EXECUTE ON FUNCTION app.read_global_server_runtime_setting(text)
  TO :"integrator_runtime_config_role";
GRANT EXECUTE ON FUNCTION app.read_integrator_provider_runtime_setting(text)
  TO :"integrator_runtime_config_role";
GRANT EXECUTE ON FUNCTION app.read_integrator_smtp_outbound_setting()
  TO :"integrator_runtime_config_role";
GRANT EXECUTE ON FUNCTION app.record_global_email_delivery_attempt(
  text, text, text, text, text, integer, text, jsonb, timestamptz
) TO :"integrator_runtime_config_role";
GRANT EXECUTE ON FUNCTION app.read_integrator_auth_channel_setting(text)
  TO :"integrator_runtime_config_role";
GRANT EXECUTE ON FUNCTION app.read_integrator_platform_integration_availability()
  TO :"integrator_runtime_config_role";
GRANT EXECUTE ON FUNCTION app.read_integrator_runtime_setting(text)
  TO :"integrator_runtime_config_role";
GRANT EXECUTE ON FUNCTION app.read_integrator_google_calendar_setting(text, uuid)
  TO :"integrator_runtime_config_role";
GRANT EXECUTE ON FUNCTION app.read_integrator_clinic_delivery_credential(text, uuid)
  TO :"integrator_runtime_config_role";
GRANT EXECUTE ON FUNCTION app.read_operator_health_probe_config()
  TO :"integrator_runtime_config_role";
GRANT EXECUTE ON FUNCTION app.read_operational_verbose_log_flag()
  TO :"integrator_runtime_config_role";
GRANT EXECUTE ON FUNCTION app.open_or_touch_operator_incident(text, text, text, text, text)
  TO :"integrator_runtime_config_role";
-- Bootstrap/infra cleanup runs before any SET ROLE. Scoped install/release runs after the
-- classified app_staff/app_patient switch and remains granted through those roles by P2-B.
GRANT EXECUTE ON FUNCTION app.release_principal_context()
  TO :"integrator_runtime_config_role";

WITH runtime_role AS (
  SELECT oid, NOT rolinherit AS noinherit
  FROM pg_roles
  WHERE rolname = :'integrator_runtime_config_role'
), protected_tables AS (
  SELECT relation.relowner, relation.relacl
  FROM pg_class relation
  WHERE relation.oid IN (
    'public.app_runtime_settings'::regclass,
    'public.system_settings'::regclass
  )
)
SELECT 1 / (
  (SELECT noinherit FROM runtime_role)
  AND has_function_privilege(
    :'integrator_runtime_config_role',
    'app.read_global_server_runtime_setting(text)',
    'EXECUTE'
  )
  AND has_function_privilege(
    :'integrator_runtime_config_role',
    'app.read_integrator_smtp_outbound_setting()',
    'EXECUTE'
  )
  AND has_function_privilege(
    :'integrator_runtime_config_role',
    'app.read_integrator_provider_runtime_setting(text)',
    'EXECUTE'
  )
  AND (
    SELECT count(*)
    FROM pg_proc AS procedure
    CROSS JOIN runtime_role
    JOIN pg_roles AS owner ON owner.oid = procedure.proowner
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS privilege
    WHERE procedure.oid = 'app.read_integrator_provider_runtime_setting(text)'::regprocedure
      AND procedure.prosecdef
      AND owner.rolname = 'app_owner'
      AND privilege.grantee IN (procedure.proowner, runtime_role.oid)
      AND privilege.privilege_type = 'EXECUTE'
      AND NOT privilege.is_grantable
  ) = 2
  AND NOT EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    CROSS JOIN runtime_role
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS privilege
    WHERE procedure.oid = 'app.read_integrator_provider_runtime_setting(text)'::regprocedure
      AND (
        privilege.grantee NOT IN (procedure.proowner, runtime_role.oid)
        OR privilege.privilege_type <> 'EXECUTE'
        OR privilege.is_grantable
      )
  )
  AND NOT has_function_privilege(
    'app_staff',
    'app.read_integrator_provider_runtime_setting(text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_patient',
    'app.read_integrator_provider_runtime_setting(text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_worker',
    'app.read_integrator_provider_runtime_setting(text)',
    'EXECUTE'
  )
  AND has_function_privilege(
    :'integrator_runtime_config_role',
    'app.record_global_email_delivery_attempt(text,text,text,text,text,integer,text,jsonb,timestamptz)',
    'EXECUTE'
  )
  AND (
    SELECT count(*)
    FROM pg_proc AS procedure
    CROSS JOIN runtime_role
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS privilege
    WHERE procedure.oid = 'app.read_integrator_smtp_outbound_setting()'::regprocedure
      AND privilege.grantee = runtime_role.oid
      AND privilege.privilege_type = 'EXECUTE'
      AND NOT privilege.is_grantable
  ) = 1
  AND NOT EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    CROSS JOIN runtime_role
    JOIN pg_roles AS owner ON owner.oid = procedure.proowner
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS privilege
    WHERE procedure.oid = 'app.read_integrator_smtp_outbound_setting()'::regprocedure
      AND (
        NOT procedure.prosecdef
        OR owner.rolname <> 'app_owner'
        OR privilege.grantee NOT IN (procedure.proowner, runtime_role.oid)
        OR privilege.privilege_type <> 'EXECUTE'
        OR privilege.is_grantable
      )
  )
  AND NOT has_function_privilege(
    'app_staff',
    'app.read_integrator_smtp_outbound_setting()',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_patient',
    'app.read_integrator_smtp_outbound_setting()',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_worker',
    'app.read_integrator_smtp_outbound_setting()',
    'EXECUTE'
  )
  AND (
    SELECT count(*)
    FROM pg_proc AS procedure
    CROSS JOIN runtime_role
    JOIN pg_roles AS owner ON owner.oid = procedure.proowner
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS privilege
    WHERE procedure.oid =
      'app.record_global_email_delivery_attempt(text,text,text,text,text,integer,text,jsonb,timestamptz)'::regprocedure
      AND procedure.prosecdef
      AND owner.rolname = 'app_owner'
      AND privilege.grantee IN (procedure.proowner, runtime_role.oid)
      AND privilege.privilege_type = 'EXECUTE'
      AND NOT privilege.is_grantable
  ) = 2
  AND NOT EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    CROSS JOIN runtime_role
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS privilege
    WHERE procedure.oid =
      'app.record_global_email_delivery_attempt(text,text,text,text,text,integer,text,jsonb,timestamptz)'::regprocedure
      AND (
        privilege.grantee NOT IN (procedure.proowner, runtime_role.oid)
        OR privilege.privilege_type <> 'EXECUTE'
        OR privilege.is_grantable
      )
  )
  AND NOT has_function_privilege(
    'app_staff',
    'app.record_global_email_delivery_attempt(text,text,text,text,text,integer,text,jsonb,timestamptz)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_patient',
    'app.record_global_email_delivery_attempt(text,text,text,text,text,integer,text,jsonb,timestamptz)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_worker',
    'app.record_global_email_delivery_attempt(text,text,text,text,text,integer,text,jsonb,timestamptz)',
    'EXECUTE'
  )
  AND has_function_privilege(
    :'integrator_runtime_config_role',
    'app.read_integrator_auth_channel_setting(text)',
    'EXECUTE'
  )
  AND (
    SELECT count(*)
    FROM pg_proc AS procedure
    CROSS JOIN runtime_role
    JOIN pg_roles AS owner ON owner.oid = procedure.proowner
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS privilege
    WHERE procedure.oid = 'app.read_integrator_auth_channel_setting(text)'::regprocedure
      AND procedure.prosecdef
      AND owner.rolname = 'app_owner'
      AND privilege.grantee IN (procedure.proowner, runtime_role.oid)
      AND privilege.privilege_type = 'EXECUTE'
      AND NOT privilege.is_grantable
  ) = 2
  AND NOT EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    CROSS JOIN runtime_role
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS privilege
    WHERE procedure.oid = 'app.read_integrator_auth_channel_setting(text)'::regprocedure
      AND (
        privilege.grantee NOT IN (procedure.proowner, runtime_role.oid)
        OR privilege.privilege_type <> 'EXECUTE'
        OR privilege.is_grantable
      )
  )
  AND NOT has_function_privilege('app_staff', 'app.read_integrator_auth_channel_setting(text)', 'EXECUTE')
  AND NOT has_function_privilege('app_patient', 'app.read_integrator_auth_channel_setting(text)', 'EXECUTE')
  AND NOT has_function_privilege('app_worker', 'app.read_integrator_auth_channel_setting(text)', 'EXECUTE')
  AND has_function_privilege(
    :'integrator_runtime_config_role',
    'app.read_integrator_platform_integration_availability()',
    'EXECUTE'
  )
  AND (
    SELECT count(*)
    FROM pg_proc AS procedure
    CROSS JOIN runtime_role
    JOIN pg_roles AS owner ON owner.oid = procedure.proowner
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS privilege
    WHERE procedure.oid = 'app.read_integrator_platform_integration_availability()'::regprocedure
      AND procedure.prosecdef
      AND owner.rolname = 'app_owner'
      AND privilege.grantee IN (procedure.proowner, runtime_role.oid)
      AND privilege.privilege_type = 'EXECUTE'
      AND NOT privilege.is_grantable
  ) = 2
  AND NOT EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    CROSS JOIN runtime_role
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS privilege
    WHERE procedure.oid = 'app.read_integrator_platform_integration_availability()'::regprocedure
      AND (
        privilege.grantee NOT IN (procedure.proowner, runtime_role.oid)
        OR privilege.privilege_type <> 'EXECUTE'
        OR privilege.is_grantable
      )
  )
  AND NOT has_function_privilege(
    'app_staff', 'app.read_integrator_platform_integration_availability()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_patient', 'app.read_integrator_platform_integration_availability()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_worker', 'app.read_integrator_platform_integration_availability()', 'EXECUTE'
  )
  AND has_function_privilege(
    :'integrator_runtime_config_role',
    'app.open_or_touch_operator_incident(text,text,text,text,text)',
    'EXECUTE'
  )
  AND (
    SELECT count(*)
    FROM pg_proc AS procedure
    CROSS JOIN runtime_role
    JOIN pg_roles AS owner ON owner.oid = procedure.proowner
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS privilege
    WHERE procedure.oid = 'app.open_or_touch_operator_incident(text,text,text,text,text)'::regprocedure
      AND procedure.prosecdef
      AND owner.rolname = 'app_owner'
      AND privilege.grantee IN (procedure.proowner, runtime_role.oid)
      AND privilege.privilege_type = 'EXECUTE'
      AND NOT privilege.is_grantable
  ) = 2
  -- app_operational_delivery_worker also holds EXECUTE (granted by c4-operational-runtime.sql),
  -- so this function's unexpected-grantee check must allow that third, non-owner grantee.
  AND NOT EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    CROSS JOIN runtime_role
    LEFT JOIN pg_roles AS delivery_worker ON delivery_worker.rolname = 'app_operational_delivery_worker'
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) AS privilege
    WHERE procedure.oid = 'app.open_or_touch_operator_incident(text,text,text,text,text)'::regprocedure
      AND (
        privilege.grantee NOT IN (procedure.proowner, runtime_role.oid, COALESCE(delivery_worker.oid, runtime_role.oid))
        OR privilege.privilege_type <> 'EXECUTE'
        OR privilege.is_grantable
      )
  )
  AND NOT has_function_privilege(
    'app_staff', 'app.open_or_touch_operator_incident(text,text,text,text,text)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_patient', 'app.open_or_touch_operator_incident(text,text,text,text,text)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_worker', 'app.open_or_touch_operator_incident(text,text,text,text,text)', 'EXECUTE'
  )
  AND has_function_privilege(
    :'integrator_runtime_config_role',
    'app.release_principal_context()',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    :'integrator_runtime_config_role',
    'app.install_signed_context(text,integer,bigint,uuid,uuid,bigint,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    :'integrator_runtime_config_role', 'app.reset_principal_context()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    :'integrator_runtime_config_role', 'app.current_org_id()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    :'integrator_runtime_config_role', 'app.current_patient_user_id()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    :'integrator_runtime_config_role', 'app.current_integrator_user_id()', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    :'integrator_runtime_config_role', 'app.close_active_user_phone_history(uuid)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    :'integrator_runtime_config_role', 'app.is_staff()', 'EXECUTE'
  )
  AND has_function_privilege(
    'app_staff',
    'app.install_signed_context(text,integer,bigint,uuid,uuid,bigint,text)',
    'EXECUTE'
  )
  AND has_function_privilege('app_staff', 'app.release_principal_context()', 'EXECUTE')
  AND has_function_privilege(
    'app_patient',
    'app.install_signed_context(text,integer,bigint,uuid,uuid,bigint,text)',
    'EXECUTE'
  )
  AND has_function_privilege('app_patient', 'app.release_principal_context()', 'EXECUTE')
  AND NOT EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN runtime_role ON runtime_role.oid = membership.member
    WHERE membership.inherit_option
      OR NOT membership.set_option
  )
  AND NOT EXISTS (
    SELECT 1
    FROM protected_tables protected
    CROSS JOIN runtime_role
    CROSS JOIN LATERAL aclexplode(
      COALESCE(protected.relacl, acldefault('r', protected.relowner))
    ) privilege
    WHERE privilege.privilege_type = 'SELECT'
      AND privilege.grantee IN (0, runtime_role.oid)
  )
  AND NOT has_table_privilege(
    :'integrator_runtime_config_role',
    'integrator.delivery_attempt_logs',
    'INSERT'
  )
  AND NOT has_sequence_privilege(
    :'integrator_runtime_config_role',
    'integrator.delivery_attempt_logs_id_seq',
    'USAGE'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM protected_tables protected
    CROSS JOIN runtime_role
    WHERE pg_has_role(runtime_role.oid, protected.relowner, 'MEMBER')
  )
)::int AS integrator_server_runtime_config_least_privilege_verified;

\echo 'Integrator server-runtime config grants UP complete.'
