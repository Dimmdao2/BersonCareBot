-- Temporary target-DB bridge for a fresh PROD-copy migration rehearsal.
--
-- The historical cross-app chain contains three prerequisites that are true on the final schema
-- but are not true on the current PROD schema at the point where the webapp runner first needs
-- them:
--   1. migration 0241 verifies the existing app_staff reads on two operational tables;
--   2. migration 0274 calls pgcrypto through the final app_ext schema;
--   3. migrations 0330/0331 verify the public Google Calendar map shape owned by the later
--      integrator migration 20260727_0002.
--
-- Install only those prerequisites here. The normal migration ledgers remain authoritative:
-- 20260727_0002 is deliberately replay-safe and will record itself later, while the final
-- declaration-generated privilege zero replaces the temporary ACLs and object ownership.

\set ON_ERROR_STOP on
\pset pager off

\if :{?pre_migration_database}
\else
\echo 'FATAL: missing required psql variable pre_migration_database.'
SELECT 1 / 0 AS pre_migration_target_bridge_abort;
\endif

\if :{?pre_migration_owner_role}
\else
\echo 'FATAL: missing required psql variable pre_migration_owner_role.'
SELECT 1 / 0 AS pre_migration_target_bridge_abort;
\endif

SELECT (
  current_database() = :'pre_migration_database'
  AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'pre_migration_owner_role')
  AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner')
  AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_staff')
  AND to_regclass('public.admin_audit_log') IS NOT NULL
  AND to_regclass('public.operator_health_failure_archive') IS NOT NULL
)::int AS pre_migration_target_ready \gset

\if :pre_migration_target_ready
\else
\echo 'FATAL: target database, owner role, bridge roles, or prerequisite tables are missing.'
SELECT 1 / 0 AS pre_migration_target_bridge_abort;
\endif

CREATE SCHEMA IF NOT EXISTS app_ext AUTHORIZATION app_owner;
ALTER SCHEMA app_ext OWNER TO app_owner;

DO $pgcrypto_schema$
DECLARE
  v_pgcrypto_schema text;
  v_conflicting_functions text[];
BEGIN
  SELECT namespace.nspname
  INTO v_pgcrypto_schema
  FROM pg_extension extension
  JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace
  WHERE extension.extname = 'pgcrypto';

  IF v_pgcrypto_schema IS NULL THEN
    CREATE EXTENSION pgcrypto WITH SCHEMA app_ext;
  ELSIF v_pgcrypto_schema <> 'app_ext' THEN
    SELECT array_agg(
      format(
        '%I.%I(%s)',
        source_namespace.nspname,
        source_proc.proname,
        pg_get_function_identity_arguments(source_proc.oid)
      )
      ORDER BY source_namespace.nspname, source_proc.proname, source_proc.oid
    )
    INTO v_conflicting_functions
    FROM pg_depend dependency
    JOIN pg_extension extension ON extension.oid = dependency.refobjid
    JOIN pg_proc source_proc ON source_proc.oid = dependency.objid
    JOIN pg_namespace source_namespace ON source_namespace.oid = source_proc.pronamespace
    JOIN pg_proc target_proc ON target_proc.pronamespace = 'app_ext'::regnamespace
      AND target_proc.proname = source_proc.proname
      AND target_proc.proargtypes = source_proc.proargtypes
    WHERE extension.extname = 'pgcrypto'
      AND dependency.classid = 'pg_proc'::regclass
      AND dependency.deptype = 'e';

    IF coalesce(array_length(v_conflicting_functions, 1), 0) > 0 THEN
      RAISE EXCEPTION 'pgcrypto_app_ext_conflicting_functions: %',
        array_to_string(v_conflicting_functions, ', ');
    END IF;

    ALTER EXTENSION pgcrypto SET SCHEMA app_ext;
  END IF;
END
$pgcrypto_schema$;

GRANT USAGE ON SCHEMA app_ext TO app_owner;
GRANT SELECT ON TABLE
  public.admin_audit_log,
  public.operator_health_failure_archive
TO app_staff;

-- Reuse the declaration-owning integrator migration body instead of maintaining a second table
-- definition. It does not touch the integrator ledger here; the normal late integrator phase will
-- run it idempotently and record it under its canonical version.
SET ROLE :"pre_migration_owner_role";
\ir ../../apps/integrator/src/infra/db/migrations/core/20260727_0002_booking_calendar_map_appointment_key.sql
RESET ROLE;

DO $bridge_assertions$
DECLARE
  v_pgcrypto_schema text;
BEGIN
  SELECT namespace.nspname
  INTO v_pgcrypto_schema
  FROM pg_extension extension
  JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace
  WHERE extension.extname = 'pgcrypto';

  IF v_pgcrypto_schema IS DISTINCT FROM 'app_ext'
    OR NOT has_schema_privilege('app_owner', 'app_ext', 'USAGE')
    OR NOT has_table_privilege('app_staff', 'public.admin_audit_log', 'SELECT')
    OR NOT has_table_privilege('app_staff', 'public.operator_health_failure_archive', 'SELECT')
    OR to_regclass('public.booking_calendar_map') IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'booking_calendar_map'
        AND column_name = 'appointment_key'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.booking_calendar_map'::regclass
        AND conname = 'booking_calendar_map_appointment_key_key'
        AND contype = 'u'
    )
  THEN
    RAISE EXCEPTION 'pre_migration_target_bridge_assertion_failed';
  END IF;
END
$bridge_assertions$;

\echo 'pre-migration target bridge installed and verified.'
