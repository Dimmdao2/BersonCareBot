-- Pin the generic integrator server-runtime accessor to the protected owner.
-- The exact API base login receives EXECUTE only; it never receives table access.

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
\echo 'Integrator server-runtime config grants DOWN complete.'
\quit
\endif

SELECT 1 / (
  EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = :'integrator_runtime_config_role'
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
  AND to_regprocedure('app.read_global_server_runtime_setting(text)') IS NOT NULL
)::int AS integrator_server_runtime_config_preflight;

GRANT SELECT ON TABLE public.app_runtime_settings TO app_owner;
ALTER FUNCTION app.read_global_server_runtime_setting(text) OWNER TO app_owner;

REVOKE ALL ON FUNCTION app.read_global_server_runtime_setting(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_global_server_runtime_setting(text)
  FROM app_staff, app_patient, app_worker;
GRANT USAGE ON SCHEMA app TO :"integrator_runtime_config_role";
GRANT EXECUTE ON FUNCTION app.read_global_server_runtime_setting(text)
  TO :"integrator_runtime_config_role";

\echo 'Integrator server-runtime config grants UP complete.'
