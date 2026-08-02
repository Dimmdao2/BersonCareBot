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
  AND 3 = (
    SELECT count(*)
    FROM pg_auth_members membership
    JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
    JOIN pg_roles member_role ON member_role.oid = membership.member
    WHERE member_role.rolname = :'integrator_runtime_config_role'
      AND granted_role.rolname IN ('app_staff', 'app_patient', 'app_worker')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
    JOIN pg_roles member_role ON member_role.oid = membership.member
    WHERE member_role.rolname = :'integrator_runtime_config_role'
      AND (
        granted_role.rolname NOT IN ('app_staff', 'app_patient', 'app_worker')
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
