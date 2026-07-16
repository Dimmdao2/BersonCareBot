-- Canonical strict/fresh overlay for the E1 safe runtime projection.
-- Keep executable content single-sourced in the registered Drizzle migration.
\set ON_ERROR_STOP on
\if :{?e1_webapp_runtime_role}
\else
\echo 'FATAL: missing e1_webapp_runtime_role.'
SELECT 1 / 0 AS e1_webapp_runtime_role_missing;
\endif

\ir ../../apps/webapp/db/drizzle-migrations/0193_e1_safe_runtime_config.sql

GRANT SELECT ON TABLE public.app_runtime_settings TO app_owner;
ALTER FUNCTION app.read_public_runtime_setting(text, text) OWNER TO app_owner;
ALTER FUNCTION app.read_webapp_server_runtime_setting(text, text) OWNER TO app_owner;
REVOKE ALL ON TABLE public.system_settings, public.system_settings_audit FROM app_patient;
GRANT SELECT ON TABLE public.app_runtime_settings TO app_patient;
REVOKE SELECT ON TABLE public.app_runtime_settings, public.system_settings
  FROM :"e1_webapp_runtime_role";
REVOKE ALL ON FUNCTION app.read_public_runtime_setting(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_webapp_server_runtime_setting(text, text)
  FROM PUBLIC, app_patient, app_staff;
REVOKE ALL PRIVILEGES ON FUNCTION
  app.read_public_runtime_setting(text, text),
  app.read_webapp_server_runtime_setting(text, text)
  FROM :"e1_webapp_runtime_role" CASCADE;
GRANT USAGE ON SCHEMA app TO :"e1_webapp_runtime_role";
GRANT EXECUTE ON FUNCTION app.read_public_runtime_setting(text, text)
  TO :"e1_webapp_runtime_role";
GRANT EXECUTE ON FUNCTION app.read_webapp_server_runtime_setting(text, text)
  TO :"e1_webapp_runtime_role";

SELECT 1 / (
  has_function_privilege(
    :'e1_webapp_runtime_role',
    'app.read_public_runtime_setting(text,text)',
    'EXECUTE'
  )
  AND NOT has_table_privilege(
    :'e1_webapp_runtime_role',
    'public.system_settings',
    'SELECT'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_class AS relation
    CROSS JOIN LATERAL aclexplode(
      COALESCE(relation.relacl, acldefault('r', relation.relowner))
    ) AS privilege
    WHERE relation.oid IN (
      'public.app_runtime_settings'::regclass,
      'public.system_settings'::regclass
    )
      AND privilege.privilege_type = 'SELECT'
      AND privilege.grantee IN (
        0,
        (SELECT oid FROM pg_roles WHERE rolname = :'e1_webapp_runtime_role')
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_class AS relation
    WHERE relation.oid IN (
      'public.app_runtime_settings'::regclass,
      'public.system_settings'::regclass
    )
      AND pg_has_role(
        :'e1_webapp_runtime_role',
        relation.relowner,
        'MEMBER'
      )
  )
  AND has_function_privilege(
    :'e1_webapp_runtime_role',
    'app.read_webapp_server_runtime_setting(text,text)',
    'EXECUTE'
  )
  AND 2 = (
    SELECT count(*)
    FROM pg_proc procedure
    CROSS JOIN LATERAL aclexplode(
      COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
    ) privilege
    WHERE procedure.oid IN (
        'app.read_public_runtime_setting(text,text)'::regprocedure,
        'app.read_webapp_server_runtime_setting(text,text)'::regprocedure
      )
      AND privilege.privilege_type = 'EXECUTE'
      AND privilege.grantee = (
        SELECT oid FROM pg_roles WHERE rolname = :'e1_webapp_runtime_role'
      )
      AND NOT privilege.is_grantable
  )
  AND NOT has_function_privilege(
    'app_patient',
    'app.read_webapp_server_runtime_setting(text,text)',
    'EXECUTE'
  )
)::int AS e1_webapp_runtime_acl_closed;
