-- =============================================================================
-- dev-refresh-capture-dev-owned-state.sql
--
-- Internal primitive of deploy/host/refresh-dev-from-test.sh. Not an operator entrypoint.
--
-- Runs read-only against the live bcb_webapp_dev immediately before the destructive phase and
-- writes the exact DEV-owned state that must survive the refresh into a private, postgres-owned
-- working directory. Nothing is printed: every value leaves through server-side COPY into a file
-- the wrapper never reads, and the wrapper shreds that directory on every exit path.
--
-- Selection policy is derived, not hand-listed. The wrapper renders two key lists first:
--   :dev_owned_key_file  -- registry `storage: 'restricted'` keys UNION every key the TEST
--                           environment overlay (deploy/postgres/test-settings-override.sql)
--                           deletes, inserts, updates or locks
--   :registry_key_file   -- every key the S5-0 registry classifies at all
-- A row is DEV-owned when its key is in the first list, or when its key is absent from the second
-- (a key the registry does not classify is not product state, so DEV keeps its own row).
--
-- Required psql variables:
--   dev_owned_key_file, registry_key_file, settings_out, signing_secret_out, has_signing_secret_out
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
\if :{?settings_out}
\else
\warn 'FATAL: settings_out is required'
SELECT 1 / 0 AS missing_settings_out;
\endif
\if :{?signing_secret_out}
\else
\warn 'FATAL: signing_secret_out is required'
SELECT 1 / 0 AS missing_signing_secret_out;
\endif
\if :{?has_signing_secret_out}
\else
\warn 'FATAL: has_signing_secret_out is required'
SELECT 1 / 0 AS missing_has_signing_secret_out;
\endif

-- Fail before writing anything if this is not the exact DEV target.
SELECT 1 / (current_database() = 'bcb_webapp_dev')::int AS capture_target_is_dev;

CREATE TEMP TABLE dev_owned_static_key (key text PRIMARY KEY);
COPY dev_owned_static_key FROM :'dev_owned_key_file';
CREATE TEMP TABLE registry_key (key text PRIMARY KEY);
COPY registry_key FROM :'registry_key_file';

SELECT 1 / (count(*) > 0)::int AS dev_owned_key_list_is_not_empty FROM dev_owned_static_key;
SELECT 1 / (count(*) > 0)::int AS registry_key_list_is_not_empty FROM registry_key;

CREATE TEMP VIEW dev_owned_setting AS
  SELECT s.key, s.scope, s.organization_id, s.value_json, s.updated_at
    FROM public.system_settings AS s
   WHERE s.key IN (SELECT key FROM dev_owned_static_key)
      OR s.key NOT IN (SELECT key FROM registry_key);

-- `updated_by` is deliberately dropped. It is provenance metadata with a foreign key into
-- public.platform_users; the DEV author row does not necessarily exist in the accepted TEST data,
-- and a dangling reference would fail the re-insert for a value nobody reads. The restore writes
-- NULL, exactly like the TEST environment overlay does for its own writes.
COPY (SELECT key, scope, organization_id, value_json, updated_at FROM dev_owned_setting ORDER BY key, scope, organization_id) TO :'settings_out';

-- app.context_signing_secrets holds the principal-context signing credential of THIS environment.
-- It is the one runtime credential that lives inside the database rather than in env, so copying
-- TEST's row into DEV would be a credential transfer. Capture DEV's own row when the seam exists.
-- ::text so the exported marker is literally true/false, which is what the wrapper asserts on;
-- an uncast boolean would print psql's t/f.
SELECT (to_regclass('app.context_signing_secrets') IS NOT NULL)::text AS dev_has_signing_secret \gset
COPY (SELECT :'dev_has_signing_secret'::text) TO :'has_signing_secret_out';
\if :dev_has_signing_secret
COPY (SELECT secret FROM app.context_signing_secrets ORDER BY id) TO :'signing_secret_out';
\else
COPY (SELECT 1 WHERE false) TO :'signing_secret_out';
\endif

SELECT count(*) AS dev_owned_settings_captured FROM dev_owned_setting;
