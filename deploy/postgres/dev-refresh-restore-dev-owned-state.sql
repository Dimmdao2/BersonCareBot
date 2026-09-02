-- =============================================================================
-- dev-refresh-restore-dev-owned-state.sql
--
-- Internal primitive of deploy/host/refresh-dev-from-test.sh. Not an operator entrypoint.
--
-- Runs once against the freshly restored bcb_webapp_dev, before the database is reopened for
-- connections and before the declaration reconcile. One transaction: either DEV owns its own
-- environment state again, or the target stays closed and the wrapper rolls back from the local
-- pre-refresh snapshot.
--
-- Three things happen here, in this order:
--   1. TEST environment lock objects are removed. deploy/postgres/test-settings-override.sql
--      installs system_settings_test_lock on TEST so nobody flips maintenance/signup from the UI.
--      That lock is TEST deploy policy; carried into DEV it would block ordinary DEV work.
--   2. Every environment-owned row that arrived from TEST is deleted and DEV's captured rows are
--      put back. Selection is the same derived policy the capture step used.
--   3. The DEV principal-context signing credential is re-pinned and per-backend ephemeral
--      principal state left by TEST backends is emptied.
--
-- Required psql variables:
--   dev_owned_key_file, registry_key_file, settings_in, signing_secret_in, dev_had_signing_secret
-- =============================================================================
\set ON_ERROR_STOP on

\if :{?dev_owned_key_file}
\else
\warn 'FATAL: dev_owned_key_file is required'
SELECT 1 / 0 AS missing_dev_owned_key_file;
\endif
\if :{?registry_key_file}
\else
\warn 'FATAL: registry_key_file is required'
SELECT 1 / 0 AS missing_registry_key_file;
\endif
\if :{?settings_in}
\else
\warn 'FATAL: settings_in is required'
SELECT 1 / 0 AS missing_settings_in;
\endif
\if :{?signing_secret_in}
\else
\warn 'FATAL: signing_secret_in is required'
SELECT 1 / 0 AS missing_signing_secret_in;
\endif
\if :{?dev_had_signing_secret}
\else
\warn 'FATAL: dev_had_signing_secret is required'
SELECT 1 / 0 AS missing_dev_had_signing_secret;
\endif
SELECT :'dev_had_signing_secret' IN ('true', 'false') AS dev_had_signing_secret_valid,
       :'dev_had_signing_secret' = 'true' AS restore_dev_signing_secret
\gset
\if :dev_had_signing_secret_valid
\else
\warn 'FATAL: dev_had_signing_secret must be exactly true or false'
SELECT 1 / 0 AS invalid_dev_had_signing_secret;
\endif

BEGIN;

SELECT 1 / (current_database() = 'bcb_webapp_dev')::int AS restore_target_is_dev;

-- 1. TEST environment lock objects.
DROP TRIGGER IF EXISTS system_settings_test_lock ON public.system_settings;
DROP FUNCTION IF EXISTS public.system_settings_test_lock_guard();

CREATE TEMP TABLE dev_owned_static_key (key text PRIMARY KEY) ON COMMIT DROP;
\copy dev_owned_static_key FROM :'dev_owned_key_file'
CREATE TEMP TABLE registry_key (key text PRIMARY KEY) ON COMMIT DROP;
\copy registry_key FROM :'registry_key_file'
CREATE TEMP TABLE dev_owned_setting (
  key text NOT NULL,
  scope text NOT NULL,
  organization_id uuid,
  value_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL
) ON COMMIT DROP;
\copy dev_owned_setting FROM :'settings_in'

SELECT 1 / (count(*) > 0)::int AS dev_owned_key_list_is_not_empty FROM dev_owned_static_key;
SELECT 1 / (count(*) > 0)::int AS registry_key_list_is_not_empty FROM registry_key;

-- 2. Environment-owned rows: drop what TEST brought, put DEV's own rows back.
DELETE FROM public.system_settings
 WHERE key IN (SELECT key FROM dev_owned_static_key)
    OR key NOT IN (SELECT key FROM registry_key);

INSERT INTO public.system_settings (key, scope, organization_id, value_json, updated_at, updated_by)
SELECT key, scope, organization_id, value_json, updated_at, NULL
  FROM dev_owned_setting;

-- Exactness proof, not a smoke check: after the swap the environment-owned slice of the table must
-- be row-for-row the captured DEV slice. A short insert (constraint drop, partial \copy, truncated
-- capture file) fails here and the whole transaction rolls back.
SELECT 1 / (
  (SELECT count(*) FROM dev_owned_setting) = (
    SELECT count(*)
      FROM public.system_settings AS s
     WHERE s.key IN (SELECT key FROM dev_owned_static_key)
        OR s.key NOT IN (SELECT key FROM registry_key)
  )
)::int AS dev_owned_settings_restored_exactly;

SELECT 1 / (NOT EXISTS (
  SELECT 1
    FROM dev_owned_setting AS captured
   WHERE NOT EXISTS (
     SELECT 1
       FROM public.system_settings AS s
      WHERE s.key = captured.key
        AND s.scope = captured.scope
        AND s.organization_id IS NOT DISTINCT FROM captured.organization_id
        AND s.value_json = captured.value_json
   )
))::int AS every_captured_dev_row_is_present;

-- 3. Environment-owned runtime credential and ephemeral principal state.
\if :restore_dev_signing_secret
SELECT 1 / (to_regclass('app.context_signing_secrets') IS NOT NULL)::int AS signing_secret_seam_present;
CREATE TEMP TABLE dev_signing_secret (secret text NOT NULL) ON COMMIT DROP;
\copy dev_signing_secret FROM :'signing_secret_in'
SELECT 1 / (count(*) = 1)::int AS exactly_one_captured_dev_signing_secret FROM dev_signing_secret;
DELETE FROM app.context_signing_secrets;
INSERT INTO app.context_signing_secrets (id, secret) SELECT true, secret FROM dev_signing_secret;
SELECT 1 / (count(*) = 1)::int AS dev_signing_secret_repinned FROM app.context_signing_secrets;
\endif

DO $$
BEGIN
  -- Per-backend rows keyed by the PID of a TEST backend that no longer exists. Ephemeral by
  -- construction; carrying them over would leave stale principal claims addressable in DEV.
  IF to_regclass('app.principal_context') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE app.principal_context';
  END IF;
  IF to_regclass('app.context_nonce_ledger') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE app.context_nonce_ledger';
  END IF;
END
$$;

COMMIT;
