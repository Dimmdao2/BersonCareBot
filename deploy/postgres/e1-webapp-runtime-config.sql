-- Canonical strict/fresh overlay for the E1 safe runtime projection.
-- Keep executable content single-sourced in the registered Drizzle migration.
\set ON_ERROR_STOP on
\if :{?e1_webapp_runtime_role}
\else
\echo 'FATAL: missing e1_webapp_runtime_role.'
SELECT 1 / 0 AS e1_webapp_runtime_role_missing;
\endif

\ir ../../apps/webapp/db/drizzle-migrations/0193_e1_safe_runtime_config.sql

REVOKE SELECT ON TABLE public.app_runtime_settings, public.system_settings
  FROM :"e1_webapp_runtime_role";
REVOKE ALL ON FUNCTION app.read_public_runtime_setting(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_webapp_server_runtime_setting(text, text)
  FROM PUBLIC, app_patient, app_staff;
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
  AND NOT has_table_privilege(:'e1_webapp_runtime_role', 'public.app_runtime_settings', 'SELECT')
  AND NOT has_table_privilege(:'e1_webapp_runtime_role', 'public.system_settings', 'SELECT')
  AND has_function_privilege(
    :'e1_webapp_runtime_role',
    'app.read_webapp_server_runtime_setting(text,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_patient',
    'app.read_webapp_server_runtime_setting(text,text)',
    'EXECUTE'
  )
)::int AS e1_webapp_runtime_acl_closed;
