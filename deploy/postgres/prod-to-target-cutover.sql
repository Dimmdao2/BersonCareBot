\set ON_ERROR_STOP on
\set VERBOSITY verbose
\set SHOW_CONTEXT errors
\set QUIET on

\if :{?cutover_mode}
\else
  \set cutover_mode commit
\endif

SELECT set_config('bcb.cutover.requested_mode', :'cutover_mode', false) AS ignored
\gset

\echo '=== CUTOVER MODE VALIDATION: expected commit or dryrun; requested=' :cutover_mode ' ==='
DO $cutover_mode_validation$
BEGIN
  IF current_setting('bcb.cutover.requested_mode') NOT IN ('commit', 'dryrun') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format(
        'CUTOVER MODE VALIDATION failed: unknown cutover_mode=%L; expected commit or dryrun',
        current_setting('bcb.cutover.requested_mode')
      );
  END IF;
END
$cutover_mode_validation$;

SELECT :'cutover_mode' = 'dryrun' AS cutover_is_dryrun
\gset
\echo '=== CUTOVER MODE ACCEPTED:' :cutover_mode ' ==='

-- One transactional A -> B schema migration. The caller performs the reviewed
-- data preparation first; this entrypoint replaces the historical migration chain.
\echo '=== CUTOVER PHASE P01/07: prepare source data and transactional schema swap ==='
\ir prod-to-target-cutover-start.sql
SELECT json_build_object(
  'status', 'pass',
  'sourceSchemasReady', (
    SELECT count(*) FROM pg_namespace
    WHERE nspname IN ('cutover_source_public', 'cutover_source_integrator', 'cutover_source_drizzle')
  ),
  'targetSchemasReady', (
    SELECT count(*) FROM pg_namespace
    WHERE nspname IN ('public', 'app', 'app_control', 'app_ext', 'drizzle', 'integrator')
  )
)::text AS result
\gset cutover_p01_
SELECT :'cutover_p01_result'::json AS cutover_phase_p01_prepare_source_and_schema_swap;

\echo '=== CUTOVER PHASE P02/07: install target pre-data schema ==='
\ir generated/prod-to-target/schema-pre.sql
SELECT json_build_object(
  'status', 'pass',
  'targetTables', (
    SELECT count(*) FROM pg_class class
    JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
    WHERE namespace.nspname IN ('public', 'integrator', 'drizzle') AND class.relkind IN ('r', 'p')
  ),
  'targetSequences', (
    SELECT count(*) FROM pg_class class
    JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
    WHERE namespace.nspname IN ('public', 'integrator', 'drizzle') AND class.relkind = 'S'
  )
)::text AS result
\gset cutover_p02_
SELECT :'cutover_p02_result'::json AS cutover_phase_p02_target_pre_data_schema;

\echo '=== CUTOVER PHASE P03/07: migrate source data into target schema ==='
\ir prod-to-target-cutover-data.sql
SELECT json_build_object('status', 'pass', 'reportedSteps', 24)::text AS result
\gset cutover_p03_
SELECT :'cutover_p03_result'::json AS cutover_phase_p03_target_data;

\echo '=== CUTOVER PHASE P04/07: install migration ledgers and baseline rows ==='
\ir generated/prod-to-target/ledgers-and-baseline.sql
SELECT json_build_object(
  'status', 'pass',
  'drizzleLedgerRows', (SELECT count(*) FROM drizzle.__drizzle_migrations),
  'integratorLedgerRows', (SELECT count(*) FROM integrator.schema_migrations),
  'tariffRows', (SELECT count(*) FROM public.saas_tariffs)
)::text AS result
\gset cutover_p04_
SELECT :'cutover_p04_result'::json AS cutover_phase_p04_ledgers_and_baseline;

\echo '=== CUTOVER PHASE P05/07: install generated runtime settings registry ==='
\ir generated/prod-to-target/runtime-settings.sql
SELECT json_build_object(
  'status', 'pass',
  'runtimeSettingRows', (SELECT count(*) FROM public.app_runtime_settings),
  'globalRuntimeSettingRows', (
    SELECT count(*) FROM public.app_runtime_settings WHERE organization_id IS NULL
  )
)::text AS result
\gset cutover_p05_
SELECT :'cutover_p05_result'::json AS cutover_phase_p05_runtime_settings;

\echo '=== CUTOVER PHASE P06/07: install target post-data schema ==='
\ir generated/prod-to-target/schema-post.sql
SELECT json_build_object(
  'status', 'pass',
  'foreignKeys', (
    SELECT count(*) FROM pg_constraint constraint_row
    JOIN pg_namespace namespace ON namespace.oid = constraint_row.connamespace
    WHERE namespace.nspname IN ('public', 'integrator') AND constraint_row.contype = 'f'
  ),
  'policies', (
    SELECT count(*) FROM pg_policy policy
    JOIN pg_class class ON class.oid = policy.polrelid
    JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
    WHERE namespace.nspname IN ('public', 'integrator')
  )
)::text AS result
\gset cutover_p06_
SELECT :'cutover_p06_result'::json AS cutover_phase_p06_target_post_data_schema;

\echo '=== CUTOVER PHASE P07/07: finalize, verify, and close transaction ==='
\ir prod-to-target-cutover-finish.sql
