-- Exact owner handoff for protected runtime overlays after a --no-owner restore.
--
-- pg_restore attributes existing functions to the target database owner. Three reviewed
-- overlays subsequently CREATE OR REPLACE their SECURITY DEFINER functions under SET ROLE
-- app_owner; PostgreSQL rejects that replacement unless app_owner already owns the function.
-- Keep this artifact exact and fail closed: only the three known overlay functions may move,
-- and only from the current database owner to the canonical protected app_owner role.

\set ON_ERROR_STOP on
\pset pager off

SELECT (
  EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'app_owner'
      AND rolcanlogin = false
      AND rolbypassrls = true
  )
  AND EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app')
  AND EXISTS (SELECT 1 FROM pg_database WHERE datname = current_database())
)::int AS runtime_overlay_app_owner_handoff_preflight_ok
\gset

\if :runtime_overlay_app_owner_handoff_preflight_ok
\else
\echo 'FATAL: protected runtime-overlay owner handoff prerequisites are missing.'
SELECT 1 / 0 AS runtime_overlay_app_owner_handoff_preflight_abort;
\endif

WITH exact_targets(signature) AS (
  VALUES
    ('app.get_web_push_vapid_public_key()'),
    ('app.resolve_public_booking_organization(uuid,uuid,uuid)'),
    ('app.resolve_public_organization_by_slug(text)')
), database_owner AS (
  SELECT datdba
  FROM pg_database
  WHERE datname = current_database()
)
SELECT NOT EXISTS (
  SELECT 1
  FROM exact_targets AS target
  JOIN pg_proc AS procedure ON procedure.oid = to_regprocedure(target.signature)
  CROSS JOIN database_owner
  WHERE procedure.proowner NOT IN (
    database_owner.datdba,
    (SELECT oid FROM pg_roles WHERE rolname = 'app_owner')
  )
) AS runtime_overlay_app_owner_handoff_sources_safe
\gset

\if :runtime_overlay_app_owner_handoff_sources_safe
\else
\echo 'FATAL: an exact protected runtime-overlay function has an unexpected owner.'
SELECT 1 / 0 AS runtime_overlay_app_owner_handoff_source_abort;
\endif

ALTER FUNCTION IF EXISTS app.get_web_push_vapid_public_key() OWNER TO app_owner;
ALTER FUNCTION IF EXISTS app.resolve_public_booking_organization(uuid, uuid, uuid) OWNER TO app_owner;
ALTER FUNCTION IF EXISTS app.resolve_public_organization_by_slug(text) OWNER TO app_owner;

WITH exact_targets(signature) AS (
  VALUES
    ('app.get_web_push_vapid_public_key()'),
    ('app.resolve_public_booking_organization(uuid,uuid,uuid)'),
    ('app.resolve_public_organization_by_slug(text)')
)
SELECT NOT EXISTS (
  SELECT 1
  FROM exact_targets AS target
  JOIN pg_proc AS procedure ON procedure.oid = to_regprocedure(target.signature)
  WHERE procedure.proowner <> (SELECT oid FROM pg_roles WHERE rolname = 'app_owner')
) AS runtime_overlay_app_owner_handoff_complete
\gset

\if :runtime_overlay_app_owner_handoff_complete
\else
\echo 'FATAL: protected runtime-overlay owner handoff did not converge.'
SELECT 1 / 0 AS runtime_overlay_app_owner_handoff_postcheck_abort;
\endif

\echo 'Protected runtime-overlay exact app_owner handoff complete.'
