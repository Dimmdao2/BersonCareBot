-- Exact owner handoff for protected runtime overlays after a --no-owner restore.
-- RETIRED FROM DEPLOY PATH: the dedicated app_seam_* owners now own these functions, so app_owner handoff would resurrect the retired contract.
--
-- pg_restore attributes existing functions to the target database owner. Three reviewed
-- overlays subsequently CREATE OR REPLACE their SECURITY DEFINER functions under SET ROLE
-- app_owner; PostgreSQL rejects replacement of an existing function unless app_owner already owns
-- it. A function absent before its exact overlay is valid because that overlay creates it. Keep
-- this artifact exact and fail closed only for an existing target owned by an unexpected role.

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
    ('app.email_otp_public_consume_latest_challenge(text,text)'),
    ('app.resolve_public_booking_organization(uuid,uuid)'),
    ('app.resolve_public_organization_by_slug(text)'),
    ('app.resolve_payment_webhook_organization(text,text,text)')
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

WITH exact_targets(signature) AS (
  VALUES
    ('app.get_web_push_vapid_public_key()'),
    ('app.email_otp_public_consume_latest_challenge(text,text)'),
    ('app.resolve_public_booking_organization(uuid,uuid)'),
    ('app.resolve_public_organization_by_slug(text)'),
    ('app.resolve_payment_webhook_organization(text,text,text)')
)
SELECT format('ALTER FUNCTION %s OWNER TO app_owner', procedure.oid::regprocedure)
FROM exact_targets AS target
JOIN pg_proc AS procedure ON procedure.oid = to_regprocedure(target.signature)
ORDER BY target.signature
\gexec

WITH exact_targets(signature) AS (
  VALUES
    ('app.get_web_push_vapid_public_key()'),
    ('app.email_otp_public_consume_latest_challenge(text,text)'),
    ('app.resolve_public_booking_organization(uuid,uuid)'),
    ('app.resolve_public_organization_by_slug(text)'),
    ('app.resolve_payment_webhook_organization(text,text,text)')
)
SELECT NOT EXISTS (
  SELECT 1
  FROM exact_targets AS target
  JOIN pg_proc AS procedure ON procedure.oid = to_regprocedure(target.signature)
  WHERE procedure.proowner <> (SELECT oid FROM pg_roles WHERE rolname = 'app_owner')
) AS runtime_overlay_app_owner_handoff_existing_targets_owned
\gset

\if :runtime_overlay_app_owner_handoff_existing_targets_owned
\else
\echo 'FATAL: an existing protected runtime-overlay function was not handed to app_owner.'
SELECT 1 / 0 AS runtime_overlay_app_owner_handoff_postcheck_abort;
\endif

\echo 'Existing protected runtime-overlay functions handed to app_owner; absent targets remain for their exact overlays.'
